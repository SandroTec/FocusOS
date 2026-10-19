import { Routes } from '@angular/router';
import { DashboardPage } from './dashboard-page';
import { FocusPage } from './focus-page';
import { HabitsPage } from './habits-page';
import { ProjectsPage } from './projects-page';
import { SportsPage } from './sports-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', component: DashboardPage },
  { path: 'focus', component: FocusPage },
  { path: 'sports', component: SportsPage },
  { path: 'projects', component: ProjectsPage },
  { path: 'habits', component: HabitsPage },
  { path: '**', redirectTo: 'dashboard' },
];
