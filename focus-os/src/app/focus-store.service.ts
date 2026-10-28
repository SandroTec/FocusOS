import { effect, Injectable, signal } from '@angular/core';
import { AppData, emptyAppData, FocusCategory, FocusSession, FocusTimerState,
  Habit, HabitCompletion, PendingFocusSession, Project, ProjectStatus,
  SPORTS_HABIT_ID, SportEntry, WeeklyGoal } from './data.models';
import { AuthService } from './auth.service';
import { FocusRepository } from './focus-repository.service';

const STORAGE_KEY = 'focusos.data.v1';
const IMPORT_DONE_KEY = 'focusos.local-import.complete';
const IMPORT_SKIP_PREFIX = 'focusos.local-import.skip.';

/** Creates an identifier compatible with existing browser records. */
const newId = (): string => globalThis.crypto?.randomUUID?.() ?? Date.now() + '-' + Math.random().toString(36).slice(2);
/** Checks whether an unknown value is a plain record. */
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
/** Checks whether a stored field is a string. */
const hasString = (row: Record<string, unknown>, key: string): boolean => typeof row[key] === 'string';
/** Checks whether a stored field contains a parseable date. */
const hasDate = (row: Record<string, unknown>, key: string): boolean => hasString(row, key) && Number.isFinite(Date.parse(String(row[key])));
/** Checks whether a value is a supported focus category. */
const hasCategory = (row: Record<string, unknown>): boolean => ['Learning', 'Project', 'Other', 'Deep Work'].includes(String(row['category']));
/** Filters an array with a type guard. */
const validItems = <T>(value: unknown, guard: (item: unknown) => item is T): T[] => Array.isArray(value) ? value.filter(guard) : [];

/** Validates one legacy focus session. */
function isSession(value: unknown): value is FocusSession {
  if (!isObject(value)) return false;
  return hasString(value, 'id') && hasString(value, 'title') && hasCategory(value)
    && hasDate(value, 'startAt') && hasDate(value, 'endAt')
    && typeof value['durationMinutes'] === 'number' && value['durationMinutes'] >= 0
    && typeof value['rating'] === 'number' && value['rating'] >= 0 && value['rating'] <= 5
    && hasString(value, 'notes');
}

/** Converts an old exclusive Deep Work category into orthogonal fields. */
function normalizeSession(session: FocusSession): FocusSession {
  const legacyDeepWork = (session.category as string) === 'Deep Work';
  return { ...session, category: legacyDeepWork ? (session.projectId ? 'Project' : 'Other') : session.category,
    isDeepWork: session.isDeepWork ?? legacyDeepWork };
}

/** Migrates a stored pending review without assigning its rating early. */
function normalizePending(session: PendingFocusSession): PendingFocusSession {
  const legacyDeepWork = (session.category as string) === 'Deep Work';
  return { ...session, category: legacyDeepWork ? (session.projectId ? 'Project' : 'Other') : session.category,
    isDeepWork: session.isDeepWork ?? legacyDeepWork };
}

/** Converts an old timer category into the new activity-area model. */
function normalizeTimer(timer: FocusTimerState): FocusTimerState {
  const legacyDeepWork = (timer.category as string) === 'Deep Work';
  return { ...timer, category: legacyDeepWork ? (timer.projectId ? 'Project' : 'Other') : timer.category,
    isDeepWork: timer.isDeepWork ?? legacyDeepWork };
}

/** Validates one legacy pending focus review. */
function isPending(value: unknown): value is PendingFocusSession {
  if (!isObject(value)) return false;
  return hasString(value, 'id') && hasString(value, 'title') && hasCategory(value)
    && hasDate(value, 'startAt') && hasDate(value, 'endAt')
    && typeof value['durationMinutes'] === 'number' && value['durationMinutes'] >= 0
    && hasString(value, 'notes');
}

/** Validates one legacy sports record. */
function isSport(value: unknown): value is SportEntry {
  if (!isObject(value)) return false;
  return hasString(value, 'id') && hasString(value, 'sport') && hasDate(value, 'date')
    && typeof value['durationMinutes'] === 'number' && value['durationMinutes'] > 0
    && typeof value['intensity'] === 'number' && value['intensity'] >= 1 && value['intensity'] <= 5
    && hasString(value, 'notes');
}

/** Validates one legacy habit. */
function isHabit(value: unknown): value is Habit {
  return isObject(value) && hasString(value, 'id') && hasString(value, 'name')
    && hasString(value, 'color') && typeof value['archived'] === 'boolean' && hasString(value, 'createdAt');
}

/** Validates one legacy habit completion. */
function isCompletion(value: unknown): value is HabitCompletion {
  return isObject(value) && hasString(value, 'id') && hasString(value, 'habitId')
    && hasString(value, 'date') && /^\d{4}-\d{2}-\d{2}$/.test(String(value['date']));
}

/** Validates one legacy project. */
function isProject(value: unknown): value is Project {
  return isObject(value) && hasString(value, 'id') && hasString(value, 'name')
    && hasString(value, 'description') && hasString(value, 'color')
    && ['Active', 'Paused', 'Completed'].includes(String(value['status'])) && hasString(value, 'createdAt');
}

/** Validates one legacy weekly goal. */
function isGoal(value: unknown): value is WeeklyGoal {
  return isObject(value) && hasString(value, 'id') && hasString(value, 'label')
    && typeof value['targetMinutes'] === 'number' && value['targetMinutes'] > 0
    && ['Learning', 'Project', 'Deep Work', 'Sports', 'Habits'].includes(String(value['category']));
}

/** Validates legacy timer state before migration. */
function isTimer(value: unknown): value is FocusTimerState {
  return isObject(value) && ['idle', 'running', 'paused'].includes(String(value['status']))
    && hasString(value, 'title') && hasCategory(value) && hasString(value, 'projectId')
    && typeof value['elapsedMs'] === 'number' && Number.isFinite(value['elapsedMs']) && value['elapsedMs'] >= 0
    && (value['startedAt'] === null || typeof value['startedAt'] === 'number')
    && (value['beganAt'] === null || typeof value['beganAt'] === 'number');
}

/** Parses the existing browser snapshot into validated FocusOS data. */
export function parseLegacyData(value: unknown): AppData | null {
  if (!isObject(value)) return null;
  const defaults = emptyAppData();
  const sports = validItems(value['sports'], isSport);
  const habits = validItems(value['habits'], isHabit);
  const allSessions = validItems(value['sessions'], isSession).map(normalizeSession);
  const pending = isPending(value['pendingSession']) ? normalizePending(value['pendingSession']) : null;
  const sessions = pending && !allSessions.some(item => item.id === pending.id)
    ? [{ ...pending, rating: 0 }, ...allSessions]
    : allSessions;
  return {
    sessions,
    pendingSession: pending ?? pendingFrom(sessions),
    sports,
    habits: withSportsHabit(habits, sports),
    completions: validItems(value['completions'], isCompletion),
    projects: validItems(value['projects'], isProject),
    goals: Array.isArray(value['goals']) ? validItems(value['goals'], isGoal) : defaults.goals,
    timer: isTimer(value['timer']) ? normalizeTimer(value['timer']) : defaults.timer,
  };
}

/** Adds the generated sports habit to data that already contains workouts. */
function withSportsHabit(habits: Habit[], sports: SportEntry[]): Habit[] {
  if (!sports.length) return habits;
  if (habits.some(habit => habit.id === SPORTS_HABIT_ID)) {
    return habits.map(habit => habit.id === SPORTS_HABIT_ID ? { ...habit, name: 'Sport' } : habit);
  }
  return [...habits, { id: SPORTS_HABIT_ID, name: 'Sport', color: 'orange', archived: false, createdAt: new Date().toISOString().slice(0, 10) }];
}

/** Derives the pending review from an unrated session. */
function pendingFrom(sessions: FocusSession[]): PendingFocusSession | null {
  const session = sessions.find(item => item.rating === 0);
  if (!session) return null;
  const { rating: _rating, ...pending } = session;
  return pending;
}

/** Owns authenticated user data, timer behavior, and one-time local import. */
@Injectable({ providedIn: 'root' })
export class FocusStore {
  readonly data = signal<AppData>(emptyAppData());
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly importPrompt = signal<AppData | null>(null);
  private activeUserId: string | null | undefined;
  private loadVersion = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly auth: AuthService, private readonly repository: FocusRepository) {
    effect(() => this.onAuthReady(this.auth.ready(), this.auth.user()?.id ?? null));
  }

  /** Clears an error message shown by the application shell. */
  clearError(): void { this.error.set(''); }

  /** Accepts the displayed legacy-data import and removes its browser copy on success. */
  async importLegacyData(): Promise<void> {
    const data = this.importPrompt();
    const userId = this.activeUserId;
    if (!data || !userId) return;
    this.saving.set(true);
    try {
      await this.repository.importData(data);
      this.data.set(data);
      this.importPrompt.set(null);
      this.clearLegacyStorage();
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.saving.set(false); }
  }

  /** Defers importing the existing local snapshot for this account. */
  skipLegacyImport(): void {
    const userId = this.activeUserId;
    try { if (userId) localStorage.setItem(IMPORT_SKIP_PREFIX + userId, 'true'); }
    catch { this.error.set('This browser could not remember your import choice.'); }
    this.importPrompt.set(null);
  }

  /** Starts a new timed focus session. */
  startTimer(title: string, category: FocusCategory, projectId = '', isDeepWork = false): Promise<boolean> {
    const now = Date.now();
    const timer: FocusTimerState = { status: 'running', title: title.trim(), category, projectId, isDeepWork, beganAt: now, startedAt: now, elapsedMs: 0 };
    return this.update(data => ({ ...data, timer }));
  }

  /** Pauses the timer and accumulates elapsed time. */
  pauseTimer(): Promise<boolean> { return this.update(data => this.pauseState(data)); }

  /** Resumes a paused timer from the current timestamp. */
  resumeTimer(): Promise<boolean> {
    return this.update(data => data.timer.status === 'paused'
      ? { ...data, timer: { ...data.timer, status: 'running', startedAt: Date.now() } }
      : data);
  }

  /** Saves the timer as a session awaiting a rating. */
  stopTimer(): Promise<boolean> {
    return this.update(data => {
      if (data.timer.status === 'idle') return data;
      const session = this.createTimerSession(data.timer);
      return { ...data, sessions: [session, ...data.sessions], pendingSession: pendingFrom([session]), timer: emptyAppData().timer };
    });
  }

  /** Saves a required rating and notes for the pending timer session. */
  savePendingSession(rating: number, notes: string): Promise<boolean> {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return Promise.resolve(false);
    return this.update(data => {
      if (!data.pendingSession) return data;
      const sessions = data.sessions.map(item => item.id === data.pendingSession?.id
        ? { ...item, rating, notes: notes.trim() } : item);
      return this.withPending({ ...data, sessions });
    });
  }

  /** Adds a manually entered focus session. */
  addSession(input: Omit<FocusSession, 'id'>): Promise<boolean> {
    return this.update(data => this.withPending({ ...data, sessions: [{ ...input, id: newId() }, ...data.sessions] }));
  }

  /** Updates a saved focus session. */
  updateSession(session: FocusSession): Promise<boolean> {
    return this.update(data => this.withPending({ ...data, sessions: data.sessions.map(item => item.id === session.id ? session : item) }));
  }

  /** Deletes a focus session. */
  deleteSession(id: string): Promise<boolean> {
    return this.update(data => this.withPending({ ...data, sessions: data.sessions.filter(item => item.id !== id) }));
  }

  /** Adds a user-defined habit. */
  addHabit(name: string, color = 'mint'): Promise<boolean> {
    const habit: Habit = { id: newId(), name: name.trim(), color, archived: false, createdAt: this.today() };
    return habit.name ? this.update(data => ({ ...data, habits: [habit, ...data.habits] })) : Promise.resolve(false);
  }

  /** Toggles a habit completion for one local date. */
  toggleHabit(habitId: string, date = this.today()): Promise<boolean> {
    return this.update(data => this.toggleCompletion(data, habitId, date));
  }

  /** Archives or restores a user-defined habit. */
  archiveHabit(id: string): Promise<boolean> {
    if (id === SPORTS_HABIT_ID) return Promise.resolve(false);
    return this.update(data => ({ ...data, habits: data.habits.map(item => item.id === id ? { ...item, archived: !item.archived } : item) }));
  }

  /** Updates a user-defined habit's name and color. */
  updateHabit(id: string, name: string, color: string): Promise<boolean> {
    if (id === SPORTS_HABIT_ID || !name.trim()) return Promise.resolve(false);
    return this.update(data => ({ ...data, habits: data.habits.map(item => item.id === id ? { ...item, name: name.trim(), color } : item) }));
  }

  /** Adds a workout and ensures the derived sports habit exists. */
  addSport(input: Omit<SportEntry, 'id'>): Promise<boolean> {
    return this.update(data => {
      const sports = [{ ...input, id: newId() }, ...data.sports];
      return { ...data, sports, habits: withSportsHabit(data.habits, sports) };
    });
  }

  /** Updates a workout record. */
  updateSport(entry: SportEntry): Promise<boolean> {
    return this.update(data => ({ ...data, sports: data.sports.map(item => item.id === entry.id ? entry : item) }));
  }

  /** Deletes a workout record. */
  deleteSport(id: string): Promise<boolean> {
    return this.update(data => ({ ...data, sports: data.sports.filter(item => item.id !== id) }));
  }

  /** Adds an active project. */
  addProject(name: string, description: string, color: string): Promise<boolean> {
    const project = this.createProject(name, description, color);
    return project.name ? this.update(data => ({ ...data, projects: [project, ...data.projects] })) : Promise.resolve(false);
  }

  /** Replaces an existing project. */
  updateProject(project: Project): Promise<boolean> {
    return this.update(data => ({ ...data, projects: data.projects.map(item => item.id === project.id ? project : item) }));
  }

  /** Changes the status of an existing project. */
  updateProjectStatus(id: string, status: ProjectStatus): Promise<boolean> {
    return this.update(data => ({ ...data, projects: data.projects.map(item => item.id === id ? { ...item, status } : item) }));
  }

  /** Deletes a project and removes its session and timer references. */
  deleteProject(id: string): Promise<boolean> {
    return this.update(data => ({
      ...data,
      projects: data.projects.filter(item => item.id !== id),
      sessions: data.sessions.map(item => item.projectId === id ? { ...item, projectId: undefined } : item),
      pendingSession: this.unlinkProject(data.pendingSession, id),
      timer: data.timer.projectId === id ? { ...data.timer, projectId: '' } : data.timer,
    }));
  }

  /** Applies a state reducer after saving its database changes successfully. */
  private update(change: (data: AppData) => AppData): Promise<boolean> {
    const result = this.queue.then(() => this.persistUpdate(change));
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  /** Runs one queued mutation and retains the old state after failures. */
  private async persistUpdate(change: (data: AppData) => AppData): Promise<boolean> {
    const userId = this.activeUserId;
    if (!userId || this.loading()) return false;
    const before = this.data();
    const after = this.withPending(change(before));
    this.saving.set(true);
    this.error.set('');
    try {
      await this.repository.saveDiff(before, after, userId);
      if (userId !== this.activeUserId) return false;
      this.data.set(after);
      return true;
    } catch (error) { this.error.set(this.message(error)); return false; }
    finally { this.saving.set(false); }
  }

  /** Starts or clears a user-specific data load when auth changes. */
  private onAuthReady(ready: boolean, userId: string | null): void {
    if (!ready || userId === this.activeUserId) return;
    this.activeUserId = userId;
    void this.loadUser(userId, ++this.loadVersion);
  }

  /** Loads a user's records and checks for a one-time legacy import. */
  private async loadUser(userId: string | null, version: number): Promise<void> {
    this.data.set(emptyAppData());
    this.importPrompt.set(null);
    this.error.set('');
    if (!userId) { this.loading.set(false); return; }
    this.loading.set(true);
    try {
      const loaded = await this.repository.load(userId);
      if (version !== this.loadVersion) return;
      this.data.set(loaded.data);
      this.offerLegacyImport(loaded.isEmpty, userId);
    } catch (error) { if (version === this.loadVersion) this.error.set(this.message(error)); }
    finally { if (version === this.loadVersion) this.loading.set(false); }
  }

  /** Offers local data only when the account is empty and user has not decided. */
  private offerLegacyImport(accountEmpty: boolean, userId: string): void {
    try {
      if (!accountEmpty || localStorage.getItem(IMPORT_DONE_KEY) || localStorage.getItem(IMPORT_SKIP_PREFIX + userId)) return;
    } catch { return; }
    const data = this.readLegacyData();
    if (data && this.hasLegacyRecords(data)) this.importPrompt.set(data);
  }

  /** Reads a valid legacy application snapshot from browser storage. */
  private readLegacyData(): AppData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? parseLegacyData(JSON.parse(raw)) : null;
    } catch { return null; }
  }

  /** Removes the migrated browser snapshot after its database commit. */
  private clearLegacyStorage(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(IMPORT_DONE_KEY, 'true');
    } catch { this.error.set('Your data was imported, but browser storage could not be cleared.'); }
  }

  /** Checks whether the legacy snapshot contains user-created data. */
  private hasLegacyRecords(data: AppData): boolean {
    return Boolean(data.sessions.length || data.projects.length || data.habits.length
      || data.sports.length || data.completions.length || data.timer.status !== 'idle');
  }

  /** Adds user context and default review state to an application snapshot. */
  private withPending(data: AppData): AppData { return { ...data, pendingSession: pendingFrom(data.sessions) }; }

  /** Builds the paused state of a currently running timer. */
  private pauseState(data: AppData): AppData {
    const timer = data.timer;
    if (timer.status !== 'running' || timer.startedAt === null) return data;
    return { ...data, timer: { ...timer, status: 'paused', elapsedMs: timer.elapsedMs + Date.now() - timer.startedAt, startedAt: null } };
  }

  /** Creates a persisted focus session from elapsed timer time. */
  private createTimerSession(timer: FocusTimerState): FocusSession {
    const elapsed = timer.elapsedMs + (timer.status === 'running' && timer.startedAt ? Date.now() - timer.startedAt : 0);
    const durationSeconds = Math.floor(elapsed / 1000);
    const end = new Date();
    const start = new Date(timer.beganAt ?? end.getTime() - elapsed);
    return { id: newId(), title: timer.title || 'Focus session', category: timer.category, isDeepWork: timer.isDeepWork,
      ...(timer.projectId ? { projectId: timer.projectId } : {}), startAt: start.toISOString(),
      endAt: end.toISOString(), durationMinutes: durationSeconds / 60, durationSeconds, rating: 0, notes: '' };
  }

  /** Adds or removes a unique habit completion. */
  private toggleCompletion(data: AppData, habitId: string, date: string): AppData {
    const exists = data.completions.some(item => item.habitId === habitId && item.date === date);
    const completions = exists ? data.completions.filter(item => item.habitId !== habitId || item.date !== date)
      : [...data.completions, { id: newId(), habitId, date }];
    return { ...data, completions };
  }

  /** Creates a normalized project record. */
  private createProject(name: string, description: string, color: string): Project {
    return { id: newId(), name: name.trim(), description: description.trim(), color,
      status: 'Active', createdAt: this.today() };
  }

  /** Removes a project reference from the pending session. */
  private unlinkProject(session: PendingFocusSession | null, id: string): PendingFocusSession | null {
    if (!session || session.projectId !== id) return session;
    const { projectId: _projectId, ...unlinked } = session;
    return unlinked;
  }

  /** Returns a local date key for records created today. */
  private today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  /** Converts database and browser failures to a readable message. */
  private message(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'The request could not be completed. Check your connection and try again.';
  }
}
