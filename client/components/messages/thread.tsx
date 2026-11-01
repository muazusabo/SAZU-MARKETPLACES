'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, ImageOff, Info, Send } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RequireAuth } from '@/components/auth/require-auth';
import { useRealtime } from '@/components/realtime/realtime-provider';
import { ReportButton } from '@/components/reports/report-button';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/marketplace/states';
import { ApiError } from '@/lib/api';
import { ChatMessage, ListingState, buyerApi } from '@/lib/buyer-api';
import { formatMessageTime, formatNairaFromKobo } from '@/lib/format';
import { MESSAGE_MAX, checkMessage } from '@/lib/validation';
import { cn } from '@/lib/utils';

const NOTICE: Partial<Record<ListingState, string>> = {
  sold: 'This item has been sold. You can keep chatting, but no new conversations can be started about it.',
  unavailable: 'The seller has marked this listing as unavailable.',
  removed: 'This listing is no longer available. You can still continue this conversation.',
};

function Content({ id }: { id: string }) {
  const qc = useQueryClient();
  const { connected, refreshCounts } = useRealtime();
  // New messages arrive over the WebSocket; polling only runs fast when the socket is down.
  const conv = useQuery({ queryKey: ['conversation', id], queryFn: () => buyerApi.conversation(id), refetchInterval: connected ? 60_000 : 15_000 });
  const latest = useQuery({ queryKey: ['messages', id], queryFn: () => buyerApi.messages(id), refetchInterval: connected ? 30_000 : 4_000, enabled: conv.isSuccess });
  const lastMarked = useRef<string | null>(null);
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const messages = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of [...older, ...(latest.data?.data ?? [])]) map.set(m.id, m);
    return [...map.values()].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  }, [older, latest.data]);
  const lastSeenId = [...messages].reverse().find((m) => m.mine && m.read)?.id ?? null;
  const nextBefore = cursor !== undefined ? cursor : latest.data?.meta.nextBefore ?? null;

  useEffect(() => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [messages.length]);

  // Reading the conversation marks it read (clears the badge and shows "Seen" to the other person) while the tab is visible.
  const newestFromOther = [...messages].reverse().find((m) => !m.mine)?.id ?? null;
  useEffect(() => {
    if (!newestFromOther || newestFromOther === lastMarked.current) return;
    const mark = () => {
      if (document.visibilityState !== 'visible') return;
      lastMarked.current = newestFromOther;
      buyerApi.markRead(id).then(() => Promise.all([refreshCounts(), qc.invalidateQueries({ queryKey: ['conversations'] }), qc.invalidateQueries({ queryKey: ['notifications'] })])).catch(() => { lastMarked.current = null; });
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [newestFromOther, id, qc, refreshCounts]);

  const blockMutation = useMutation({
    mutationFn: (block: boolean) => (block ? buyerApi.block(id) : buyerApi.unblock(id)),
    onSuccess: async (_d, block) => { toast.success(block ? 'Blocked. Neither of you can send messages here.' : 'Unblocked.'); await qc.invalidateQueries({ queryKey: ['conversation', id] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update the block. Try again.'),
  });

  async function loadEarlier() {
    if (!nextBefore) return;
    setLoadingOlder(true);
    try { const page = await buyerApi.messages(id, nextBefore); setOlder((o) => [...page.data, ...o]); setCursor(page.meta.nextBefore); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not load earlier messages.'); }
    finally { setLoadingOlder(false); }
  }

  const send = useMutation({
    mutationFn: (body: string) => buyerApi.send(id, body),
    onSuccess: async () => { setText(''); stick.current = true; await Promise.all([qc.invalidateQueries({ queryKey: ['messages', id] }), qc.invalidateQueries({ queryKey: ['conversations'] })]); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Message not sent. Try again.'),
  });
  function submit() {
    const r = checkMessage(text);
    if (!r.ok) return void toast.error(r.error);
    send.mutate(r.body);
  }

  if (conv.isLoading) return <div className="container max-w-3xl py-8" role="status" aria-label="Loading conversation"><Skeleton className="h-20" /><Skeleton className="mt-4 h-72" /></div>;
  if (conv.isError || !conv.data) {
    return (
      <div className="container max-w-3xl py-8">
        <ErrorState message={conv.error instanceof ApiError && conv.error.status === 404 ? 'This conversation doesn’t exist or you’re not part of it.' : 'We couldn’t load this conversation.'} />
        <Button asChild variant="outline" className="mt-4"><Link href="/messages">Back to messages</Link></Button>
      </div>
    );
  }
  const c = conv.data; const p = c.product;
  return (
    <div className="container flex h-[calc(100dvh-8rem)] min-h-[24rem] max-w-3xl flex-col py-3 sm:py-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to messages"><Link href="/messages"><ArrowLeft /></Link></Button>
        <h1 className="truncate text-2xl font-bold">{c.counterpart.name}</h1>
        <span className="rounded-sm bg-secondary px-2 py-0.5 text-xs font-semibold">{c.role === 'buyer' ? 'Seller' : 'Buyer'}</span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1 pl-1">
        <ConfirmButton size="sm" variant="ghost" className="text-muted-foreground" confirmLabel={c.blockedByMe ? 'Unblock?' : 'Block this person?'} disabled={blockMutation.isPending} onConfirm={() => blockMutation.mutate(!c.blockedByMe)}>
          <Ban />{c.blockedByMe ? 'Unblock' : 'Block'}
        </ConfirmButton>
        <ReportButton targetType="conversation" targetId={id} label="Report conversation" />
      </div>

      {p && (
        <section aria-label="Listing" className="mt-3 flex items-center gap-3 rounded-lg border bg-card p-3">
          {p.imageUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.imageUrl} alt="" className="size-14 shrink-0 rounded-md bg-muted object-cover" />
            : <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><ImageOff /></span>}
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{p.href ? <Link href={p.href} className="hover:underline">{p.title}</Link> : p.title}</p>
            <p className="text-sm text-muted-foreground">{formatNairaFromKobo(p.priceKobo)}</p>
          </div>
        </section>
      )}
      {p && NOTICE[p.state] && <p role="status" className="mt-2 flex items-start gap-2 rounded-lg border-l-4 border-destructive bg-destructive/5 p-3 text-sm"><Info aria-hidden className="mt-0.5 size-4 shrink-0" />{NOTICE[p.state]}</p>}

      <div ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border bg-muted/40 p-3">
        {nextBefore && <div className="mb-3 text-center"><Button type="button" size="sm" variant="outline" disabled={loadingOlder} onClick={loadEarlier}>{loadingOlder ? 'Loading…' : 'Load earlier messages'}</Button></div>}
        {latest.isLoading ? <Skeleton className="h-16 w-2/3" />
          : latest.isError && !messages.length ? <ErrorState message="We couldn’t load messages." />
          : messages.length === 0 ? <p className="py-10 text-center text-muted-foreground">No messages yet. Say hello and ask about the item.</p>
          : (
            <ol aria-live="polite" aria-label="Messages" className="grid gap-2">
              {messages.map((m) => (
                <li key={m.id} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[85%] rounded-2xl px-3 py-2', m.mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border bg-card')}>
                    <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                    <p className={cn('mt-1 text-right text-[11px]', m.mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{formatMessageTime(m.createdAt)}{m.id === lastSeenId ? ' · Seen' : ''}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
      </div>

      {!c.canSend && (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-lg border bg-card p-3 text-sm"><Ban aria-hidden className="mt-0.5 size-4 shrink-0" />
          {c.blockedByMe ? 'You’ve blocked this person. Unblock them to send messages.' : 'You can’t send messages in this conversation.'}</p>
      )}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className={cn('mt-3 grid gap-2', !c.canSend && 'hidden')}>
        <label htmlFor="msg" className="sr-only">Message</label>
        <div className="flex items-end gap-2">
          <textarea id="msg" rows={2} maxLength={MESSAGE_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-input bg-card px-3 py-2 text-base sm:text-sm" />
          <Button type="submit" size="lg" className="size-11 shrink-0 rounded-xl px-0 sm:h-11 sm:w-auto sm:px-4" disabled={send.isPending || !text.trim()} aria-label="Send message"><Send /><span className="hidden sm:inline">{send.isPending ? 'Sending…' : 'Send'}</span></Button>
        </div>
        {text.length > MESSAGE_MAX - 200 && <p className="text-xs text-muted-foreground" aria-live="polite">{text.length.toLocaleString('en-NG')} / {MESSAGE_MAX.toLocaleString('en-NG')}</p>}
        <p className="text-xs text-muted-foreground">Meet in busy parts of campus and check the item before paying. Payment is arranged directly between you and the other person; never share passwords or bank PINs.</p>
      </form>
    </div>
  );
}

export function Thread({ id }: { id: string }) { return <RequireAuth><Content id={id} /></RequireAuth>; }
