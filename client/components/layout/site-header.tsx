'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Heart, Menu, MessageCircle, Bell, X, Home, Search, Shapes, Store,
  LayoutDashboard, type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/auth-provider';
import { useRealtime } from '@/components/realtime/realtime-provider';
import { NAV_LINKS } from '@/lib/site';
import { fetchFreshPublicContent } from '@/lib/content';
import { cn } from '@/lib/utils';

const NAV_ICONS: Record<string, LucideIcon> = {
  '/': Home,
  '/browse': Search,
  '/categories': Shapes,
  '/sell': Store,
  '/dashboard': LayoutDashboard,
  '/admin': LayoutDashboard,
};

const ACTION_ICONS: Record<string, LucideIcon> = {
  '/wishlist': Heart,
  '/messages': MessageCircle,
  '/notifications': Bell,
};

function Logo({ imageUrl }: { imageUrl?: string }) {
  return (
    <Link href="/" aria-label="SAZU Marketplace home" className="group flex h-12 max-w-36 shrink-0 items-center font-display sm:max-w-44">
      {imageUrl ? (
        <Image src={imageUrl} alt="" width={176} height={48} unoptimized className="max-h-12 w-auto max-w-full object-contain transition-opacity group-hover:opacity-80" />
      ) : (
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-primary text-sm font-bold text-accent shadow-sm transition-transform group-hover:-rotate-3 group-hover:scale-105">SZ</span>
          <span className="leading-tight">
            <span className="block text-base font-extrabold tracking-tight">SAZU</span>
            <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground">MARKETPLACE</span>
          </span>
        </span>
      )}
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const content = useQuery({ queryKey: ['public-site-content'], queryFn: fetchFreshPublicContent });
  const { status, user, logout } = useAuth();
  const { unreadMessages, unreadNotifications } = useRealtime();
  const badge = (label: string) => (label === 'Messages' ? unreadMessages : label === 'Notifications' ? unreadNotifications : 0);
  const signedIn = status === 'authenticated' && !!user;
  const anonymous = status === 'anonymous';
  const isSeller = signedIn && user?.seller?.status === 'approved';
  const isStaff = signedIn && !!user?.roles.some((r) => r === 'admin' || r === 'moderator');
  const navLinks = [...NAV_LINKS, ...(isSeller ? [{ href: '/dashboard', label: 'Seller dashboard' }] : []), ...(isStaff ? [{ href: '/admin', label: 'Admin' }] : [])];
  const isActive = (href: string) => href === '/'
    ? pathname === '/'
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-primary/10 bg-background/95 shadow-sm backdrop-blur-xl">
      <div className="container flex h-[76px] items-center justify-between gap-3">
        <Logo imageUrl={content.data?.site_logo_url || undefined} />
        <nav aria-label="Main" className="hidden min-w-0 items-center gap-1 rounded-full border bg-secondary/40 p-1 lg:flex">
          {navLinks.map(({ href, label }) => {
            const active = isActive(href);
            const Icon = NAV_ICONS[href];
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-background hover:text-foreground',
                )}
              >
                {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <div className="hidden items-center lg:flex">
            {signedIn && [
              { href: '/wishlist', label: 'Wishlist', Icon: Heart },
              { href: '/messages', label: 'Messages', Icon: MessageCircle },
              { href: '/notifications', label: 'Notifications', Icon: Bell },
            ].map(({ href, label, Icon }) => (
              <Button key={href} asChild variant="ghost" size="icon" className="relative rounded-full text-muted-foreground hover:text-primary">
                <Link href={href} aria-label={badge(label) > 0 ? `${label}, ${badge(label)} unread` : label}>
                  <Icon />
                  {badge(label) > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-5 text-destructive-foreground">{badge(label) > 99 ? '99+' : badge(label)}</span>}
                </Link>
              </Button>
            ))}
          </div>
          {signedIn && user && (
            <>
              <Button asChild variant="outline" size="sm" className="hidden max-w-36 rounded-full lg:inline-flex">
                <Link href="/account" className="truncate">{user.profile.displayName}</Link>
              </Button>
              <Button variant="ghost" size="sm" className="hidden rounded-full lg:inline-flex" onClick={() => void logout()}>Sign out</Button>
            </>
          )}
          {anonymous && (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden rounded-full lg:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="hidden rounded-full lg:inline-flex">
                <Link href="/register">Create account</Link>
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {open && (
        <nav id="mobile-menu" aria-label="Mobile" className="border-t border-primary/10 bg-background/95 shadow-lg backdrop-blur-xl lg:hidden">
          <ul className="container grid gap-1 py-3">
            {[
              ...navLinks,
              ...(signedIn
                ? [
                    { href: '/wishlist', label: 'Wishlist' },
                    { href: '/messages', label: 'Messages' },
                    { href: '/notifications', label: 'Notifications' },
                    { href: '/account', label: 'Your account' },
                  ]
                : []),
            ].map((l) => {
              const Icon = NAV_ICONS[l.href] ?? ACTION_ICONS[l.href];
              return (
                <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={isActive(l.href) ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center justify-between rounded-xl px-3 py-3 font-semibold transition-colors',
                    isActive(l.href) ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-secondary',
                  )}
                >
                  <span className="flex items-center gap-3">
                    {Icon && <Icon aria-hidden className="size-4" />}
                    {l.label}
                  </span>
                  {badge(l.label) > 0 && <span className="rounded-full bg-destructive px-2 text-xs font-bold leading-5 text-destructive-foreground">{badge(l.label)}</span>}
                </Link>
                </li>
              );
            })}
            {signedIn && (
              <li className="mt-2">
                <Button variant="outline" className="w-full" onClick={() => { setOpen(false); void logout(); }}>Sign out</Button>
              </li>
            )}
            {anonymous && (
              <li className="mt-2 grid grid-cols-2 gap-2">
                <Button asChild variant="outline"><Link href="/login" onClick={() => setOpen(false)}>Sign in</Link></Button>
                <Button asChild><Link href="/register" onClick={() => setOpen(false)}>Create account</Link></Button>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
