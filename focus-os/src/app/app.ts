import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Router } from '@angular/router';
import { FocusStore } from './focus-store.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnDestroy {
  protected readonly store = inject(FocusStore);
  private readonly router = inject(Router);
  protected readonly dateLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  protected readonly now = signal(Date.now());
  protected readonly timerLabel = computed(() => {
    const timer = this.store.data().timer;
    const elapsed = timer.elapsedMs + (timer.status === 'running' && timer.startedAt !== null ? this.now() - timer.startedAt : 0);
    const seconds = Math.floor(elapsed / 1000);
    const pad = (value: number) => String(value).padStart(2, '0');
    return pad(Math.floor(seconds / 3600)) + ':' + pad(Math.floor(seconds / 60) % 60) + ':' + pad(seconds % 60);
  });
  private readonly ticker = window.setInterval(() => this.now.set(Date.now()), 1000);
  protected get pageTitle(): string {
    const route = this.router.url.split('?')[0].split('/')[1];
    return route ? route.charAt(0).toUpperCase() + route.slice(1) : 'Dashboard';
  }
  ngOnDestroy(): void { window.clearInterval(this.ticker); }
}
