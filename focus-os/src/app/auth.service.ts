import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthChangeEvent, User } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabase-client.service';

/** Owns Supabase authentication state and email-based account actions. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly ready = signal(false);
  readonly passwordRecovery = signal(false);
  private resolveReady: () => void = () => undefined;
  private readonly readyPromise = new Promise<void>(resolve => { this.resolveReady = resolve; });
  get configured(): boolean { return this.supabase.configured; }

  constructor(private readonly supabase: SupabaseClientService, private readonly router: Router) {}

  /** Restores any saved session and watches future authentication changes. */
  async initialize(): Promise<void> {
    const client = this.supabase.client;
    if (!client) { this.markReady(); return; }
    client.auth.onAuthStateChange((event, session) => this.handleAuthChange(event, session?.user ?? null));
    try {
      const { data } = await client.auth.getSession();
      this.user.set(data.session?.user ?? null);
    } catch {
      this.user.set(null);
    } finally { this.markReady(); }
  }

  /** Waits until the stored auth session has been restored. */
  waitUntilReady(): Promise<void> { return this.readyPromise; }

  /** Marks session restoration complete for guards and the root view. */
  private markReady(): void { this.ready.set(true); this.resolveReady(); }

  /** Updates reactive authentication state for one Supabase event. */
  private handleAuthChange(event: AuthChangeEvent, user: User | null): void {
    this.passwordRecovery.set(event === 'PASSWORD_RECOVERY');
    this.user.set(user);
  }

  /** Registers a user and sends an email confirmation link. */
  async signUp(email: string, password: string): Promise<void> {
    const client = this.requireClient();
    const { error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: this.redirectUrl('auth/callback') },
    });
    if (error) throw error;
  }

  /** Signs in an existing email and password account. */
  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.requireClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.user.set(data.user);
  }

  /** Sends a password recovery email with a same-site return URL. */
  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.requireClient().auth.resetPasswordForEmail(email, {
      redirectTo: this.redirectUrl('reset-password'),
    });
    if (error) throw error;
  }

  /** Changes the password for a verified recovery session. */
  async updatePassword(password: string): Promise<void> {
    const { error } = await this.requireClient().auth.updateUser({ password });
    if (error) throw error;
  }

  /** Signs out and clears the active Supabase session. */
  async signOut(): Promise<void> {
    const { error } = await this.requireClient().auth.signOut();
    if (error) throw error;
    this.user.set(null);
    await this.router.navigateByUrl('/login');
  }

  /** Returns the configured client or reports the missing setup. */
  private requireClient() {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase URL and publishable key are not configured.');
    return client;
  }

  /** Builds a redirect URL relative to the deployed Angular base path. */
  private redirectUrl(path: string): string { return new URL(path, document.baseURI).toString(); }
}
