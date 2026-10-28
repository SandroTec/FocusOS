import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { FocusStore } from './focus-store.service';
import { localDateKey, SportEntry, weekStart } from './data.models';

/** Records workouts and summarizes activity for the current week. */
@Component({ standalone: true, imports: [FormsModule, DatePipe], templateUrl: './sports-page.html' })
export class SportsPage {
  protected readonly store = inject(FocusStore);
  protected readonly data = this.store.data;
  protected sport = '';
  protected duration = 45;
  protected date = localDateKey();
  protected intensity = 3;
  protected notes = '';
  protected editingId: string | null = null;
  protected readonly thisWeek = weekStart();
  /** Calculates this week's workout count and total minutes. */
  protected readonly weekStats = computed(() => {
    const entries = this.data().sports.filter(entry => {
      const date = new Date(entry.date + 'T12:00:00');
      const end = new Date(this.thisWeek);
      end.setDate(end.getDate() + 7);
      return date >= this.thisWeek && date < end;
    });
    return { count: entries.length, minutes: entries.reduce((sum, item) => sum + item.durationMinutes, 0) };
  });
  /** Validates and saves a new or edited workout. */
  protected async add(): Promise<void> {
    if (!this.sport.trim() || !Number.isFinite(this.duration) || this.duration < 1 || this.duration > 1440 || this.intensity < 1 || this.intensity > 5 || !this.date) return;
    const values = { sport: this.sport.trim(), durationMinutes: this.duration, date: this.date, intensity: this.intensity, notes: this.notes.trim() };
    const saved = this.editingId
      ? await this.store.updateSport({ ...values, id: this.editingId })
      : await this.store.addSport(values);
    if (!saved) return;
    this.resetForm();
  }
  /** Loads a workout into the editor. */
  protected edit(entry: SportEntry): void {
    this.editingId = entry.id;
    this.sport = entry.sport;
    this.duration = entry.durationMinutes;
    this.date = entry.date;
    this.intensity = entry.intensity;
    this.notes = entry.notes;
  }
  /** Cancels editing and restores default form values. */
  protected cancelEdit(): void { this.resetForm(); }
  /** Clears form values after a save or cancellation. */
  private resetForm(): void {
    this.editingId = null;
    this.sport = '';
    this.duration = 45;
    this.date = localDateKey();
    this.intensity = 3;
    this.notes = '';
  }
  /** Formats workout minutes for display. */
  protected durationLabel(minutes: number): string {
    return minutes >= 60
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes} min`;
  }
}
