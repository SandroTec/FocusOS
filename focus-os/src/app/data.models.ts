export type FocusCategory = 'Learning' | 'Project' | 'Deep Work';
export type ProjectStatus = 'Active' | 'Paused' | 'Completed';

export interface FocusSession {
  id: string;
  title: string;
  category: FocusCategory;
  projectId?: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  rating: number;
  notes: string;
}

export interface SportEntry {
  id: string;
  sport: string;
  durationMinutes: number;
  date: string;
  intensity: number;
  notes: string;
}

export interface Habit { id: string; name: string; color: string; archived: boolean; createdAt: string; }
export interface HabitCompletion { id: string; habitId: string; date: string; }
export interface Project { id: string; name: string; description: string; color: string; status: ProjectStatus; createdAt: string; }
export interface WeeklyGoal { id: string; label: string; targetMinutes: number; category: FocusCategory | 'Sports' | 'Habits'; }

export interface FocusTimerState {
  status: 'idle' | 'running' | 'paused';
  title: string;
  category: FocusCategory;
  projectId: string;
  beganAt: number | null;
  startedAt: number | null;
  elapsedMs: number;
}

export interface AppData {
  sessions: FocusSession[];
  sports: SportEntry[];
  habits: Habit[];
  completions: HabitCompletion[];
  projects: Project[];
  goals: WeeklyGoal[];
  timer: FocusTimerState;
}

export const emptyAppData = (): AppData => ({
  sessions: [], sports: [], habits: [], completions: [], projects: [], goals: [
    { id: 'goal-focus', label: 'Deep work', targetMinutes: 1200, category: 'Deep Work' },
    { id: 'goal-learning', label: 'Learning', targetMinutes: 300, category: 'Learning' },
    { id: 'goal-sport', label: 'Movement', targetMinutes: 180, category: 'Sports' },
  ],
  timer: { status: 'idle', title: '', category: 'Deep Work', projectId: '', beganAt: null, startedAt: null, elapsedMs: 0 },
});

export const localDateKey = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const weekStart = (date = new Date()): Date => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
};
