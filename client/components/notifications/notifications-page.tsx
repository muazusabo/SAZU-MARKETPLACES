'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { RequireAuth } from '@/components/auth/require-auth';
import { useRealtime } from '@/components/realtime/realtime-provider';
import { EmptyState, ErrorState } from '@/components/marketplace/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { AppNotification, buyerApi } from '@/lib/buyer-api';
import { formatMessageTime } from '@/lib/format';
import { cn } from '@/lib/utils';

function Content() {
  const qc = useQueryClient();
  const router = useRouter();
  const { refreshCounts } = useRealtime();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['notifications', page], queryFn: () => buyerApi.notifications(page) });
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['notifications'] }); await refreshCounts(); };

  async function open(n: AppNotification) {
    try { if (!n.read) { await buyerApi.readNotification(n.id); await refresh(); } } catch { /* navigating matters more than the read flag */ }
    if (n.link && n.link.startsWith('/') && !n.link.startsWith('//')) router.push(n.link);
  }
  async function readAll() {
    try { await buyerApi.readAllNotifications(); await refresh(); toast.success('All caught up.'); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not update notifications.'); }
  }

  const unread = q.data?.meta.unreadCount ?? 0;
  return (
    <div className="container max-w-3xl py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-3xl font-bold"><Bell aria-hidden className="size-7 text-primary" />Notifications</h1>
        <Button type="button" variant="outline" size="sm" disabled={unread === 0} onClick={readAll}><CheckCheck />Mark all as read</Button>
      </div>
      <p className="mt-1 text-muted-foreground" aria-live="polite">{unread > 0 ? `${unread} unread` : 'You’re all caught up.'}</p>
      <div className="mt-6">
        {q.isLoading ? <div role="status" aria-label="Loading notifications" className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          : q.isError ? <ErrorState message="We couldn’t load your notifications." />
          : !q.data?.data.length ? <EmptyState title="No notifications yet" text="New messages and decisions about your seller account and listings will show up here." />
          : (
            <>
              <ul className="grid gap-2">
                {q.data.data.map((n) => (
                  <li key={n.id} className="min-w-0">
                    <button type="button" onClick={() => open(n)} className={cn('flex w-full min-w-0 items-start gap-3 overflow-hidden break-words rounded-lg border p-4 text-left transition-colors hover:border-primary', n.read ? 'bg-card' : 'border-primary/40 bg-secondary')}>
                      <span aria-hidden className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn('truncate', n.read ? 'font-semibold' : 'font-bold')}>{n.title}{typeof n.data.count === 'number' && n.data.count > 1 ? ` (${n.data.count})` : ''}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatMessageTime(n.createdAt)}</span>
                        </span>
                        {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>}
                        {!n.read && <span className="sr-only">Unread</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {q.data.meta.totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <span className="text-sm text-muted-foreground" aria-live="polite">Page {q.data.meta.page} of {q.data.meta.totalPages}</span>
                  <Button variant="outline" disabled={page >= q.data.meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}

export function NotificationsPage() { return <RequireAuth><Content /></RequireAuth>; }
