/** A mutually exclusive activity area for a focus session. */
export type FocusCategory = 'Learning' | 'Project' | 'Other';

/** The lifecycle state of a project. */
export type ProjectStatus = 'Active' | 'Paused' | 'Completed';

/** Stable identifier for the workout-derived habit. */
export const SPORTS_HABIT_ID = 'habit-sports-auto';

/** A completed, rated focus session persisted by the application. */
export interface FocusSession {
  id: string;
  title: string;
  category: FocusCategory;
  isDeepWork: boolean;
  projectId?: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  durationSeconds?: number;
  /** Zero indicates that the post-session rating has not been submitted yet. */
  rating: number;
  notes: string;
}

/** A finished timer session awaiting the user's rating. */
export type PendingFocusSession = Omit<FocusSession, 'rating'>;

/** A recorded workout or other physical activity. */
export interface SportEntry {
  id: string;
  sport: string;
  durationMinutes: number;
  date: string;
  intensity: number;
  notes: string;
}

/** A user-defined recurring habit. */
export interface Habit {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  createdAt: string;
}

/** A single completion of a habit on a local calendar date. */
export interface HabitCompletion {
  id: string;
  habitId: string;
  date: string;
}

/** A project that can be linked to focus sessions. */
export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  status: ProjectStatus;
  createdAt: string;
}

/** A configurable target for a weekly activity category. */
export interface WeeklyGoal {
  id: string;
  label: string;
  targetMinutes: number;
  category: FocusCategory | 'Deep Work' | 'Sports' | 'Habits';
}

/** Persisted timer state, measured using timestamps rather than interval counts. */
export interface FocusTimerState {
  status: 'idle' | 'running' | 'paused';
  title: string;
  category: FocusCategory;
  isDeepWork: boolean;
  projectId: string;
  beganAt: number | null;
  startedAt: number | null;
  elapsedMs: number;
}

/** The complete application state stored in the browser. */
export interface AppData {
  sessions: FocusSession[];
  pendingSession: PendingFocusSession | null;
  sports: SportEntry[];
  habits: Habit[];
  completions: HabitCompletion[];
  projects: Project[];
  goals: WeeklyGoal[];
  timer: FocusTimerState;
}

/** Creates the initial state and its default weekly targets. */
export const emptyAppData = (): AppData => ({
  sessions: [],
  pendingSession: null,
  sports: [],
  habits: [],
  completions: [],
  projects: [],
  goals: [
    { id: 'goal-focus', label: 'Deep work', targetMinutes: 1200, category: 'Deep Work' },
    { id: 'goal-learning', label: 'Learning', targetMinutes: 300, category: 'Learning' },
    { id: 'goal-sport', label: 'Movement', targetMinutes: 180, category: 'Sports' },
  ],
  timer: {
    status: 'idle',
    title: '',
    category: 'Other',
    isDeepWork: false,
    projectId: '',
    beganAt: null,
    startedAt: null,
    elapsedMs: 0,
  },
});

/**
 * Formats a date as a local YYYY-MM-DD key.
 * @param date Date to format; defaults to the current local date.
 */
export const localDateKey = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
};

/**
 * Returns local midnight on the Monday of the date's week.
 * @param date Date whose week should be resolved.
 */
export const weekStart = (date = new Date()): Date => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
};
