'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Activity, AlertTriangle, ArrowUpRight, ClipboardList, Eye, Flag, Radio, Store, Users } from 'lucide-react';
import { ErrorState } from '@/components/marketplace/states';
import { Skeleton } from '@/components/ui/skeleton';
import { adminApi } from '@/lib/admin-api';
import { formatMessageTime } from '@/lib/format';
import { AdminShell } from './admin-shell';

const CARDS = [
  { key: 'totalUsers', label: 'Registered users', href: '/admin/users', Icon: Users, tone: 'bg-primary/10 text-primary', detail: 'Marketplace community' },
  { key: 'onlineVisitors', label: 'Online visitors', Icon: Radio, tone: 'bg-success/10 text-success', detail: 'Active in the last 2 minutes' },
  { key: 'uniqueVisitors', label: 'Unique visitors', Icon: Eye, tone: 'bg-brand-light-lime text-brand-deep', detail: 'Since visitor tracking began' },
  { key: 'approvedSellers', label: 'Approved sellers', href: '/admin/sellers', Icon: Store, tone: 'bg-success/10 text-success', detail: 'Ready to sell' },
  { key: 'pendingSellerApplications', label: 'Pending applications', href: '/admin/sellers', Icon: ClipboardList, tone: 'bg-accent/30 text-foreground', detail: 'Seller decisions' },
  { key: 'activeListings', label: 'Active listings', href: '/admin/listings', Icon: Activity, tone: 'bg-primary/10 text-primary', detail: 'Available to students' },
  { key: 'pendingListingReviews', label: 'Listings awaiting review', href: '/admin/listings', Icon: ClipboardList, tone: 'bg-secondary text-secondary-foreground', detail: 'Moderation queue' },
  { key: 'reportedProducts', label: 'Reported listings', href: '/admin/reports', Icon: Flag, tone: 'bg-destructive/10 text-destructive', detail: 'Needs attention' },
  { key: 'openReports', label: 'Open abuse reports', href: '/admin/reports', Icon: AlertTriangle, tone: 'bg-destructive/10 text-destructive', detail: 'Safety follow-up' },
] as const;

function Content() {
  const q = useQuery({
    queryKey: ['admin-overview'],
    queryFn: adminApi.overview,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  return (
    <div className="space-y-8">
      <header className="rounded-2xl bg-brand-navy px-6 py-7 text-white sm:px-8 sm:py-9">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-xs font-semibold tracking-wide">
            <span className="size-2 rounded-full bg-accent shadow-[0_0_12px_hsl(var(--accent))]" />
            MARKETPLACE CONTROL ROOM
          </div>
          <h1 className="text-3xl font-bold sm:text-4xl">Administration</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-primary-foreground/75 sm:text-base">
            A live view of your marketplace activity, seller community, and safety queue.
          </p>
          <p className="mt-5 inline-flex items-center gap-2 text-xs font-medium text-primary-foreground/70">
            <Activity aria-hidden className="size-4 text-accent" />
            {q.isFetching && q.data ? 'Refreshing live data…' : 'Live numbers refresh every 10 seconds'}
          </p>
        </div>
      </header>
      {q.isError ? <div className="mt-6"><ErrorState message="We couldn’t load the overview." error={q.error} onRetry={() => { void q.refetch(); }} /></div> : (
        <>
          <section aria-labelledby="metrics-h">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Marketplace pulse</p>
                <h2 id="metrics-h" className="mt-1 text-xl font-bold">At a glance</h2>
              </div>
              {q.data && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  Updated {new Date(q.dataUpdatedAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              )}
            </div>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {CARDS.map((card, index) => {
                const href = 'href' in card ? card.href : undefined;
                const { key, label, Icon, tone, detail } = card;
                return (
                  <div key={key} className="admin-metric-card group rounded-xl border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg sm:p-5" style={{ animationDelay: `${index * 28}ms` }}>
                    <div className="flex items-start justify-between gap-3">
                      <span className={`grid size-11 place-items-center rounded-xl ${tone}`}>
                        <Icon aria-hidden className="size-5" />
                      </span>
                      {href && (
                        <Link href={href} aria-label={`View ${label}`} className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <ArrowUpRight aria-hidden className="size-4" />
                        </Link>
                      )}
                    </div>
                    <dt className="mt-5 text-sm font-semibold">
                      {href
                        ? <Link href={href} className="rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{label}</Link>
                        : label}
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">{detail}</span>
                    </dt>
                    <dd key={`${key}-${q.data?.metrics[key] ?? 'loading'}`} className="admin-metric-value mt-2 text-3xl font-extrabold tabular-nums tracking-tight">
                      {q.data ? q.data.metrics[key].toLocaleString('en-NG') : <Skeleton className="h-9 w-16" />}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
          <section aria-labelledby="act-h" className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Audit trail</p>
                <h2 id="act-h" className="mt-1 text-xl font-bold">Recent administrative activity</h2>
              </div>
              <Link href="/admin/audit" className="text-sm font-semibold text-primary hover:underline">View audit log</Link>
            </div>
            {!q.data ? <Skeleton className="mt-4 h-32" /> : !q.data.recentActivity.length ? <p className="mt-4 rounded-lg bg-secondary/60 p-4 text-sm text-muted-foreground">No administrative actions recorded yet.</p> : (
              <ul className="mt-4 divide-y rounded-lg border">
                {q.data.recentActivity.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm transition-colors hover:bg-secondary/50">
                    <span className="min-w-0"><span className="font-semibold">{a.action}</span> <span className="text-muted-foreground">by {a.actor ?? 'unknown'}</span></span>
                    <time dateTime={a.createdAt} className="shrink-0 text-xs text-muted-foreground">{formatMessageTime(a.createdAt)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
export function AdminOverview() { return <AdminShell><Content /></AdminShell>; }
