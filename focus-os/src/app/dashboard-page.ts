import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FocusStore } from './focus-store.service';
import { localDateKey, weekStart } from './data.models';

@Component({
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard-page.html',
})
export class DashboardPage {
  private readonly store = inject(FocusStore);
  protected readonly data = this.store.data;
  protected readonly today = new Date();
  protected readonly dateLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(this.today);
  protected readonly days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly activeHabits = computed(() => this.data().habits.filter(item => !item.archived));
  protected readonly startOfWeek = weekStart(this.today);
  protected readonly metrics = computed(() => {
    const data = this.data();
    const start = this.startOfWeek.getTime();
    const endDate = new Date(this.startOfWeek);
    endDate.setDate(endDate.getDate() + 7);
    const end = endDate.getTime();
    const previousStart = new Date(this.startOfWeek);
    previousStart.setDate(previousStart.getDate() - 7);
    const sessions = data.sessions.filter(item => {
      const time = new Date(item.startAt).getTime();
      return time >= start && time < end;
    });
    const previous = data.sessions.filter(item => {
      const time = new Date(item.startAt).getTime();
      return time >= previousStart.getTime() && time < start;
    }).reduce((sum, item) => sum + item.durationMinutes, 0);
    const weeklyMinutes = sessions.reduce((sum, item) => sum + item.durationMinutes, 0);
    const learning = sessions.filter(item => item.category === 'Learning').reduce((sum, item) => sum + item.durationMinutes, 0);
    const projectMinutes = sessions.filter(item => item.category === 'Project').reduce((sum, item) => sum + item.durationMinutes, 0);
    const sportCount = data.sports.filter(item => new Date(`${item.date}T00:00:00`).getTime() >= start && new Date(`${item.date}T00:00:00`).getTime() < end).length;
    const habits = data.habits.filter(item => !item.archived).length;
    const activeIds = new Set(data.habits.filter(item => !item.archived).map(item => item.id));
    const completions = data.completions.filter(item => { const time = new Date(`${item.date}T12:00:00`).getTime(); return activeIds.has(item.habitId) && time >= start && time < end; }).length;
    const habitRate = habits ? Math.round(Math.min(100, completions / (habits * 7) * 100)) : 0;
    const daily = this.days.map((_, index) => {
      const date = new Date(this.startOfWeek);
      date.setDate(date.getDate() + index);
      const key = localDateKey(date);
      return sessions.filter(item => localDateKey(new Date(item.startAt)) === key).reduce((sum, item) => sum + item.durationMinutes, 0);
    });
    const goal = data.goals.find(item => item.category === 'Deep Work')?.targetMinutes ?? 0;
    return { sessions, learning, projectMinutes, weeklyMinutes, previous, sportCount, habitRate, daily, goal, deepMinutes: sessions.filter(item => item.category === 'Deep Work').reduce((sum, item) => sum + item.durationMinutes, 0) };
  });
  protected readonly insight = computed(() => {
    const value = this.metrics();
    if (!value.sessions.length) return 'Log your first focus session to see a personal weekly insight here.';
    const bestDay = value.daily.indexOf(Math.max(...value.daily));
    if (value.deepMinutes >= value.goal && value.goal > 0) return `You reached your weekly deep work goal. ${this.days[bestDay]} was your most focused day.`;
    return `${this.days[bestDay]} is your most focused day so far. ${Math.max(0, value.goal - value.deepMinutes)} minutes remain toward your deep work goal.`;
  });

  protected hours(minutes: number): string { return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
  protected height(minutes: number): string { return `${Math.max(4, Math.min(100, minutes / Math.max(1, ...this.metrics().daily) * 100))}%`; }
  protected score(): number {
    const sessions = this.metrics().sessions;
    return sessions.length ? Math.round(sessions.reduce((sum, item) => sum + item.rating, 0) / sessions.length * 20) : 0;
  }
  protected dateForDay(index: number): string {
    const date = new Date(this.startOfWeek);
    date.setDate(date.getDate() + index);
    return localDateKey(date);
  }
  protected isComplete(habitId: string, index: number): boolean {
    return this.data().completions.some(item => item.habitId === habitId && item.date === this.dateForDay(index));
  }
  protected goalPercent(): number { const value = this.metrics(); return value.goal ? Math.min(100, value.deepMinutes / value.goal * 100) : 0; }
  protected weekComparison(): string {
    const value = this.metrics();
    if (!value.previous) return 'Start a weekly trend';
    const change = Math.round((value.weeklyMinutes - value.previous) / value.previous * 100);
    return (change > 0 ? '+' : '') + change + '% vs prior week';
  }
}
