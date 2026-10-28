import { FocusCategory, FocusSession, Habit, HabitCompletion, SportEntry } from './data.models';

export type GoalDomain = 'focus' | 'sport' | 'habit';
export type GoalMetric = 'minutes' | 'sessions' | 'days' | 'completions';
export type GoalPeriod = 'week' | 'month';
export type GoalStatus = 'active' | 'paused' | 'archived';

export interface GoalFilters {
  focus_category?: FocusCategory;
  is_deep_work?: boolean;
  sport_name?: string;
  habit_id?: string;
}

export interface GoalVersion {
  id: string;
  revision: number;
  title: string;
  domain: GoalDomain;
  metric: GoalMetric;
  targetValue: number;
  period: GoalPeriod;
  filters: GoalFilters;
  effectiveFrom: string;
  effectiveUntil: string | null;
  timeZone: string;
}

export interface GoalDefinition {
  id: string;
  status: GoalStatus;
  createdAt: string;
  versions: GoalVersion[];
}

export interface GoalInput {
  title: string;
  domain: GoalDomain;
  metric: GoalMetric;
  targetValue: number;
  period: GoalPeriod;
  filters: GoalFilters;
  effectiveFrom: string;
  timeZone: string;
}

export interface GoalActivities {
  sessions: FocusSession[];
  sports: SportEntry[];
  habits: Habit[];
  completions: HabitCompletion[];
}

export interface GoalPeriodRange {
  start: string;
  endExclusive: string;
  label: string;
}

export interface GoalEvaluation {
  version: GoalVersion;
  range: GoalPeriodRange;
  value: number;
  remaining: number;
  percent: number;
  achieved: boolean;
}
