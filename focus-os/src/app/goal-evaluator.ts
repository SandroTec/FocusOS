import { SPORTS_HABIT_ID } from './data.models';
import { GoalActivities, GoalDefinition, GoalEvaluation, GoalMetric, GoalPeriod, GoalPeriodRange, GoalVersion } from './goal.models';

/** Formats an instant as a calendar date in the goal's saved time zone. */
export function dateKeyInZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Adds calendar days to a YYYY-MM-DD date without local-time shifts. */
export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Returns the start of a calendar period for the provided local date. */
export function periodRange(period: GoalPeriod, date: Date, timeZone: string): GoalPeriodRange {
  return periodRangeFromDate(period, dateKeyInZone(date, timeZone));
}

/** Returns a period range from a date key and includes a readable label. */
export function periodRangeFromDate(period: GoalPeriod, date: string): GoalPeriodRange {
  const start = period === 'week' ? mondayOf(date) : `${date.slice(0, 7)}-01`;
  const endExclusive = shiftDate(start, period === 'week' ? 7 : daysInMonth(start));
  return { start, endExclusive, label: periodLabel(period, start, endExclusive) };
}

/** Moves a calendar period backward by one week or month. */
export function previousPeriod(period: GoalPeriod, range: GoalPeriodRange): GoalPeriodRange {
  const previous = period === 'week' ? shiftDate(range.start, -7) : shiftMonth(range.start, -1);
  return periodRangeFromDate(period, previous);
}

/** Selects the definition that governed the full requested calendar period. */
export function versionForPeriod(goal: GoalDefinition, range: GoalPeriodRange): GoalVersion | null {
  return goal.versions.find(version => version.effectiveFrom <= range.start
    && (!version.effectiveUntil || version.effectiveUntil >= shiftDate(range.endExclusive, -1))) ?? null;
}

/** Calculates one goal period from previously saved activity records. */
export function evaluateGoal(version: GoalVersion, activities: GoalActivities, range: GoalPeriodRange): GoalEvaluation {
  const value = goalValue(version, activities, range);
  return { version, range, value, remaining: Math.max(0, version.targetValue - value),
    percent: Math.min(100, value / version.targetValue * 100), achieved: value >= version.targetValue };
}

/** Formats the measured value with its matching unit. */
export function goalValueLabel(value: number, metric: GoalMetric): string {
  if (metric === 'minutes') return durationLabel(value);
  const unit = metric === 'sessions' ? 'sessions' : metric === 'days' ? 'days' : 'completions';
  return `${Math.floor(value)} ${unit}`;
}

/** Calculates the active metric for the goal's domain and filters. */
function goalValue(version: GoalVersion, activities: GoalActivities, range: GoalPeriodRange): number {
  const rows = matchingActivities(version, activities, range);
  if (version.metric === 'minutes') return rows.reduce((sum, item) => sum + item.minutes, 0);
  if (version.metric === 'days') return new Set(rows.map(item => item.date)).size;
  return rows.length;
}

/** Selects existing activities that match a goal's domain, dates, and filters. */
function matchingActivities(version: GoalVersion, activities: GoalActivities, range: GoalPeriodRange): { date: string; minutes: number }[] {
  if (version.domain === 'focus') return activities.sessions.filter(item => matchesFocus(item, version))
    .map(item => ({ date: dateKeyInZone(new Date(item.startAt), version.timeZone), minutes: item.durationMinutes }))
    .filter(item => item.date >= range.start && item.date < range.endExclusive);
  if (version.domain === 'sport') return activities.sports.filter(item => !version.filters.sport_name || item.sport.toLowerCase() === version.filters.sport_name.toLowerCase())
    .filter(item => item.date >= range.start && item.date < range.endExclusive)
    .map(item => ({ date: item.date, minutes: item.durationMinutes }));
  return habitActivities(version, activities, range);
}

/** Applies the independent activity-area and Deep Work goal filters. */
function matchesFocus(item: GoalActivities['sessions'][number], version: GoalVersion): boolean {
  return (!version.filters.focus_category || item.category === version.filters.focus_category)
    && (version.filters.is_deep_work !== true || item.isDeepWork);
}

/** Adds workout-derived habit days to habit goals without duplicate-day counts. */
function habitActivities(version: GoalVersion, activities: GoalActivities, range: GoalPeriodRange): { date: string; minutes: number }[] {
  const selected = version.filters.habit_id;
  const sportsHabit = activities.habits.some(item => item.id === SPORTS_HABIT_ID);
  if (selected === SPORTS_HABIT_ID) return sportDays(activities, range);
  const completions = activities.completions.filter(item => !selected || item.habitId === selected)
    .filter(item => item.date >= range.start && item.date < range.endExclusive)
    .map(item => ({ date: item.date, minutes: 0 }));
  return selected || !sportsHabit ? completions : [...completions, ...sportDays(activities, range)];
}

/** Returns one derived sports-habit completion per workout day. */
function sportDays(activities: GoalActivities, range: GoalPeriodRange): { date: string; minutes: number }[] {
  return [...new Set(activities.sports.filter(item => item.date >= range.start && item.date < range.endExclusive).map(item => item.date))]
    .map(date => ({ date, minutes: 0 }));
}

/** Finds the Monday belonging to a date using UTC calendar arithmetic. */
function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((weekday + 6) % 7));
}

/** Returns how many calendar days are in the month of a date key. */
function daysInMonth(date: string): number {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Moves a month-start date by whole calendar months. */
function shiftMonth(date: string, months: number): string {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
}

/** Formats week or month date boundaries for the goal card. */
function periodLabel(period: GoalPeriod, start: string, endExclusive: string): string {
  const formatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const first = formatter.format(new Date(`${start}T00:00:00Z`));
  const last = formatter.format(new Date(`${shiftDate(endExclusive, -1)}T00:00:00Z`));
  return period === 'month' ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${start}T00:00:00Z`)) : `${first} – ${last}`;
}

/** Formats a minute total in a compact goal card style. */
function durationLabel(minutes: number): string {
  const total = Math.floor(minutes);
  return total >= 60 ? `${Math.floor(total / 60)}h ${total % 60}m` : `${total} min`;
}
