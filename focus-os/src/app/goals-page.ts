import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FocusCategory } from './data.models';
import { evaluateGoal, goalValueLabel, periodRange, periodRangeFromDate, previousPeriod, versionForPeriod } from './goal-evaluator';
import { GoalDefinition, GoalDomain, GoalEvaluation, GoalFilters, GoalInput, GoalMetric, GoalPeriod } from './goal.models';
import { FocusStore } from './focus-store.service';
import { GoalsStore } from './goals-store.service';

/** Defines personal goals and evaluates them from existing activity records. */
@Component({ standalone: true, imports: [FormsModule, RouterLink], templateUrl: './goals-page.html', styleUrl: './goals-page.scss' })
export class GoalsPage {
  protected readonly activity = inject(FocusStore).data;
  protected readonly store = inject(GoalsStore);
  protected readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  protected readonly habits = computed(() => this.activity().habits.filter(habit => !habit.archived));
  protected readonly activeGoals = computed(() => this.store.goals().filter(goal => goal.status === 'active'));
  protected readonly otherGoals = computed(() => this.store.goals().filter(goal => goal.status !== 'active'));
  protected readonly categories: FocusCategory[] = ['Project', 'Learning', 'Other'];
  protected title = '';
  protected domain: GoalDomain = 'focus';
  protected metric: GoalMetric = 'minutes';
  protected period: GoalPeriod = 'week';
  protected targetValue = 300;
  protected startDate = periodRange('week', new Date(), this.timeZone).start;
  protected focusCategory: FocusCategory | '' = '';
  protected deepWorkOnly = true;
  protected sportName = '';
  protected habitId = '';
  protected editingId: string | null = null;
  protected message = '';

  /** Provides metrics supported by the selected activity area. */
  protected metricOptions(): { value: GoalMetric; label: string }[] {
    if (this.domain === 'habit') return [{ value: 'completions', label: 'Completions' }, { value: 'days', label: 'Active days' }];
    const sessions = this.domain === 'sport' ? 'Workouts' : 'Sessions';
    return [{ value: 'minutes', label: 'Minutes' }, { value: 'sessions', label: sessions }, { value: 'days', label: 'Active days' }];
  }

  /** Updates the suggested metric and clears filters from the previous area. */
  protected domainChanged(): void {
    this.metric = this.domain === 'habit' ? 'completions' : 'minutes';
    this.focusCategory = '';
    this.deepWorkOnly = false;
    this.sportName = '';
    this.habitId = '';
  }

  /** Aligns a new goal's start date with its calendar period. */
  protected periodChanged(): void {
    this.startDate = periodRange(this.period, new Date(), this.timeZone).start;
  }

  /** Moves a selected historic start date to its week's Monday or month's first day. */
  protected alignStartDate(): void {
    if (this.startDate) this.startDate = periodRangeFromDate(this.period, this.startDate).start;
  }

  /** Creates a goal or schedules an edited definition for its next period. */
  protected async save(): Promise<void> {
    if (!this.title.trim() || !Number.isFinite(this.targetValue) || this.targetValue <= 0) return;
    const input = this.input();
    const goal = this.store.goals().find(item => item.id === this.editingId);
    const saved = goal ? await this.store.revise(goal, input) : await this.store.create(input);
    if (!saved) return;
    this.message = goal ? 'Changes will take effect in the next period.' : 'Goal created. Progress is calculated from your existing activity.';
    this.resetForm();
  }

  /** Starts editing the latest planned definition for a goal. */
  protected edit(goal: GoalDefinition): void {
    const version = goal.versions.at(-1);
    if (!version) return;
    this.editingId = goal.id;
    this.title = version.title;
    this.domain = version.domain;
    this.metric = version.metric;
    this.period = version.period;
    this.targetValue = version.targetValue;
    this.focusCategory = version.filters.focus_category ?? '';
    this.deepWorkOnly = version.filters.is_deep_work === true;
    this.sportName = version.filters.sport_name ?? '';
    this.habitId = version.filters.habit_id ?? '';
    this.startDate = version.effectiveFrom;
    this.message = '';
  }

  /** Cancels editing and resets the goal form. */
  protected cancelEdit(): void { this.resetForm(); }

  /** Gets the evaluated value for a goal's current calendar period. */
  protected current(goal: GoalDefinition): GoalEvaluation | null {
    const latest = goal.versions.at(-1);
    if (!latest) return null;
    const range = periodRange(latest.period, new Date(), latest.timeZone);
    const version = versionForPeriod(goal, range);
    return version ? evaluateGoal(version, this.activities(), range) : null;
  }

  /** Builds the six latest fully defined historical periods for a goal. */
  protected history(goal: GoalDefinition): GoalEvaluation[] {
    const latest = goal.versions.at(-1);
    if (!latest) return [];
    let range = previousPeriod(latest.period, periodRange(latest.period, new Date(), latest.timeZone));
    const entries: GoalEvaluation[] = [];
    for (let index = 0; index < 6; index += 1) {
      const version = versionForPeriod(goal, range);
      if (version) entries.push(evaluateGoal(version, this.activities(), range));
      range = previousPeriod(latest.period, range);
    }
    return entries;
  }

  /** Formats an actual or target value with the selected metric unit. */
  protected valueLabel(value: number, metric: GoalMetric): string { return goalValueLabel(value, metric); }

  /** Switches an active goal to paused or restores a paused goal. */
  protected togglePause(goal: GoalDefinition): void {
    void this.store.setStatus(goal.id, goal.status === 'active' ? 'paused' : 'active');
  }

  /** Builds the optional filters for the chosen activity area. */
  private filters(): GoalFilters {
    if (this.domain === 'focus') return { ...(this.focusCategory ? { focus_category: this.focusCategory } : {}), ...(this.deepWorkOnly ? { is_deep_work: true } : {}) };
    if (this.domain === 'sport') return this.sportName.trim() ? { sport_name: this.sportName.trim() } : {};
    return this.habitId ? { habit_id: this.habitId } : {};
  }

  /** Creates the validated API input from the current form fields. */
  private input(): GoalInput {
    return { title: this.title.trim(), domain: this.domain, metric: this.metric, targetValue: this.targetValue,
      period: this.period, filters: this.filters(), effectiveFrom: this.startDate, timeZone: this.timeZone };
  }

  /** Returns only source records needed by the separate goal evaluator. */
  private activities() {
    const data = this.activity();
    return { sessions: data.sessions, sports: data.sports, habits: data.habits, completions: data.completions };
  }

  /** Clears edit state and restores the initial weekly focus goal form. */
  private resetForm(): void {
    this.editingId = null;
    this.title = '';
    this.domain = 'focus';
    this.metric = 'minutes';
    this.period = 'week';
    this.targetValue = 300;
    this.startDate = periodRange('week', new Date(), this.timeZone).start;
    this.focusCategory = '';
    this.deepWorkOnly = true;
    this.sportName = '';
    this.habitId = '';
  }
}
