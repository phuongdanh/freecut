import { redirect } from '@tanstack/react-router';

const TOKEN_KEY = 'token';

export function isAuthenticated(): boolean {
  return typeof window !== 'undefined' && !!localStorage.getItem(TOKEN_KEY);
}

/** Safe in-app path for post-login redirect (no open redirects). */
export function sanitizeRedirect(path: string | undefined): string {
  if (!path || typeof path !== 'string') return '/';
  if (!path.startsWith('/')) return '/';
  if (path.startsWith('/login') || path.startsWith('/register')) return '/';
  return path;
}

export function requireAuth(context: {
  location: { pathname: string; search?: Record<string, unknown> };
}) {
  if (!isAuthenticated()) {
    const { pathname } = context.location;
    const redirectPath = pathname !== '/' && pathname !== '/login' ? pathname : undefined;
    throw redirect({
      to: '/login',
      search: redirectPath ? { redirect: redirectPath } : {},
    });
  }
}

export function requireGuest() {
  if (isAuthenticated()) {
    throw redirect({ to: '/' });
  }
}
