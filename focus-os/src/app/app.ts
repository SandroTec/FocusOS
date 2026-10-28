import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FocusStore } from './focus-store.service';
import { AuthService } from './auth.service';

/** Provides the application shell and shared navigation. */
@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnDestroy {
  protected readonly store = inject(FocusStore);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly dateLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  protected readonly now = signal(Date.now());
  protected get userInitial(): string { return this.auth.user()?.email?.charAt(0).toUpperCase() ?? 'U'; }
  protected readonly timerLabel = computed(() => {
    const timer = this.store.data().timer;
    const elapsed = timer.elapsedMs + (timer.status === 'running' && timer.startedAt !== null ? this.now() - timer.startedAt : 0);
    const seconds = Math.floor(elapsed / 1000);
    const pad = (value: number) => String(value).padStart(2, '0');
    return pad(Math.floor(seconds / 3600)) + ':' + pad(Math.floor(seconds / 60) % 60) + ':' + pad(seconds % 60);
  });
  private readonly ticker = window.setInterval(() => this.now.set(Date.now()), 1000);
  /** Resolves the current page title from the active route. */
  protected get pageTitle(): string {
    const route = this.router.url.split('?')[0].split('/')[1];
    if (route === 'sports') return 'Sport';
    return route ? route.charAt(0).toUpperCase() + route.slice(1) : 'Dashboard';
  }
  /** Signs out and reports service failures in the shared error banner. */
  protected async signOut(): Promise<void> {
    try { await this.auth.signOut(); }
    catch (error) { this.store.error.set(error instanceof Error ? error.message : 'Sign out failed.'); }
  }
  /** Stops the timer display ticker when the shell is destroyed. */
  ngOnDestroy(): void { window.clearInterval(this.ticker); }
}
