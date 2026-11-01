'use client';
import { useQuery } from '@tanstack/react-query';
import { ImageOff, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { RequireAuth } from '@/components/auth/require-auth';
import { useRealtime } from '@/components/realtime/realtime-provider';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/marketplace/states';
import { buyerApi } from '@/lib/buyer-api';
import { formatMessageTime } from '@/lib/format';

function Content() {
  const { connected } = useRealtime();
  const q = useQuery({ queryKey: ['conversations'], queryFn: buyerApi.conversations, refetchInterval: connected ? 60_000 : 15_000 });
  return (
    <div className="container max-w-3xl py-8">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><MessageCircle aria-hidden className="size-7 text-primary" />Messages</h1>
      <p className="mt-1 text-muted-foreground">Private conversations with buyers and sellers about listings.</p>
      <div className="mt-6">
        {q.isLoading ? <div role="status" aria-label="Loading conversations" className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          : q.isError ? <ErrorState message="We couldn’t load your messages." />
          : !q.data?.data.length ? <EmptyState title="No conversations yet" text="Open a listing and tap “Chat with Seller” to start one. Sellers see messages from interested buyers here." action={{ href: '/browse', label: 'Browse products' }} />
          : (
            <ul className="grid gap-3">
              {q.data.data.map((c) => (
                <li key={c.id}>
                  <Link href={`/messages/${c.id}`} className="flex gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary">
                    {c.product?.imageUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.product.imageUrl} alt="" className="size-16 shrink-0 rounded-md bg-muted object-cover" />
                      : <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><ImageOff /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2"><span className="truncate font-bold">{c.counterpart.name}</span>{c.unreadCount > 0 && <span className="shrink-0 rounded-full bg-primary px-2 text-xs font-bold leading-5 text-primary-foreground" aria-label={`${c.unreadCount} unread`}>{c.unreadCount}</span>}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatMessageTime(c.lastMessage?.createdAt ?? c.createdAt)}</span>
                      </p>
                      {c.product && <p className="flex items-center gap-2 truncate text-sm text-muted-foreground"><span className="truncate">{c.product.title}</span>
                        {['sold', 'removed', 'unavailable'].includes(c.product.state) && <Badge variant="destructive">{c.product.state === 'removed' ? 'No longer listed' : c.product.state === 'sold' ? 'Sold' : 'Unavailable'}</Badge>}</p>}
                      <p className={`mt-1 truncate text-sm ${c.unreadCount > 0 ? 'font-semibold' : ''}`}>{c.lastMessage ? `${c.lastMessage.mine ? 'You: ' : ''}${c.lastMessage.body}` : <span className="text-muted-foreground">No messages yet. Say hello.</span>}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </div>
    </div>
  );
}

export function Inbox() { return <RequireAuth><Content /></RequireAuth>; }
