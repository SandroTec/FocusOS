import { Routes } from '@angular/router';
import { AuthPage } from './auth-page';
import { authGuard, guestGuard } from './auth.guards';
import { DashboardPage } from './dashboard-page';
import { FocusPage } from './focus-page';
import { GoalsPage } from './goals-page';
import { HabitsPage } from './habits-page';
import { ProjectsPage } from './projects-page';
import { SportsPage } from './sports-page';

/** Application routes and their standalone page components. */
export const routes: Routes = [
  { path: 'login', component: AuthPage, canActivate: [guestGuard], data: { mode: 'login' } },
  { path: 'register', component: AuthPage, canActivate: [guestGuard], data: { mode: 'register' } },
  { path: 'forgot-password', component: AuthPage, canActivate: [guestGuard], data: { mode: 'forgot' } },
  { path: 'reset-password', component: AuthPage, data: { mode: 'reset' } },
  { path: 'auth/callback', component: AuthPage, data: { mode: 'callback' } },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', component: DashboardPage, canActivate: [authGuard] },
  { path: 'focus', component: FocusPage, canActivate: [authGuard] },
  { path: 'sports', component: SportsPage, canActivate: [authGuard] },
  { path: 'projects', component: ProjectsPage, canActivate: [authGuard] },
  { path: 'habits', component: HabitsPage, canActivate: [authGuard] },
  { path: 'goals', component: GoalsPage, canActivate: [authGuard] },
  { path: '**', redirectTo: 'dashboard' },
];
