import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppData, FocusSession, localDateKey, SPORTS_HABIT_ID, weekStart } from './data.models';
import { FocusStore } from './focus-store.service';
import { evaluateGoal, goalValueLabel, periodRange, versionForPeriod } from './goal-evaluator';
import { GoalDefinition, GoalEvaluation, GoalMetric, GoalPeriod } from './goal.models';
import { GoalsStore } from './goals-store.service';

interface DashboardMetrics {
  sessions: FocusSession[];
  learning: number;
  projectMinutes: number;
  otherMinutes: number;
  weeklyMinutes: number;
  previous: number;
  sportCount: number;
  habitRate: number;
  daily: number[];
  goal: number;
  deepMinutes: number;
}

interface DashboardGoalProgress {
  id: string;
  title: string;
  domain: string;
  period: GoalPeriod;
  evaluation: GoalEvaluation;
}

/** Returns session records whose start times fall within a date range. */
function sessionsInRange(sessions: FocusSession[], start: Date, end: Date): FocusSession[] {
  const from = start.getTime();
  const until = end.getTime();
  return sessions.filter(session => {
    const timestamp = new Date(session.startAt).getTime();
    return timestamp >= from && timestamp < until;
  });
}

/** Adds the tracked minutes for a set of focus sessions. */
function totalMinutes(sessions: FocusSession[]): number {
  return sessions.reduce((total, session) => total + session.durationMinutes, 0);
}

/** Counts sports entries recorded within the selected week. */
function sportsInRange(data: AppData, start: Date, end: Date): number {
  return data.sports.filter(entry => {
    const date = new Date(`${entry.date}T12:00:00`).getTime();
    return date >= start.getTime() && date < end.getTime();
  }).length;
}

/** Calculates the completion percentage for active habits this week. */
function habitCompletionRate(data: AppData, start: Date, end: Date): number {
  const habits = data.habits.filter(habit => !habit.archived);
  if (!habits.length) return 0;
  const ids = new Set(habits.filter(habit => habit.id !== SPORTS_HABIT_ID).map(habit => habit.id));
  const completions = data.completions.filter(item => {
    const date = new Date(`${item.date}T12:00:00`).getTime();
    return ids.has(item.habitId) && date >= start.getTime() && date < end.getTime();
  }).length;
  const sportDays = habits.some(habit => habit.id === SPORTS_HABIT_ID)
    ? new Set(data.sports.filter(entry => {
      const date = new Date(`${entry.date}T12:00:00`).getTime();
      return date >= start.getTime() && date < end.getTime();
    }).map(entry => entry.date)).size
    : 0;
  return Math.round(Math.min(100, (completions + sportDays) / (habits.length * 7) * 100));
}

/** Calculates daily focus totals for a seven-day period. */
function dailyMinutes(sessions: FocusSession[], start: Date): number[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    const key = localDateKey(date);
    return totalMinutes(sessions.filter(session => localDateKey(new Date(session.startAt)) === key));
  });
}

/** Builds the dashboard metrics for the current and previous weeks. */
function buildMetrics(data: AppData, start: Date, deepGoal: number): DashboardMetrics {
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - 7);
  return summarizeMetrics(data, start, end, previousStart, deepGoal);
}

/** Collects the calculated values used by dashboard cards and charts. */
function summarizeMetrics(data: AppData, start: Date, end: Date, previousStart: Date, deepGoal: number): DashboardMetrics {
  const sessions = sessionsInRange(data.sessions, start, end);
  const previous = totalMinutes(sessionsInRange(data.sessions, previousStart, start));
  return {
    sessions,
    learning: totalMinutes(sessions.filter(item => item.category === 'Learning')),
    projectMinutes: totalMinutes(sessions.filter(item => item.category === 'Project')),
    otherMinutes: totalMinutes(sessions.filter(item => item.category === 'Other')),
    weeklyMinutes: totalMinutes(sessions),
    previous,
    sportCount: sportsInRange(data, start, end),
    habitRate: habitCompletionRate(data, start, end),
    daily: dailyMinutes(sessions, start),
    goal: deepGoal,
    deepMinutes: totalMinutes(sessions.filter(item => item.isDeepWork)),
  };
}

/** Returns the active weekly deep-work target, with legacy fallback. */
function deepWorkTarget(data: AppData, goals: GoalDefinition[]): number {
  for (const goal of goals.filter(item => item.status === 'active')) {
    const latest = goal.versions.at(-1);
    if (!latest) continue;
    const range = periodRange(latest.period, new Date(), latest.timeZone);
    const version = versionForPeriod(goal, range);
    if (version?.period === 'week' && version.domain === 'focus' && version.metric === 'minutes'
      && version.filters.is_deep_work === true && !version.filters.focus_category) return version.targetValue;
  }
  if (goals.length) return 0;
  return data.goals.find(item => item.category === 'Deep Work')?.targetMinutes ?? 0;
}

/** Presents weekly focus, habit, and activity analytics. */
@Component({ standalone: true, imports: [RouterLink], templateUrl: './dashboard-page.html' })
export class DashboardPage {
  private readonly store = inject(FocusStore);
  private readonly goalStore = inject(GoalsStore);
  protected readonly data = this.store.data;
  protected readonly today = new Date();
  protected readonly dateLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(this.today);
  protected readonly days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly activeHabits = computed(() => this.data().habits.filter(item => !item.archived));
  protected readonly startOfWeek = weekStart(this.today);
  protected readonly metrics = computed(() => buildMetrics(this.data(), this.startOfWeek, deepWorkTarget(this.data(), this.goalStore.goals())));
  protected readonly goalProgress = computed(() => this.currentGoalProgress());
  protected readonly insight = computed(() => this.buildInsight());

  /** Evaluates each active goal for its current calendar period. */
  private currentGoalProgress(): DashboardGoalProgress[] {
    return this.goalStore.goals().filter(goal => goal.status === 'active')
      .map(goal => this.evaluateCurrentGoal(goal)).filter((goal): goal is DashboardGoalProgress => goal !== null);
  }

  /** Calculates one active goal from the dashboard's saved activity records. */
  private evaluateCurrentGoal(goal: GoalDefinition): DashboardGoalProgress | null {
    const version = goal.versions.at(-1);
    if (!version) return null;
    const range = periodRange(version.period, this.today, version.timeZone);
    const current = versionForPeriod(goal, range);
    if (!current) return null;
    return { id: goal.id, title: current.title, domain: current.domain, period: current.period,
      evaluation: evaluateGoal(current, this.activities(), range) };
  }

  /** Supplies only source records consumed by the shared goal evaluator. */
  private activities() {
    const data = this.data();
    return { sessions: data.sessions, sports: data.sports, habits: data.habits, completions: data.completions };
  }

  /** Formats progress values with the same units used by the Goals page. */
  protected valueLabel(value: number, metric: GoalMetric): string { return goalValueLabel(value, metric); }

  /** Creates a short weekly insight based on recorded focus time. */
  private buildInsight(): string {
    const value = this.metrics();
    if (!value.sessions.length) return 'Log your first focus session to see a personal weekly insight here.';
    const bestDay = value.daily.indexOf(Math.max(...value.daily));
    return this.bestDayInsight(bestDay, value.deepMinutes, value.goal);
  }

  /** Describes progress toward the weekly deep work goal. */
  private bestDayInsight(bestDay: number, deepMinutes: number, goal: number): string {
    if (!goal) return `${this.days[bestDay]} is your most focused day so far. Set a weekly deep work goal to track your target.`;
    if (deepMinutes >= goal && goal > 0) {
      return `You reached your weekly deep work goal. ${this.days[bestDay]} was your most focused day.`;
    }
    const remaining = Math.round(Math.max(0, goal - deepMinutes));
    return `${this.days[bestDay]} is your most focused day so far. ${remaining} minutes remain toward your deep work goal.`;
  }

  /** Formats a duration in minutes as hours and minutes. */
  protected hours(minutes: number): string {
    if (minutes > 0 && minutes < 1) return '<1m';
    const total = Math.floor(minutes);
    return `${Math.floor(total / 60)}h ${total % 60}m`;
  }

  /** Builds a weekly category donut using the matching dashboard colors. */
  protected categoryChart(): string {
    const value = this.metrics();
    const total = value.weeklyMinutes;
    if (!total) return 'conic-gradient(#2b3036 0deg 360deg)';
    const projectEnd = value.projectMinutes / total * 360;
    const learningEnd = projectEnd + value.learning / total * 360;
    return `conic-gradient(from -90deg, #9b83ff 0deg ${projectEnd}deg, #43cae8 ${projectEnd}deg ${learningEnd}deg, #64717c ${learningEnd}deg 360deg)`;
  }

  /** Converts focus minutes into a bounded chart-bar height. */
  protected height(minutes: number): string {
    const maximum = Math.max(1, ...this.metrics().daily);
    return `${Math.max(4, Math.min(100, minutes / maximum * 100))}%`;
  }

  /** Returns the local date key for a chart day. */
  protected dateForDay(index: number): string {
    const date = new Date(this.startOfWeek);
    date.setDate(date.getDate() + index);
    return localDateKey(date);
  }

  /** Checks whether a habit was completed on a chart day. */
  protected isComplete(habitId: string, index: number): boolean {
    const date = this.dateForDay(index);
    if (habitId === SPORTS_HABIT_ID) return this.data().sports.some(item => item.date === date);
    return this.data().completions.some(item => item.habitId === habitId && item.date === date);
  }

  /** Returns progress toward the weekly deep work target. */
  protected goalPercent(): number {
    const value = this.metrics();
    return value.goal ? Math.min(100, value.deepMinutes / value.goal * 100) : 0;
  }

  /** Describes the weekly focus-minute change from the prior week. */
  protected weekComparison(): string {
    const value = this.metrics();
    if (!value.previous) return 'Start a weekly trend';
    const change = Math.round((value.weeklyMinutes - value.previous) / value.previous * 100);
    return `${change > 0 ? '+' : ''}${change}% vs prior week`;
  }
}
