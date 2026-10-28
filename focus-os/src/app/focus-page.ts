import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FocusCategory, FocusSession, localDateKey } from './data.models';
import { FocusStore } from './focus-store.service';

/** Provides timed and manually logged focus sessions. */
@Component({ standalone: true, imports: [FormsModule, DatePipe], templateUrl: './focus-page.html' })
export class FocusPage implements OnDestroy {
  protected readonly store = inject(FocusStore);
  protected readonly data = this.store.data;
  protected readonly now = signal(Date.now());
  protected readonly elapsed = computed(() => {
    const timer = this.data().timer;
    return timer.elapsedMs + (timer.status === 'running' && timer.startedAt !== null ? this.now() - timer.startedAt : 0);
  });
  protected readonly categoryOptions: FocusCategory[] = ['Project', 'Learning', 'Other'];
  protected readonly today = localDateKey();
  protected title = '';
  protected category: FocusCategory | '' = '';
  protected projectId = '';
  protected timerIsDeepWork = false;
  protected manualTitle = '';
  protected manualCategory: FocusCategory = 'Project';
  protected manualProjectId = '';
  protected manualIsDeepWork = false;
  protected manualStart = this.today + 'T09:00';
  protected manualEnd = this.today + 'T10:00';
  protected manualRating = 4;
  protected manualNotes = '';
  protected editingId: string | null = null;
  protected readonly activeTab = signal<'timer' | 'rating'>(this.store.data().pendingSession ? 'rating' : 'timer');
  protected rating = 0;
  protected ratingNotes = '';
  private readonly ticker = window.setInterval(() => this.now.set(Date.now()), 1000);

  /** Stops the display clock when the page is destroyed. */
  ngOnDestroy(): void { window.clearInterval(this.ticker); }

  /** Formats elapsed milliseconds as a clock-style duration. */
  protected formatTime(ms: number): string {
    const total = Math.floor(ms / 1000);
    const pad = (value: number) => String(value).padStart(2, '0');
    return pad(Math.floor(total / 3600)) + ':' + pad(Math.floor(total / 60) % 60) + ':' + pad(total % 60);
  }
  /** Starts a timer after validating its required fields. */
  protected async start(): Promise<void> {
    if (!this.title.trim() || !this.category || !this.projectId || this.data().pendingSession) return;
    const saved = await this.store.startTimer(this.title, this.category, this.projectId === 'none' ? '' : this.projectId, this.timerIsDeepWork);
    if (!saved) return;
    this.title = '';
    this.category = '';
    this.projectId = '';
    this.timerIsDeepWork = false;
  }
  /** Stops the timer and opens its rating form. */
  protected async stop(): Promise<void> {
    if (!await this.store.stopTimer()) return;
    this.projectId = '';
    this.rating = 0;
    this.ratingNotes = '';
    this.activeTab.set('rating');
  }

  /** Saves the required rating for a completed timer session. */
  protected async saveTimerReview(): Promise<void> {
    if (!this.data().pendingSession || this.rating < 1 || this.rating > 5) return;
    if (!await this.store.savePendingSession(this.rating, this.ratingNotes)) return;
    this.rating = 0;
    this.ratingNotes = '';
    this.activeTab.set('timer');
  }

  /** Adds a manual session or saves edits to an existing session. */
  protected async submitManual(): Promise<void> {
    const input = this.buildManualSession();
    if (!input) return;
    if (!await this.persistManualSession(input)) return;
    this.cancelEdit();
  }

  /** Builds a validated manual session record from the form. */
  private buildManualSession(): Omit<FocusSession, 'id'> | null {
    const start = new Date(this.manualStart);
    const end = new Date(this.manualEnd);
    const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
    if (!this.manualTitle.trim() || !Number.isFinite(minutes) || minutes <= 0 || this.manualRating < 1 || this.manualRating > 5) return null;
    return this.manualSessionValues(start, end, minutes);
  }

  /** Collects the validated values shared by manual create and edit. */
  private manualSessionValues(start: Date, end: Date, minutes: number): Omit<FocusSession, 'id'> {
    return {
      title: this.manualTitle.trim(),
      category: this.manualCategory,
      isDeepWork: this.manualIsDeepWork,
      ...(this.manualProjectId ? { projectId: this.manualProjectId } : {}),
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      durationMinutes: minutes,
      durationSeconds: minutes * 60,
      rating: this.manualRating,
      notes: this.manualNotes.trim(),
    };
  }

  /** Saves a manual record as a create or update operation. */
  private async persistManualSession(input: Omit<FocusSession, 'id'>): Promise<boolean> {
    if (!this.editingId) {
      return this.store.addSession(input);
    }
    const prior = this.data().sessions.find(session => session.id === this.editingId);
    return prior ? this.store.updateSession({ ...prior, ...input, projectId: input.projectId }) : false;
  }

  /** Loads a saved session into the manual entry form. */
  protected edit(session: FocusSession): void {
    this.editingId = session.id;
    this.manualTitle = session.title;
    this.manualCategory = session.category;
    this.manualProjectId = session.projectId ?? '';
    this.manualIsDeepWork = session.isDeepWork;
    this.manualStart = this.toLocalInput(session.startAt);
    this.manualEnd = this.toLocalInput(session.endAt);
    this.manualRating = session.rating;
    this.manualNotes = session.notes;
  }
  /** Resets manual-entry fields and exits edit mode. */
  protected cancelEdit(): void {
    this.editingId = null;
    this.manualTitle = '';
    this.manualCategory = 'Project';
    this.manualProjectId = '';
    this.manualIsDeepWork = false;
    this.manualStart = this.today + 'T09:00';
    this.manualEnd = this.today + 'T10:00';
    this.manualRating = 4;
    this.manualNotes = '';
  }
  /** Formats session duration using seconds when available. */
  protected durationLabel(minutes: number, seconds?: number): string {
    const totalSeconds = seconds ?? Math.round(minutes * 60);
    if (totalSeconds < 60) return totalSeconds + 's';
    const hours = Math.floor(totalSeconds / 3600);
    const remainingMinutes = Math.floor(totalSeconds % 3600 / 60);
    const remainingSeconds = totalSeconds % 60;
    if (hours) return hours + 'h ' + remainingMinutes + 'm';
    return remainingMinutes + 'm' + (remainingSeconds ? ' ' + remainingSeconds + 's' : '');
  }
  /** Looks up a project's display name. */
  protected projectName(id: string): string { return this.data().projects.find(item => item.id === id)?.name ?? 'Project'; }

  /** Converts an ISO timestamp to the local datetime-input format. */
  private toLocalInput(value: string): string {
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
  }
}
