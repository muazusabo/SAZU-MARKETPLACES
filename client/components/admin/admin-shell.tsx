'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ClipboardList, Flag, LayoutDashboard, Megaphone, PanelLeftClose, PanelLeftOpen, Settings2, ShieldCheck, Tags, Users } from 'lucide-react';
import { useState } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { useAuth } from '@/components/auth/auth-provider';
import { PermissionDenied } from '@/components/marketplace/states';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: 'Overview', Icon: LayoutDashboard, adminOnly: false },
  { href: '/admin/sellers', label: 'Sellers', Icon: ShieldCheck, adminOnly: false },
  { href: '/admin/listings', label: 'Listings', Icon: ClipboardList, adminOnly: false },
  { href: '/admin/reports', label: 'Reports', Icon: Flag, adminOnly: false },
  { href: '/admin/users', label: 'Users', Icon: Users, adminOnly: true },
  { href: '/admin/advertisements', label: 'Advertisements', Icon: Megaphone, adminOnly: true },
  { href: '/admin/categories', label: 'Categories', Icon: Tags, adminOnly: true },
  { href: '/admin/settings', label: 'Settings', Icon: Settings2, adminOnly: true },
  { href: '/admin/audit', label: 'Audit log', Icon: Activity, adminOnly: true },
];

/**
 * Hides what a person can't use. The real restriction is on the API: every admin endpoint checks the role itself,
 * so editing this check in the browser would only show empty error screens.
 */
export function AdminShell({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  return <RequireAuth><Inner adminOnly={adminOnly}>{children}</Inner></RequireAuth>;
}

function Inner({ children, adminOnly }: { children: React.ReactNode; adminOnly: boolean }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = !!user?.roles.includes('admin');
  const isMod = isAdmin || !!user?.roles.includes('moderator');
  if (!isMod || (adminOnly && !isAdmin)) {
    return (
      <div className="container max-w-2xl py-16">
        <PermissionDenied message={isMod ? 'This area is available to administrators only. Your current role cannot open it.' : 'This area is available to marketplace moderators and administrators. If you believe you should have access, contact support.'} />
      </div>
    );
  }
  const visibleNav = NAV.filter((n) => isAdmin || !n.adminOnly);
  return (
    <div className={cn('admin-layout container grid gap-5 py-6 transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none lg:gap-8', collapsed ? 'lg:grid-cols-[76px_minmax(0,1fr)]' : 'lg:grid-cols-[240px_minmax(0,1fr)]')}>
      <nav aria-label="Admin" className={cn('admin-sidebar min-w-0 rounded-2xl border bg-card p-2 shadow-sm transition-[padding] duration-300 motion-reduce:transition-none lg:sticky lg:top-24 lg:h-fit lg:p-3', collapsed && 'lg:px-2')}>
        <div className={cn('hidden border-b px-3 pb-4 pt-2 lg:block', collapsed && 'lg:px-1 lg:text-center')}>
          <div className="flex items-start justify-between gap-2">
            <div className={collapsed ? 'lg:sr-only' : ''}>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">SAZU Marketplace</p>
              <p className="mt-1 font-display text-lg font-bold">Admin workspace</p>
              <p className="mt-1 text-xs text-muted-foreground">{isAdmin ? 'Administrator access' : 'Moderator access'}</p>
            </div>
            <button type="button" aria-label={collapsed ? 'Expand admin sidebar' : 'Collapse admin sidebar'} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)} className="hidden shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex">
              {collapsed ? <PanelLeftOpen aria-hidden className="size-4" /> : <PanelLeftClose aria-hidden className="size-4" />}
            </button>
          </div>
        </div>
        <p className="hidden px-3 pb-2 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground lg:block">Workspace</p>
        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
          {visibleNav.map(({ href, label, Icon }) => {
            const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
            return (
              <li key={href} className="min-w-0">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'admin-nav-link group relative flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-2 py-2.5 text-sm font-semibold transition-all duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:px-3',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:-translate-y-px hover:bg-secondary hover:text-foreground hover:shadow-sm',
                    collapsed && 'lg:justify-center lg:px-1',
                  )}
                  title={collapsed ? label : undefined}
                >
                  <Icon aria-hidden className={cn('size-4 shrink-0 transition-transform group-hover:scale-110', active && 'text-accent')} />
                  <span className={collapsed ? 'lg:sr-only' : ''}>{label}</span>
                  {active && <span aria-hidden className="admin-active-indicator ml-auto hidden h-5 w-1 origin-left rounded-full bg-accent lg:block" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <main id="admin-main" className="admin-content min-w-0">{children}</main>
    </div>
  );
}
