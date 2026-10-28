import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FocusStore } from './focus-store.service';
import { Project, ProjectStatus } from './data.models';

/** Manages project details, status, and linked focus time. */
@Component({ standalone: true, imports: [FormsModule], templateUrl: './projects-page.html' })
export class ProjectsPage {
  protected readonly store = inject(FocusStore);
  protected readonly data = this.store.data;
  protected readonly palette = [
    { name: 'Mint', value: '#4ad8c0' },
    { name: 'Sky blue', value: '#5bb8ed' },
    { name: 'Violet', value: '#a78bfa' },
    { name: 'Orange', value: '#f4a65e' },
    { name: 'Rose', value: '#f27692' },
  ];
  protected name = '';
  protected description = '';
  protected color = this.palette[0].value;
  protected editingProjectId: string | null = null;
  protected editName = '';
  protected editDescription = '';
  protected editColor = this.palette[0].value;
  protected readonly activeCount = computed(() => this.data().projects.filter(project => project.status === 'Active').length);
  /** Returns focus minutes linked to the given project. */
  protected totalMinutes(projectId: string): number {
    const linked = this.data().sessions.filter(session => session.projectId === projectId);
    return linked.reduce((sum, item) => sum + item.durationMinutes, 0);
  }
  /** Counts focus sessions linked to the given project. */
  protected sessionCount(projectId: string): number {
    return this.data().sessions.filter(session => session.projectId === projectId).length;
  }
  /** Returns focus minutes linked to any project. */
  protected get allTrackedMinutes(): number { return this.data().sessions.filter(session => !!session.projectId).reduce((sum, item) => sum + item.durationMinutes, 0); }
  /** Formats tracked minutes as hours and minutes. */
  protected durationLabel(minutes: number): string {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  /** Applies a supported status selected in the project form. */
  protected statusChange(id: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'Active' || value === 'Paused' || value === 'Completed') this.store.updateProjectStatus(id, value as ProjectStatus);
  }
  /** Opens a project in the inline editor. */
  protected beginEdit(project: Project): void {
    this.editingProjectId = project.id;
    this.editName = project.name;
    this.editDescription = project.description;
    this.editColor = project.color;
  }
  /** Saves valid project edits. */
  protected async saveEdit(project: Project): Promise<void> {
    if (!this.editName.trim()) return;
    const saved = await this.store.updateProject({ ...project, name: this.editName.trim(), description: this.editDescription.trim(), color: this.editColor });
    if (!saved) return;
    this.editingProjectId = null;
  }
  /** Creates a project from the new-project form. */
  protected async add(): Promise<void> {
    if (!this.name.trim()) return;
    if (!await this.store.addProject(this.name, this.description, this.color)) return;
    this.name = '';
    this.description = '';
  }
}
