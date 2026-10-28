import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Redirects guests to login and preserves their requested destination. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.waitUntilReady();
  if (auth.user()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Keeps signed-in users out of registration and login screens. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.waitUntilReady();
  if (!auth.user()) return true;
  return router.createUrlTree(['/dashboard']);
};
