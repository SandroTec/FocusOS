import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FocusStore } from './focus-store.service';
import { Project, ProjectStatus } from './data.models';

@Component({ standalone: true, imports: [FormsModule], templateUrl: './projects-page.html' })
export class ProjectsPage {
  protected readonly store = inject(FocusStore);
  protected readonly data = this.store.data;
  protected readonly palette = ['#4ad8c0', '#5bb8ed', '#a78bfa', '#f4a65e', '#f27692'];
  protected name = '';
  protected description = '';
  protected color = this.palette[0];
  protected editingProjectId: string | null = null;
  protected editName = '';
  protected editDescription = '';
  protected editColor = this.palette[0];
  protected readonly activeCount = computed(() => this.data().projects.filter(project => project.status === 'Active').length);
  protected totalMinutes(projectId: string): number { return this.data().sessions.filter(session => session.projectId === projectId).reduce((sum, item) => sum + item.durationMinutes, 0); }
  protected get allTrackedMinutes(): number { return this.data().sessions.filter(session => !!session.projectId).reduce((sum, item) => sum + item.durationMinutes, 0); }
  protected durationLabel(minutes: number): string { return Math.floor(minutes / 60) + 'h ' + minutes % 60 + 'm'; }
  protected statusChange(id: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'Active' || value === 'Paused' || value === 'Completed') this.store.updateProjectStatus(id, value as ProjectStatus);
  }
  protected beginEdit(project: Project): void { this.editingProjectId = project.id; this.editName = project.name; this.editDescription = project.description; this.editColor = project.color; }
  protected saveEdit(project: Project): void {
    if (!this.editName.trim()) return;
    this.store.updateProject({ ...project, name: this.editName.trim(), description: this.editDescription.trim(), color: this.editColor });
    this.editingProjectId = null;
  }
  protected add(): void {
    if (!this.name.trim()) return;
    this.store.addProject(this.name, this.description, this.color);
    this.name = '';
    this.description = '';
  }
}
