import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { GoalDefinition, GoalInput, GoalVersion } from './goal.models';

type Row = Record<string, any>;

/** Reads and writes user-owned goal definitions and their revisions. */
@Injectable({ providedIn: 'root' })
export class GoalsRepository {
  constructor(private readonly supabase: SupabaseClientService) {}

  /** Loads goal identities and their effective-dated definitions. */
  async load(userId: string): Promise<GoalDefinition[]> {
    const client = this.requireClient();
    const [goals, versions] = await Promise.all([
      client.from('goals').select('id,status,created_at').eq('user_id', userId),
      client.from('goal_versions').select('*').eq('user_id', userId).order('revision'),
    ]);
    if (goals.error) throw goals.error;
    if (versions.error) throw versions.error;
    return this.mapGoals(goals.data ?? [], versions.data ?? []);
  }

  /** Creates a goal and its first definition in one database transaction. */
  async create(input: GoalInput): Promise<void> {
    const { error } = await this.requireClient().rpc('create_goal', { goal_record: this.toRow(input) });
    if (error) throw error;
  }

  /** Seeds initial targets atomically only when the account has no goals. */
  async seedDefaults(inputs: GoalInput[]): Promise<void> {
    const goalRecords = inputs.map(input => this.toRow(input));
    const { error } = await this.requireClient().rpc('seed_default_goals', { goal_records: goalRecords });
    if (error) throw error;
  }

  /** Schedules a revised definition for the next period boundary. */
  async revise(id: string, input: GoalInput): Promise<void> {
    const { error } = await this.requireClient().rpc('revise_goal', {
      goal_id: id, goal_record: this.toRow(input),
    });
    if (error) throw error;
  }

  /** Changes the current lifecycle state of a goal. */
  async setStatus(userId: string, id: string, status: GoalDefinition['status']): Promise<void> {
    const { error } = await this.requireClient().from('goals').update({ status, updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('id', id);
    if (error) throw error;
  }

  /** Groups version rows under their stable goal identity. */
  private mapGoals(goalRows: Row[], versionRows: Row[]): GoalDefinition[] {
    const versions = new Map<string, GoalVersion[]>();
    for (const row of versionRows) {
      const list = versions.get(row['goal_id']) ?? [];
      list.push(this.toModel(row));
      versions.set(row['goal_id'], list);
    }
    return goalRows.map(row => ({ id: row['id'], status: row['status'], createdAt: row['created_at'], versions: versions.get(row['id']) ?? [] }));
  }

  /** Converts a database definition row into an application model. */
  private toModel(row: Row): GoalVersion {
    return { id: row['id'], revision: Number(row['revision']), title: row['title'], domain: row['activity_domain'],
      metric: row['metric'], targetValue: Number(row['target_value']), period: row['period'], filters: row['filters'] ?? {},
      effectiveFrom: row['effective_from'], effectiveUntil: row['effective_until'], timeZone: row['time_zone'] };
  }

  /** Converts an application definition into the database RPC shape. */
  private toRow(input: GoalInput): Row {
    return { title: input.title, activity_domain: input.domain, metric: input.metric, target_value: input.targetValue,
      period: input.period, filters: input.filters, effective_from: input.effectiveFrom, time_zone: input.timeZone };
  }

  /** Returns the configured Supabase client. */
  private requireClient() {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase URL and publishable key are not configured.');
    return client;
  }
}
