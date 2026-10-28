import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

/** Creates and exposes the configured public Supabase client. */
@Injectable({ providedIn: 'root' })
export class SupabaseClientService {
  readonly client: SupabaseClient | null = this.createClient();

  /** Indicates whether both public connection values are configured. */
  get configured(): boolean { return this.client !== null; }

  /** Creates the client only when valid public configuration is present. */
  private createClient(): SupabaseClient | null {
    if (!environment.supabaseUrl || !environment.supabasePublishableKey) return null;
    try {
      new URL(environment.supabaseUrl);
      return createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
        auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true },
      });
    } catch { return null; }
  }
}
