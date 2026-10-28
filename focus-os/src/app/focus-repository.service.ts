import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  AppData, emptyAppData, FocusSession, Habit, PendingFocusSession,
  SPORTS_HABIT_ID, SportEntry,
} from './data.models';
import { SupabaseClientService } from './supabase-client.service';

type TableName = 'focus_sessions' | 'projects' | 'habits' | 'habit_completions' | 'sports' | 'weekly_goals';
type Row = Record<string, any>;
type LoadedData = { data: AppData; isEmpty: boolean };

/** Persists FocusOS records in user-scoped Supabase tables. */
@Injectable({ providedIn: 'root' })
export class FocusRepository {
  private readonly client: SupabaseClient | null;

  constructor(supabase: SupabaseClientService) { this.client = supabase.client; }

  /** Loads all records owned by one authenticated user. */
  async load(userId: string): Promise<LoadedData> {
    const [sessions, projects, habits, completions, sports, goals, state] = await Promise.all([
      this.read('focus_sessions', userId), this.read('projects', userId), this.read('habits', userId),
      this.read('habit_completions', userId), this.read('sports', userId),
      this.read('weekly_goals', userId), this.readState(userId),
    ]);
    const data = this.toAppData({ sessions, projects, habits, completions, sports, goals, state });
    const isEmpty = !sessions.length && !projects.length && !habits.length
      && !completions.length && !sports.length;
    await this.persistDefaults(userId, state, data);
    return { data, isEmpty };
  }

  /** Persists only rows changed by a FocusOS store operation. */
  async saveDiff(before: AppData, after: AppData, userId: string): Promise<void> {
    if (await this.saveFinishedTimer(before, after, userId)) return;
    await this.upsertChanges('projects', before.projects, after.projects, userId, this.projectRow);
    await this.upsertChanges('sports', before.sports, after.sports, userId, this.sportRow);
    await this.upsertChanges('habits', before.habits, after.habits, userId, this.habitRow);
    await this.upsertChanges('focus_sessions', before.sessions, after.sessions, userId, this.sessionRow);
    await this.upsertChanges('weekly_goals', before.goals, after.goals, userId, this.goalRow);
    await this.upsertChanges('habit_completions', before.completions, after.completions, userId, this.completionRow);
    await this.deleteMissing('habit_completions', before.completions, after.completions, userId);
    await this.deleteMissing('focus_sessions', before.sessions, after.sessions, userId);
    await this.deleteMissing('sports', before.sports, after.sports, userId);
    await this.deleteMissing('projects', before.projects, after.projects, userId);
    await this.deleteMissing('habits', before.habits, after.habits, userId);
    await this.deleteMissing('weekly_goals', before.goals, after.goals, userId);
    await this.saveTimer(before, after, userId);
  }

  /** Atomically saves a finished timer session and resets its timer row. */
  private async saveFinishedTimer(before: AppData, after: AppData, userId: string): Promise<boolean> {
    const added = after.sessions.filter(session => !before.sessions.some(item => item.id === session.id));
    if (before.timer.status === 'idle' || after.timer.status !== 'idle' || added.length !== 1 || added[0].rating !== 0) return false;
    const { error } = await this.db.rpc('finish_focus_session', {
      session_record: this.sessionRow(added[0], userId),
      timer_record: this.timerRow(after.timer, userId),
    });
    if (error) throw error;
    return true;
  }

  /** Imports a user's legacy browser data in one database transaction. */
  async importData(data: AppData): Promise<void> {
    const { error } = await this.db.rpc('import_focusos_data', { payload: this.importPayload(data) });
    if (error) throw error;
  }

  /** Reads one RLS-protected user table. */
  private async read(table: TableName, userId: string): Promise<Row[]> {
    const { data, error } = await this.db.from(table).select('*').eq('user_id', userId);
    if (error) throw error;
    return data ?? [];
  }

  /** Reads the user's single persisted timer row. */
  private async readState(userId: string): Promise<Row | null> {
    const { data, error } = await this.db.from('user_state').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Maps database rows into the existing FocusOS view model. */
  private toAppData(rows: Record<string, Row[] | Row | null>): AppData {
    const defaults = emptyAppData();
    const sessions = this.rows(rows['sessions']).map(this.sessionModel);
    const timerRow = rows['state'] as Row | null;
    const data: AppData = {
      sessions,
      pendingSession: this.pendingSession(sessions),
      projects: this.rows(rows['projects']).map(this.projectModel),
      habits: this.ensureSportsHabit(this.rows(rows['habits']).map(this.habitModel), this.rows(rows['sports']).length),
      completions: this.rows(rows['completions']).map(this.completionModel),
      sports: this.rows(rows['sports']).map(this.sportModel),
      goals: this.rows(rows['goals']).length ? this.rows(rows['goals']).map(this.goalModel) : defaults.goals,
      timer: timerRow ? this.timerModel(timerRow) : defaults.timer,
    };
    return data;
  }

  /** Converts a raw database result into an array of rows. */
  private rows(value: Row[] | Row | null | undefined): Row[] { return Array.isArray(value) ? value : []; }

  /** Builds the single pending review from unrated session rows. */
  private pendingSession(sessions: FocusSession[]): PendingFocusSession | null {
    const session = sessions.find(item => item.rating === 0);
    if (!session) return null;
    const { rating: _rating, ...pending } = session;
    return pending;
  }

  /** Adds the generated sports habit when historical workouts exist. */
  private ensureSportsHabit(habits: Habit[], sportCount: number): Habit[] {
    if (!sportCount) return habits;
    if (habits.some(habit => habit.id === SPORTS_HABIT_ID)) {
      return habits.map(habit => habit.id === SPORTS_HABIT_ID ? { ...habit, name: 'Sport' } : habit);
    }
    return [...habits, { id: SPORTS_HABIT_ID, name: 'Sport', color: 'orange', archived: false, createdAt: new Date().toISOString().slice(0, 10) }];
  }

  /** Creates default rows missing from a newly created account. */
  private async persistDefaults(userId: string, state: Row | null, data: AppData): Promise<void> {
    if (!state) {
      const { error } = await this.db.from('user_state').upsert(this.timerRow(data.timer, userId));
      if (error) throw error;
    }
  }

  /** Writes new and changed records from one collection. */
  private async upsertChanges<T extends { id: string }>(table: TableName, before: T[], after: T[], userId: string, map: (value: T, owner: string) => Row): Promise<void> {
    const oldItems = new Map(before.map(item => [item.id, JSON.stringify(item)]));
    const changed = after.filter(item => oldItems.get(item.id) !== JSON.stringify(item));
    await this.upsert(table, changed.map(item => map(item, userId)));
  }

  /** Removes records that disappeared from one collection. */
  private async deleteMissing<T extends { id: string }>(table: TableName, before: T[], after: T[], userId: string): Promise<void> {
    const nextIds = new Set(after.map(item => item.id));
    const deleted = before.filter(item => !nextIds.has(item.id)).map(item => item.id);
    if (deleted.length) await this.deleteRows(table, userId, deleted);
  }

  /** Writes a batch with the user-scoped composite conflict target. */
  private async upsert(table: TableName, rows: Row[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await this.db.from(table).upsert(rows, { onConflict: 'user_id,id' });
    if (error) throw error;
  }

  /** Deletes only the selected records belonging to the active user. */
  private async deleteRows(table: TableName, userId: string, ids: string[]): Promise<void> {
    const { error } = await this.db.from(table).delete().eq('user_id', userId).in('id', ids);
    if (error) throw error;
  }

  /** Saves a changed timer state to the user's singleton row. */
  private async saveTimer(before: AppData, after: AppData, userId: string): Promise<void> {
    if (JSON.stringify(before.timer) === JSON.stringify(after.timer)) return;
    const { error } = await this.db.from('user_state').upsert(this.timerRow(after.timer, userId));
    if (error) throw error;
  }

  /** Converts a project to its database column names. */
  private projectRow = (item: AppData['projects'][number], user_id: string): Row => ({ id: item.id, user_id, name: item.name, description: item.description, color: item.color, status: item.status, created_at: item.createdAt });
  /** Converts a habit to its database column names. */
  private habitRow = (item: AppData['habits'][number], user_id: string): Row => ({ id: item.id, user_id, name: item.name, color: item.color, archived: item.archived, created_at: item.createdAt });
  /** Converts a session to its database column names. */
  private sessionRow = (item: FocusSession, user_id: string): Row => {
    const { projectId, startAt, endAt, durationMinutes, durationSeconds, isDeepWork, ...fields } = item;
    return { ...fields, user_id, is_deep_work: isDeepWork, project_id: projectId ?? null, start_at: startAt, end_at: endAt,
      duration_minutes: durationMinutes, duration_seconds: durationSeconds ?? null };
  };
  /** Converts a workout to its database column names. */
  private sportRow = (item: SportEntry, user_id: string): Row => {
    const { durationMinutes, ...fields } = item;
    return { ...fields, user_id, duration_minutes: durationMinutes };
  };
  /** Converts a habit completion to its database column names. */
  private completionRow = (item: AppData['completions'][number], user_id: string): Row => {
    const { habitId, ...fields } = item;
    return { ...fields, user_id, habit_id: habitId };
  };
  /** Converts a weekly target to its database column names. */
  private goalRow = (item: AppData['goals'][number], user_id: string): Row => {
    const { targetMinutes, ...fields } = item;
    return { ...fields, user_id, target_minutes: targetMinutes };
  };

  /** Returns the configured client or reports the missing setup. */
  private get db(): SupabaseClient {
    if (!this.client) throw new Error('Supabase URL and publishable key are not configured.');
    return this.client;
  }

  /** Converts a timer to its user-state database row. */
  private timerRow(timer: AppData['timer'], user_id: string): Row {
    return { user_id, timer_status: timer.status, title: timer.title, category: timer.category,
      timer_is_deep_work: timer.isDeepWork, project_id: timer.projectId || null, began_at: timer.beganAt, started_at: timer.startedAt,
      elapsed_ms: timer.elapsedMs };
  }

  /** Maps database fields to a focus session model. */
  private sessionModel = (row: Row): FocusSession => ({ id: row['id'], title: row['title'], category: row['category'], isDeepWork: Boolean(row['is_deep_work']), projectId: row['project_id'] ?? undefined, startAt: row['start_at'], endAt: row['end_at'], durationMinutes: Number(row['duration_minutes']), durationSeconds: row['duration_seconds'] === null ? undefined : Number(row['duration_seconds']), rating: Number(row['rating']), notes: row['notes'] });
  /** Maps database fields to a project model. */
  private projectModel = (row: Row): AppData['projects'][number] => ({ id: row['id'], name: row['name'], description: row['description'], color: row['color'], status: row['status'], createdAt: row['created_at'] });
  /** Maps database fields to a habit model. */
  private habitModel = (row: Row): AppData['habits'][number] => ({ id: row['id'], name: row['id'] === SPORTS_HABIT_ID ? 'Sport' : row['name'], color: row['color'], archived: row['archived'], createdAt: row['created_at'] });
  /** Maps database fields to a completion model. */
  private completionModel = (row: Row): AppData['completions'][number] => ({ id: row['id'], habitId: row['habit_id'], date: row['date'] });
  /** Maps database fields to a workout model. */
  private sportModel = (row: Row): SportEntry => ({ id: row['id'], sport: row['sport'], durationMinutes: Number(row['duration_minutes']), date: row['date'], intensity: Number(row['intensity']), notes: row['notes'] });
  /** Maps database fields to a weekly target model. */
  private goalModel = (row: Row): AppData['goals'][number] => ({ id: row['id'], label: row['label'], targetMinutes: Number(row['target_minutes']), category: row['category'] });
  /** Maps the singleton database row to the timer model. */
  private timerModel(row: Row): AppData['timer'] { return { status: row['timer_status'], title: row['title'], category: row['category'], isDeepWork: Boolean(row['timer_is_deep_work']), projectId: row['project_id'] ?? '', beganAt: row['began_at'], startedAt: row['started_at'], elapsedMs: Number(row['elapsed_ms']) }; }

  /** Converts application data into the atomic import RPC format. */
  private importPayload(data: AppData): Row {
    return {
      projects: data.projects.map(item => ({ id: item.id, name: item.name, description: item.description, color: item.color, status: item.status, created_at: item.createdAt })),
      habits: data.habits.map(item => ({ id: item.id, name: item.name, color: item.color, archived: item.archived, created_at: item.createdAt })),
      sessions: data.sessions.map(item => ({ id: item.id, title: item.title, category: item.category, is_deep_work: item.isDeepWork, project_id: item.projectId ?? null, start_at: item.startAt, end_at: item.endAt, duration_minutes: item.durationMinutes, duration_seconds: item.durationSeconds ?? null, rating: item.rating, notes: item.notes })),
      sports: data.sports.map(item => ({ id: item.id, sport: item.sport, duration_minutes: item.durationMinutes, date: item.date, intensity: item.intensity, notes: item.notes })),
      completions: data.completions.map(item => ({ id: item.id, habit_id: item.habitId, date: item.date })),
      goals: data.goals.map(item => ({ id: item.id, label: item.label, target_minutes: item.targetMinutes, category: item.category })),
      timer: this.timerRow(data.timer, ''),
    };
  }
}
