import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FocusStore } from './focus-store.service';
import { localDateKey, weekStart } from './data.models';

@Component({ standalone: true, imports: [FormsModule], templateUrl: './habits-page.html' })
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
  protected readonly activeHabits = computed(() => this.data().habits.filter(habit => !habit.archived));
  protected readonly archivedHabits = computed(() => this.data().habits.filter(habit => habit.archived));
  protected readonly completionCount = computed(() => this.data().completions.filter(item => item.date >= this.week[0].key && item.date <= this.week[6].key).length);
  protected readonly completionRate = computed(() => {
    const possible = this.activeHabits().length * 7;
    return possible ? Math.round(this.completionCount() / possible * 100) : 0;
  });
  protected add(): void {
    if (!this.name.trim()) return;
    this.store.addHabit(this.name, this.color);
    this.name = '';
  }
  protected completed(habitId: string, date: string): boolean {
    return this.data().completions.some(item => item.habitId === habitId && item.date === date);
  }
  protected beginEdit(habit: { id: string; name: string; color: string }): void { this.editingId = habit.id; this.editName = habit.name; this.editColor = habit.color; }
  protected saveEdit(id: string): void { if (!this.editName.trim()) return; this.store.updateHabit(id, this.editName, this.editColor); this.editingId = null; }
}
