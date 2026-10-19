import { Injectable, signal } from '@angular/core';
import { AppData, FocusCategory, FocusSession, FocusTimerState, Habit, HabitCompletion, Project, ProjectStatus, SportEntry, WeeklyGoal, emptyAppData, localDateKey } from './data.models';

const STORAGE_KEY = 'focusos.data.v1';
const newId = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isFocusSession = (value: unknown): value is FocusSession => {
  if (!isObject(value)) return false;
  return typeof value['id'] === 'string' && typeof value['title'] === 'string' && ['Learning', 'Project', 'Deep Work'].includes(String(value['category'])) && typeof value['startAt'] === 'string' && Number.isFinite(Date.parse(value['startAt'])) && typeof value['endAt'] === 'string' && Number.isFinite(Date.parse(value['endAt'])) && typeof value['durationMinutes'] === 'number' && value['durationMinutes'] >= 0 && typeof value['rating'] === 'number' && value['rating'] >= 1 && value['rating'] <= 5 && typeof value['notes'] === 'string';
};
const isSportEntry = (value: unknown): value is SportEntry => isObject(value) && typeof value['id'] === 'string' && typeof value['sport'] === 'string' && typeof value['durationMinutes'] === 'number' && value['durationMinutes'] > 0 && typeof value['date'] === 'string' && Number.isFinite(Date.parse(value['date'] + 'T12:00:00')) && typeof value['intensity'] === 'number' && value['intensity'] >= 1 && value['intensity'] <= 5 && typeof value['notes'] === 'string';
const isHabit = (value: unknown): value is Habit => isObject(value) && typeof value['id'] === 'string' && typeof value['name'] === 'string' && typeof value['color'] === 'string' && typeof value['archived'] === 'boolean' && typeof value['createdAt'] === 'string';
const isCompletion = (value: unknown): value is HabitCompletion => isObject(value) && typeof value['id'] === 'string' && typeof value['habitId'] === 'string' && typeof value['date'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value['date']);
const isProject = (value: unknown): value is Project => isObject(value) && typeof value['id'] === 'string' && typeof value['name'] === 'string' && typeof value['description'] === 'string' && typeof value['color'] === 'string' && ['Active', 'Paused', 'Completed'].includes(String(value['status'])) && typeof value['createdAt'] === 'string';
const isWeeklyGoal = (value: unknown): value is WeeklyGoal => isObject(value) && typeof value['id'] === 'string' && typeof value['label'] === 'string' && typeof value['targetMinutes'] === 'number' && value['targetMinutes'] > 0 && ['Learning', 'Project', 'Deep Work', 'Sports', 'Habits'].includes(String(value['category']));

@Injectable({ providedIn: 'root' })
export class FocusStore {
  readonly data = signal<AppData>(this.load());

  private load(): AppData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyAppData();
      const saved: unknown = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return emptyAppData();
      const candidate = saved as Partial<AppData>;
      const base = emptyAppData();
      return {
        ...base,
        ...candidate,
        sessions: Array.isArray(candidate.sessions) ? candidate.sessions.filter(isFocusSession) : [],
        sports: Array.isArray(candidate.sports) ? candidate.sports.filter(isSportEntry) : [],
        habits: Array.isArray(candidate.habits) ? candidate.habits.filter(isHabit) : [],
        completions: Array.isArray(candidate.completions) ? candidate.completions.filter(isCompletion) : [],
        projects: Array.isArray(candidate.projects) ? candidate.projects.filter(isProject) : [],
        goals: Array.isArray(candidate.goals) ? candidate.goals.filter(isWeeklyGoal) : base.goals,
        timer: this.isTimer(candidate.timer) ? candidate.timer : base.timer,
      };
    } catch {
      return emptyAppData();
    }
  }

  private isTimer(value: unknown): value is FocusTimerState {
    if (!isObject(value)) return false;
    return ['idle', 'running', 'paused'].includes(String(value['status'])) && typeof value['title'] === 'string' && ['Learning', 'Project', 'Deep Work'].includes(String(value['category'])) && typeof value['projectId'] === 'string' && typeof value['elapsedMs'] === 'number' && Number.isFinite(value['elapsedMs']) && value['elapsedMs'] >= 0 && (value['startedAt'] === null || (typeof value['startedAt'] === 'number' && Number.isFinite(value['startedAt']))) && (value['beganAt'] === null || value['beganAt'] === undefined || (typeof value['beganAt'] === 'number' && Number.isFinite(value['beganAt'])));
  }

  private commit(change: (current: AppData) => AppData): void {
    const next = change(this.data());
    this.data.set(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Keep the current session usable if storage is unavailable. */ }
  }

  addSession(input: Omit<FocusSession, 'id'>): void {
    this.commit(data => ({ ...data, sessions: [{ ...input, id: newId() }, ...data.sessions] }));
  }

  updateSession(session: FocusSession): void {
    this.commit(data => ({ ...data, sessions: data.sessions.map(item => item.id === session.id ? session : item) }));
  }

  deleteSession(id: string): void { this.commit(data => ({ ...data, sessions: data.sessions.filter(item => item.id !== id) })); }

  startTimer(title: string, category: FocusCategory, projectId = ''): void {
    const now = Date.now();
    const timer: FocusTimerState = { status: 'running', title: title.trim() || 'Focus session', category, projectId, beganAt: now, startedAt: now, elapsedMs: 0 };
    this.commit(data => ({ ...data, timer }));
  }

  pauseTimer(): void {
    this.commit(data => {
      if (data.timer.status !== 'running' || data.timer.startedAt === null) return data;
      return { ...data, timer: { ...data.timer, status: 'paused', elapsedMs: data.timer.elapsedMs + Date.now() - data.timer.startedAt, startedAt: null } };
    });
  }

  resumeTimer(): void {
    this.commit(data => data.timer.status !== 'paused' ? data : { ...data, timer: { ...data.timer, status: 'running', startedAt: Date.now() } });
  }

  stopTimer(rating = 3, notes = ''): void {
    this.commit(data => {
      const timer = data.timer;
      const durationMs = timer.elapsedMs + (timer.status === 'running' && timer.startedAt !== null ? Date.now() - timer.startedAt : 0);
      const minutes = Math.floor(durationMs / 60_000);
      if (minutes > 0) {
        const end = new Date();
        const start = new Date(timer.beganAt ?? end.getTime() - durationMs);
        const session: FocusSession = { id: newId(), title: timer.title || 'Focus session', category: timer.category, ...(timer.projectId ? { projectId: timer.projectId } : {}), startAt: start.toISOString(), endAt: end.toISOString(), durationMinutes: minutes, rating, notes };
        return { ...data, sessions: [session, ...data.sessions], timer: emptyAppData().timer };
      }
      return { ...data, timer: emptyAppData().timer };
    });
  }

  addHabit(name: string, color = 'mint'): void {
    const habit: Habit = { id: newId(), name: name.trim(), color, archived: false, createdAt: localDateKey() };
    if (habit.name) this.commit(data => ({ ...data, habits: [habit, ...data.habits] }));
  }

  toggleHabit(habitId: string, date = localDateKey()): void {
    this.commit(data => {
      const exists = data.completions.some(item => item.habitId === habitId && item.date === date);
      return { ...data, completions: exists ? data.completions.filter(item => !(item.habitId === habitId && item.date === date)) : [...data.completions, { id: newId(), habitId, date }] };
    });
  }

  archiveHabit(id: string): void { this.commit(data => ({ ...data, habits: data.habits.map(item => item.id === id ? { ...item, archived: !item.archived } : item) })); }
  updateHabit(id: string, name: string, color: string): void { this.commit(data => ({ ...data, habits: data.habits.map(item => item.id === id ? { ...item, name: name.trim(), color } : item) })); }

  addSport(input: Omit<SportEntry, 'id'>): void { this.commit(data => ({ ...data, sports: [{ ...input, id: newId() }, ...data.sports] })); }
  updateSport(entry: SportEntry): void { this.commit(data => ({ ...data, sports: data.sports.map(item => item.id === entry.id ? entry : item) })); }
  deleteSport(id: string): void { this.commit(data => ({ ...data, sports: data.sports.filter(item => item.id !== id) })); }

  addProject(name: string, description: string, color: string): void {
    const project: Project = { id: newId(), name: name.trim(), description: description.trim(), color, status: 'Active', createdAt: localDateKey() };
    if (project.name) this.commit(data => ({ ...data, projects: [project, ...data.projects] }));
  }

  updateProject(project: Project): void { this.commit(data => ({ ...data, projects: data.projects.map(item => item.id === project.id ? project : item) })); }
  updateProjectStatus(id: string, status: ProjectStatus): void { this.commit(data => ({ ...data, projects: data.projects.map(item => item.id === id ? { ...item, status } : item) })); }
  deleteProject(id: string): void { this.commit(data => ({ ...data, projects: data.projects.filter(item => item.id !== id), sessions: data.sessions.map(session => session.projectId === id ? { ...session, projectId: undefined } : session) })); }
}
