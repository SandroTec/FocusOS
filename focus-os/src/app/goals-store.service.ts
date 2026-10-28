import { effect, Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { periodRange } from './goal-evaluator';
import { GoalDefinition, GoalInput } from './goal.models';
import { GoalsRepository } from './goals-repository.service';

/** Keeps goal definitions in sync with the signed-in account. */
@Injectable({ providedIn: 'root' })
export class GoalsStore {
  readonly goals = signal<GoalDefinition[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  private activeUserId: string | null | undefined;
  private loadVersion = 0;

  constructor(private readonly auth: AuthService, private readonly repository: GoalsRepository) {
    effect(() => this.onAuthChange(this.auth.ready(), this.auth.user()?.id ?? null));
  }

  /** Creates a goal with its first immutable effective-dated definition. */
  create(input: GoalInput): Promise<boolean> {
    return this.mutate(() => this.repository.create(input));
  }

  /** Schedules a new version while preserving the current period's definition. */
  revise(goal: GoalDefinition, input: GoalInput): Promise<boolean> {
    const current = goal.versions.at(-1);
    if (!current) return Promise.resolve(false);
    const range = periodRange(current.period, new Date(), current.timeZone);
    return this.mutate(() => this.repository.revise(goal.id, { ...input, period: current.period, effectiveFrom: range.endExclusive }));
  }

  /** Pauses, resumes, or archives one goal. */
  setStatus(id: string, status: GoalDefinition['status']): Promise<boolean> {
    const userId = this.activeUserId;
    if (!userId) return Promise.resolve(false);
    return this.mutate(() => this.repository.setStatus(userId, id, status));
  }

  /** Refreshes definitions after authentication changes or a successful write. */
  private async load(userId: string | null, version: number): Promise<void> {
    if (!userId) { this.goals.set([]); this.loading.set(false); return; }
    this.loading.set(true);
    try {
      let goals = await this.repository.load(userId);
      if (!goals.length) goals = await this.createDefaults(userId);
      if (version === this.loadVersion) this.goals.set(goals);
    } catch (error) { if (version === this.loadVersion) this.error.set(this.message(error)); }
    finally { if (version === this.loadVersion) this.loading.set(false); }
  }

  /** Creates the familiar weekly focus, learning, and movement targets. */
  private async createDefaults(userId: string): Promise<GoalDefinition[]> {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const today = new Date();
    const week = periodRange('week', today, zone).start;
    const defaults: GoalInput[] = [
      { title: 'Deep work', domain: 'focus', metric: 'minutes', targetValue: 1200, period: 'week', filters: { is_deep_work: true }, effectiveFrom: week, timeZone: zone },
      { title: 'Learning', domain: 'focus', metric: 'minutes', targetValue: 300, period: 'week', filters: { focus_category: 'Learning' }, effectiveFrom: week, timeZone: zone },
      { title: 'Movement', domain: 'sport', metric: 'minutes', targetValue: 180, period: 'week', filters: {}, effectiveFrom: week, timeZone: zone },
    ];
    await this.repository.seedDefaults(defaults);
    return this.repository.load(userId);
  }

  /** Serializes a write and reloads the committed goal records. */
  private async mutate(write: () => Promise<void>): Promise<boolean> {
    const userId = this.activeUserId;
    if (!userId || this.loading() || this.saving()) return false;
    this.saving.set(true);
    this.error.set('');
    try { await write(); await this.load(userId, this.loadVersion); return true; }
    catch (error) { this.error.set(this.message(error)); return false; }
    finally { this.saving.set(false); }
  }

  /** Clears old account data and loads the newly authenticated user's goals. */
  private onAuthChange(ready: boolean, userId: string | null): void {
    if (!ready || userId === this.activeUserId) return;
    this.activeUserId = userId;
    this.goals.set([]);
    this.error.set('');
    void this.load(userId, ++this.loadVersion);
  }

  /** Converts thrown values into a readable page-level error. */
  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'The goal could not be saved. Check your connection and try again.';
  }
}
