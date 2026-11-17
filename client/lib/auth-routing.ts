import { safeNextPath } from './validation';

export interface AuthRedirectUser {
  roles: readonly string[];
  seller: { status: string } | null;
}

export function dashboardPathForUser(user: AuthRedirectUser): string {
  if (user.roles.includes('admin') || user.roles.includes('moderator')) return '/admin';
  if (user.seller) return '/dashboard';
  if (user.roles.includes('seller')) return '/sell';
  return '/account';
}

export function postAuthPathForUser(user: AuthRedirectUser, requestedPath?: string | null): string {
  const fallback = dashboardPathForUser(user);
  const path = safeNextPath(requestedPath, fallback);
  if (path === '/' || path === '/login' || path.startsWith('/login?') || path === '/register' || path.startsWith('/register?')) {
    return fallback;
  }

  const isAdmin = user.roles.includes('admin');
  const isStaff = isAdmin || user.roles.includes('moderator');
  if (path === '/admin' || path.startsWith('/admin/')) {
    if (!isStaff) return fallback;
    if (!isAdmin && /^\/admin\/(users|categories|settings|audit)(\/|$)/.test(path)) return fallback;
  }
  if ((path === '/dashboard' || path.startsWith('/dashboard/')) && !user.seller) return fallback;
  return path;
}
