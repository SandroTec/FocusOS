import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'callback';

/** Handles email authentication, recovery, and confirmation callbacks. */
@Component({ standalone: true, imports: [FormsModule, RouterLink], templateUrl: './auth-page.html', styleUrl: './auth-page.scss' })
export class AuthPage {
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  protected readonly mode: AuthMode = this.route.snapshot.data['mode'];
  private readonly router = inject(Router);
  protected email = '';
  protected password = '';
  protected confirmation = '';
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly failure = signal('');
  protected get heading(): string {
    return { login: 'Welcome back', register: 'Create your account', forgot: 'Reset your password', reset: 'Choose a new password', callback: 'Confirm your account' }[this.mode];
  }
  protected get description(): string {
    return { login: 'Sign in to continue to your personal workspace.', register: 'Create an account to keep your focus data in sync.', forgot: 'We will send a recovery link if an account matches your email.', reset: 'Set a new password for your FocusOS account.', callback: '' }[this.mode];
  }
  protected get actionLabel(): string {
    return { login: 'Sign in', register: 'Create account', forgot: 'Send recovery email', reset: 'Save new password', callback: 'Continue' }[this.mode];
  }

  constructor() {
    effect(() => {
      if (this.mode === 'callback' && this.auth.user()) void this.router.navigateByUrl('/dashboard');
    });
  }

  /** Runs the action selected by the current authentication route. */
  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.failure.set('');
    this.message.set('');
    try { await this.performAction(); }
    catch (error) { this.failure.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }

  /** Routes the form submission to its authentication operation. */
  private async performAction(): Promise<void> {
    if (this.mode === 'register') return this.register();
    if (this.mode === 'forgot') return this.sendRecovery();
    if (this.mode === 'reset') return this.resetPassword();
    await this.login();
  }

  /** Creates a user and displays the email-confirmation instructions. */
  private async register(): Promise<void> {
    if (this.password !== this.confirmation) throw new Error('Passwords do not match.');
    await this.auth.signUp(this.email.trim(), this.password);
    this.message.set('Check your email to confirm your account, then sign in.');
  }

  /** Signs in and restores the previously requested route. */
  private async login(): Promise<void> {
    await this.auth.signIn(this.email.trim(), this.password);
    await this.router.navigateByUrl(this.returnUrl());
  }

  /** Sends a recovery email to the entered address. */
  private async sendRecovery(): Promise<void> {
    await this.auth.requestPasswordReset(this.email.trim());
    this.message.set('If an account exists for that address, a recovery email is on its way.');
  }

  /** Saves the new password from a valid recovery session. */
  private async resetPassword(): Promise<void> {
    if (!this.auth.passwordRecovery() && !this.auth.user()) throw new Error('Open the password recovery link from your email first.');
    if (this.password !== this.confirmation) throw new Error('Passwords do not match.');
    await this.auth.updatePassword(this.password);
    this.message.set('Password updated. You can now continue to FocusOS.');
    this.auth.passwordRecovery.set(false);
    await this.router.navigateByUrl('/dashboard');
  }

  /** Returns a safe in-app destination from the login query string. */
  private returnUrl(): string {
    const requested = this.route.snapshot.queryParamMap.get('returnUrl');
    return requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard';
  }

  /** Converts an unknown authentication error to display text. */
  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Authentication failed. Please try again.';
  }
}
