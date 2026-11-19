'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowRight, Heart, Menu, MessageCircle, Bell, X, Home, Search, Shapes, Store,
  LayoutDashboard, ChevronDown, UserRound, ShieldCheck, Package, LogOut, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/auth-provider';
import { useRealtime } from '@/components/realtime/realtime-provider';
import { NAV_LINKS } from '@/lib/site';
import { cn } from '@/lib/utils';
import { SiteLogo } from './site-logo';

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

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { status, user, logout } = useAuth();
  const { unreadMessages, unreadNotifications } = useRealtime();
  const badge = (label: string) => (label === 'Messages' ? unreadMessages : label === 'Notifications' ? unreadNotifications : 0);
  const signedIn = status === 'authenticated' && !!user;
  const anonymous = status === 'anonymous';
  const isSeller = signedIn && user?.seller?.status === 'approved';
  const isStaff = signedIn && !!user?.roles.some((r) => r === 'admin' || r === 'moderator');
  const dashboardHref = isStaff ? '/admin' : isSeller ? '/dashboard' : '/account';
  const accountLinks = [
    ...(isSeller ? [{ href: '/dashboard', label: 'Seller dashboard' }] : []),
    ...(isStaff ? [{ href: '/admin', label: 'Admin dashboard' }] : []),
  ];
  const isActive = (href: string) => href === '/'
    ? pathname === '/'
    : pathname === href || pathname.startsWith(`${href}/`);
  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = searchTerm.trim().slice(0, 100);
    router.push(term ? `/browse?q=${encodeURIComponent(term)}` : '/browse');
    setOpen(false);
  }

  useEffect(() => {
    setOpen(false);
    setMobileProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open && !mobileProfileOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        setMobileProfileOpen(false);
      }
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, mobileProfileOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-white/95 shadow-[0_3px_18px_-14px_rgba(3,61,46,0.5)] backdrop-blur-xl">
      <div className="container flex h-[68px] items-center gap-3 sm:gap-5">
        <SiteLogo />
        <nav aria-label="Main" className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex lg:gap-2 xl:gap-3">
          {NAV_LINKS.map(({ href, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-brand-light-lime text-brand-deep'
                    : 'text-muted-foreground hover:bg-brand-cream hover:text-brand-deep',
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <form onSubmit={submitSearch} role="search" className="ml-auto hidden min-w-0 max-w-[280px] flex-1 items-center rounded-full border border-border bg-brand-cream/70 px-3 transition-colors focus-within:border-primary/40 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/10 xl:flex lg:ml-0">
          <label htmlFor="header-search" className="sr-only">Search products</label>
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            id="header-search"
            type="search"
            value={searchTerm}
            maxLength={100}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search products..."
            className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button type="submit" aria-label="Submit search" className="grid size-8 shrink-0 place-items-center rounded-full text-primary transition-colors hover:bg-brand-light-lime">
            <ArrowRight aria-hidden className="size-4" />
          </button>
        </form>
        <div className="ml-auto flex shrink-0 items-center gap-0 sm:gap-1.5 lg:ml-0">
          <div className="hidden items-center lg:flex">
            {signedIn && [
              { href: '/wishlist', label: 'Wishlist', Icon: Heart },
              { href: '/messages', label: 'Messages', Icon: MessageCircle },
              { href: '/notifications', label: 'Notifications', Icon: Bell },
            ].map(({ href, label, Icon }) => (
              <Button key={href} asChild variant="ghost" size="icon" className={cn('relative rounded-full text-muted-foreground hover:bg-brand-cream hover:text-primary', isActive(href) && 'bg-brand-cream text-primary')}>
                <Link href={href} aria-label={badge(label) > 0 ? `${label}, ${badge(label)} unread` : label}>
                  <Icon />
                  {badge(label) > 0 && <span aria-hidden className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">{badge(label) > 99 ? '99+' : badge(label)}</span>}
                </Link>
              </Button>
            ))}
          </div>
          {signedIn && user && (
            <details className="group relative hidden lg:block">
              <summary aria-label="Open account menu" className="flex cursor-pointer list-none items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-brand-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {user.profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.profile.avatarUrl} alt="" className="size-9 rounded-full border border-border object-cover" />
                ) : (
                  <span aria-hidden className="grid size-9 place-items-center rounded-full bg-brand-light-lime text-sm font-bold text-brand-deep">
                    {user.profile.displayName.trim().slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="hidden max-w-24 truncate text-xs font-semibold text-foreground 2xl:block">{user.profile.displayName}</span>
                <ChevronDown aria-hidden className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-border bg-white p-2 shadow-xl">
                <div className="border-b border-border px-3 py-2">
                  <p className="truncate text-sm font-bold">{user.profile.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Link href="/account" className="mt-1 flex rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-brand-cream">Your account</Link>
                {accountLinks.map((item) => (
                  <Link key={item.href} href={item.href} className="flex rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-brand-cream">{item.label}</Link>
                ))}
                <button type="button" onClick={() => void logout()} className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-destructive hover:bg-destructive/5">
                  Sign out
                </button>
              </div>
            </details>
          )}
          {anonymous && (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden rounded-full px-3 lg:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="hidden h-10 rounded-full px-4 lg:inline-flex">
                <Link href="/register">Join SAZU</Link>
              </Button>
            </>
          )}
          <Button asChild variant="ghost" size="icon" className="size-9 rounded-full max-[360px]:size-8 lg:hidden">
            <Link href="/browse" aria-label="Search products"><Search aria-hidden /></Link>
          </Button>
          {signedIn && (
            <>
              <Button asChild variant="ghost" size="icon" className={cn('relative size-9 rounded-full max-[360px]:size-8 lg:hidden', isActive('/messages') && 'bg-brand-cream text-primary')}>
                <Link href="/messages" aria-label={badge('Messages') > 0 ? `Messages, ${badge('Messages')} unread` : 'Messages'}>
                  <MessageCircle aria-hidden />
                  {badge('Messages') > 0 && <span aria-hidden className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">{badge('Messages') > 99 ? '99+' : badge('Messages')}</span>}
                </Link>
              </Button>
              <Button asChild variant="ghost" size="icon" className={cn('relative size-9 rounded-full max-[360px]:size-8 lg:hidden', isActive('/notifications') && 'bg-brand-cream text-primary')}>
                <Link href="/notifications" aria-label={badge('Notifications') > 0 ? `Notifications, ${badge('Notifications')} unread` : 'Notifications'}>
                  <Bell aria-hidden />
                  {badge('Notifications') > 0 && <span aria-hidden className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">{badge('Notifications') > 99 ? '99+' : badge('Notifications')}</span>}
                </Link>
              </Button>
              {user && (
                <div className="relative lg:hidden">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={mobileProfileOpen ? 'Close profile menu' : 'Open profile menu'}
                    aria-expanded={mobileProfileOpen}
                    aria-controls="mobile-profile-menu"
                    onClick={() => {
                      setMobileProfileOpen((value) => !value);
                      setOpen(false);
                    }}
                    className={cn('size-9 rounded-xl border border-transparent max-[360px]:size-8', mobileProfileOpen && 'border-accent text-brand-deep')}
                  >
                    {user.profile.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.profile.avatarUrl} alt="" className="size-7 rounded-full object-cover" />
                    ) : <UserRound aria-hidden />}
                  </Button>
                  {mobileProfileOpen && (
                    <nav id="mobile-profile-menu" aria-label="Profile" className="absolute right-0 top-full z-[60] mt-2 w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-border bg-white shadow-xl">
                      <div className="border-b border-border px-4 py-3">
                        <p className="truncate text-sm font-bold">{user.profile.displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <ul className="grid gap-1 p-2">
                        {[
                          { href: '/account', label: 'My Profile', Icon: UserRound },
                          { href: '/account#student-verification-title', label: 'Profile Verification', Icon: ShieldCheck },
                          { href: dashboardHref, label: 'Dashboard', Icon: LayoutDashboard },
                          ...(isSeller ? [{ href: '/dashboard#seller-listings', label: 'My Listings', Icon: Package }] : []),
                          { href: '/wishlist', label: 'Favorites', Icon: Heart },
                          { href: '/messages', label: 'Messages', Icon: MessageCircle },
                        ].map(({ href, label, Icon }) => (
                          <li key={`${label}-${href}`}>
                            <Link
                              href={href}
                              onClick={() => setMobileProfileOpen(false)}
                              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-brand-cream"
                            >
                              <Icon aria-hidden className="size-5 shrink-0" />
                              {label}
                              {badge(label) > 0 && <span className="ml-auto rounded-full bg-destructive px-2 text-xs font-bold leading-5 text-destructive-foreground">{badge(label)}</span>}
                            </Link>
                          </li>
                        ))}
                      </ul>
                      <div className="border-t border-border p-2">
                        <button
                          type="button"
                          onClick={() => { setMobileProfileOpen(false); void logout(); }}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-destructive transition-colors hover:bg-destructive/5"
                        >
                          <LogOut aria-hidden className="size-5 shrink-0" />
                          Sign out
                        </button>
                      </div>
                    </nav>
                  )}
                </div>
              )}
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full max-[360px]:size-8 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </Button>
        </div>
      </div>
      {open && (
        <nav id="mobile-menu" aria-label="Mobile" className="absolute inset-x-0 top-full max-h-[calc(100dvh-4.25rem)] overflow-y-auto border-t border-border bg-white shadow-xl lg:hidden">
          <ul className="container grid gap-1 py-4">
            <li className="mb-2">
              <form onSubmit={submitSearch} role="search" className="flex items-center gap-2 rounded-2xl border border-border bg-brand-cream/70 px-3 focus-within:border-primary/40 focus-within:bg-white">
                <label htmlFor="mobile-header-search" className="sr-only">Search products</label>
                <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <input
                  id="mobile-header-search"
                  type="search"
                  value={searchTerm}
                  maxLength={100}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search products..."
                  className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <button type="submit" className="rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-brand-deep">Search</button>
              </form>
            </li>
            {[
              ...NAV_LINKS,
              ...(signedIn
                ? [
                    { href: '/wishlist', label: 'Wishlist' },
                    { href: '/messages', label: 'Messages' },
                    { href: '/notifications', label: 'Notifications' },
                    { href: '/account', label: 'Your account' },
                    ...accountLinks,
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
                    'flex items-center justify-between rounded-xl px-3 py-3.5 text-sm font-semibold transition-colors',
                    isActive(l.href) ? 'bg-brand-light-lime text-brand-deep' : 'text-foreground hover:bg-brand-cream',
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
                <Button asChild variant="outline" className="h-11 rounded-xl"><Link href="/login" onClick={() => setOpen(false)}>Sign in</Link></Button>
                <Button asChild className="h-11 rounded-xl"><Link href="/register" onClick={() => setOpen(false)}>Join SAZU</Link></Button>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
