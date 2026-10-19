import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FocusCategory, FocusSession, localDateKey } from './data.models';
import { FocusStore } from './focus-store.service';

@Component({ standalone: true, imports: [FormsModule, DatePipe], templateUrl: './focus-page.html' })
export class FocusPage implements OnDestroy {
  protected readonly store = inject(FocusStore);
  protected readonly data = this.store.data;
  protected readonly now = signal(Date.now());
  protected readonly elapsed = computed(() => {
    const timer = this.data().timer;
    return timer.elapsedMs + (timer.status === 'running' && timer.startedAt !== null ? this.now() - timer.startedAt : 0);
  });
  protected readonly categoryOptions: FocusCategory[] = ['Deep Work', 'Learning', 'Project'];
  protected readonly today = localDateKey();
  protected title = '';
  protected category: FocusCategory = 'Deep Work';
  protected projectId = '';
  protected manualTitle = '';
  protected manualCategory: FocusCategory = 'Deep Work';
  protected manualProjectId = '';
  protected manualStart = this.today + 'T09:00';
  protected manualEnd = this.today + 'T10:00';
  protected manualRating = 4;
  protected manualNotes = '';
  protected editingId: string | null = null;
  private readonly ticker = window.setInterval(() => this.now.set(Date.now()), 1000);

  ngOnDestroy(): void { window.clearInterval(this.ticker); }

  protected formatTime(ms: number): string {
    const total = Math.floor(ms / 1000);
    const pad = (value: number) => String(value).padStart(2, '0');
    return pad(Math.floor(total / 3600)) + ':' + pad(Math.floor(total / 60) % 60) + ':' + pad(total % 60);
  }
  protected start(): void { this.store.startTimer(this.title, this.category, this.projectId); this.title = ''; }
  protected stop(): void { this.store.stopTimer(); this.projectId = ''; }

  protected submitManual(): void {
    const start = new Date(this.manualStart);
    const end = new Date(this.manualEnd);
    const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
    if (!this.manualTitle.trim() || !Number.isFinite(minutes) || minutes <= 0 || this.manualRating < 1 || this.manualRating > 5) return;
    if (this.editingId) {
      const prior = this.data().sessions.find(session => session.id === this.editingId);
      if (prior) this.store.updateSession({ ...prior, title: this.manualTitle.trim(), category: this.manualCategory, ...(this.manualProjectId ? { projectId: this.manualProjectId } : { projectId: undefined }), startAt: start.toISOString(), endAt: end.toISOString(), durationMinutes: minutes, rating: this.manualRating, notes: this.manualNotes.trim() });
    } else {
      this.store.addSession({ title: this.manualTitle.trim(), category: this.manualCategory, ...(this.manualProjectId ? { projectId: this.manualProjectId } : {}), startAt: start.toISOString(), endAt: end.toISOString(), durationMinutes: minutes, rating: this.manualRating, notes: this.manualNotes.trim() });
    }
    this.cancelEdit();
  }
  protected edit(session: FocusSession): void {
    this.editingId = session.id;
    this.manualTitle = session.title;
    this.manualCategory = session.category;
    this.manualProjectId = session.projectId ?? '';
    this.manualStart = this.toLocalInput(session.startAt);
    this.manualEnd = this.toLocalInput(session.endAt);
    this.manualRating = session.rating;
    this.manualNotes = session.notes;
  }
  protected cancelEdit(): void {
    this.editingId = null;
    this.manualTitle = '';
    this.manualCategory = 'Deep Work';
    this.manualProjectId = '';
    this.manualStart = this.today + 'T09:00';
    this.manualEnd = this.today + 'T10:00';
    this.manualRating = 4;
    this.manualNotes = '';
  }
  protected durationLabel(minutes: number): string { return Math.floor(minutes / 60) + 'h ' + minutes % 60 + 'm'; }
  protected projectName(id: string): string { return this.data().projects.find(item => item.id === id)?.name ?? 'Project'; }
  private toLocalInput(value: string): string {
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
  }
}
