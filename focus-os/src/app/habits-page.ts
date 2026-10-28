import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FocusStore } from './focus-store.service';
import { localDateKey, SPORTS_HABIT_ID, weekStart } from './data.models';

/** Tracks recurring habits and their weekly completion history. */
@Component({ standalone: true, imports: [FormsModule, RouterLink], templateUrl: './habits-page.html' })
export class HabitsPage {
  protected readonly store = inject(FocusStore);
  protected readonly data = this.store.data;
  protected readonly today = localDateKey();
  protected name = '';
  protected color = 'mint';
  protected editingId: string | null = null;
  protected editName = '';
  protected editColor = 'mint';
  protected readonly palette = ['mint', 'cyan', 'violet', 'orange'];
  protected readonly week = Array.from({ length: 7 }, (_, index) => {
    const date = weekStart();
    date.setDate(date.getDate() + index);
    return { key: localDateKey(date), label: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date), day: date.getDate(), future: date.getTime() > new Date().setHours(0, 0, 0, 0) };
  });
  /** Lists active habits for the habit grid. */
  protected readonly activeHabits = computed(() => this.data().habits.filter(habit => !habit.archived));
  /** Lists archived habits separately from active habits. */
  protected readonly archivedHabits = computed(() => this.data().habits.filter(habit => habit.archived));
  /** Counts check-ins made within the displayed week. */
  protected readonly completionCount = computed(() => this.weeklyCompletionCount());
  /** Calculates check-ins as a percentage of possible active habit-days. */
  protected readonly completionRate = computed(() => {
    const possible = this.activeHabits().length * 7;
    return possible ? Math.round(this.completionCount() / possible * 100) : 0;
  });
  /** Adds a habit and clears its name field. */
  protected async add(): Promise<void> {
    if (!this.name.trim()) return;
    if (!await this.store.addHabit(this.name, this.color)) return;
    this.name = '';
  }
  /** Checks whether a habit is complete on a given date. */
  protected completed(habitId: string, date: string): boolean {
    if (habitId === SPORTS_HABIT_ID) return this.data().sports.some(item => item.date === date);
    return this.data().completions.some(item => item.habitId === habitId && item.date === date);
  }
  /** Identifies a habit whose check-ins come from the workout log. */
  protected isSportsHabit(habitId: string): boolean { return habitId === SPORTS_HABIT_ID; }

  /** Counts normal check-ins and distinct workout days in the current week. */
  private weeklyCompletionCount(): number {
    const data = this.data();
    const regular = data.completions.filter(item => item.habitId !== SPORTS_HABIT_ID
      && item.date >= this.week[0].key && item.date <= this.week[6].key).length;
    const sportDates = new Set(data.sports.map(item => item.date)
      .filter(date => date >= this.week[0].key && date <= this.week[6].key));
    return regular + sportDates.size;
  }
  /** Opens a habit in the inline editor. */
  protected beginEdit(habit: { id: string; name: string; color: string }): void {
    this.editingId = habit.id;
    this.editName = habit.name;
    this.editColor = habit.color;
  }
  /** Saves a non-empty habit name. */
  protected async saveEdit(id: string): Promise<void> {
    if (!this.editName.trim()) return;
    if (!await this.store.updateHabit(id, this.editName, this.editColor)) return;
    this.editingId = null;
  }
}
