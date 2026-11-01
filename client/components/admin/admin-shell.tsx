'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ClipboardList, Flag, LayoutDashboard, Settings2, ShieldCheck, Tags, Users } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: 'Overview', Icon: LayoutDashboard, adminOnly: false },
  { href: '/admin/sellers', label: 'Sellers', Icon: ShieldCheck, adminOnly: false },
  { href: '/admin/listings', label: 'Listings', Icon: ClipboardList, adminOnly: false },
  { href: '/admin/reports', label: 'Reports', Icon: Flag, adminOnly: false },
  { href: '/admin/users', label: 'Users', Icon: Users, adminOnly: true },
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
  const isAdmin = !!user?.roles.includes('admin');
  const isMod = isAdmin || !!user?.roles.includes('moderator');
  if (!isMod || (adminOnly && !isAdmin)) {
    return (
      <div className="container max-w-xl py-16" role="alert">
        <h1 className="text-2xl font-bold">You don’t have access to this page</h1>
        <p className="mt-2 text-muted-foreground">{isMod ? 'This area is for administrators only.' : 'The admin area is for marketplace moderators and administrators.'}</p>
        <Button asChild className="mt-4"><Link href="/">Back to home</Link></Button>
      </div>
    );
  }
  const visibleNav = NAV.filter((n) => isAdmin || !n.adminOnly);
  return (
    <div className="container grid gap-5 py-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
      <nav aria-label="Admin" className="min-w-0 rounded-2xl border bg-card p-2 shadow-sm lg:sticky lg:top-24 lg:h-fit lg:p-3">
        <div className="hidden border-b px-3 pb-4 pt-2 lg:block">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">SAZU Marketplace</p>
          <p className="mt-1 font-display text-lg font-bold">Admin workspace</p>
          <p className="mt-1 text-xs text-muted-foreground">{isAdmin ? 'Administrator access' : 'Moderator access'}</p>
        </div>
        <p className="hidden px-3 pb-2 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground lg:block">Workspace</p>
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
          {visibleNav.map(({ href, label, Icon }) => {
            const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
            return (
              <li key={href} className="shrink-0 lg:shrink">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-full',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <Icon aria-hidden className={cn('size-4 shrink-0 transition-transform group-hover:scale-110', active && 'text-accent')} />
                  <span>{label}</span>
                  {active && <span aria-hidden className="ml-auto hidden size-1.5 rounded-full bg-accent lg:block" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
