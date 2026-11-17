import { describe, expect, it } from 'vitest';
import { dashboardPathForUser, postAuthPathForUser } from './auth-routing';

describe('role-based authentication destinations', () => {
  it('routes buyers to their dashboard', () => {
    expect(dashboardPathForUser({ roles: ['user'], seller: null })).toBe('/account');
  });

  it('routes approved and pending seller profiles through the seller status gate', () => {
    expect(dashboardPathForUser({ roles: ['user', 'seller'], seller: { status: 'approved' } })).toBe('/dashboard');
    expect(dashboardPathForUser({ roles: ['user'], seller: { status: 'pending' } })).toBe('/dashboard');
  });

  it('routes administrators and moderators to their permitted workspace', () => {
    expect(dashboardPathForUser({ roles: ['admin'], seller: null })).toBe('/admin');
    expect(dashboardPathForUser({ roles: ['moderator'], seller: null })).toBe('/admin');
  });

  it('preserves safe requested destinations but prevents unauthorized dashboard redirects', () => {
    const buyer = { roles: ['user'], seller: null };
    expect(postAuthPathForUser(buyer, '/messages')).toBe('/messages');
    expect(postAuthPathForUser(buyer, '/admin/users')).toBe('/account');
    expect(postAuthPathForUser(buyer, '/dashboard/listings/new')).toBe('/account');
    expect(postAuthPathForUser(buyer, '//external.example')).toBe('/account');
  });

  it('keeps moderators out of administrator-only sections', () => {
    const moderator = { roles: ['moderator'], seller: null };
    expect(postAuthPathForUser(moderator, '/admin/reports')).toBe('/admin/reports');
    expect(postAuthPathForUser(moderator, '/admin/settings')).toBe('/admin');
  });
});
