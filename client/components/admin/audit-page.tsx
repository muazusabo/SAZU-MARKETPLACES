'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState, ErrorState } from '@/components/marketplace/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { adminApi } from '@/lib/admin-api';
import { formatMessageTime } from '@/lib/format';
import { AdminShell } from './admin-shell';
import { Pager } from './admin-ui';

function Content() {
  const [text, setText] = useState(''); const [action, setAction] = useState(''); const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin-audit', action, page], queryFn: () => adminApi.audit(action, page) });
  return (
    <div>
      <h1 className="text-3xl font-bold">Audit log</h1>
      <p className="mt-1 text-muted-foreground">An append-only record of sensitive administrative actions. Entries can’t be edited or deleted.</p>
      <form role="search" onSubmit={(e) => { e.preventDefault(); setAction(text.trim()); setPage(1); }} className="mt-4 flex gap-2">
        <label htmlFor="audit-action" className="sr-only">Filter by action</label>
        <Input id="audit-action" value={text} maxLength={80} onChange={(e) => setText(e.target.value)} placeholder="Action starts with… e.g. settings, product, user" className="max-w-sm" />
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      <div className="mt-4">
        {q.isLoading ? <Skeleton className="h-64" /> : q.isError ? <ErrorState message="We couldn’t load the audit log." /> : !q.data?.data.length ? <EmptyState title="No entries" text="Nothing matches." /> : (
          <><ul className="divide-y rounded-lg border bg-card text-sm">{q.data.data.map((a) => (
            <li key={a.id} className="grid gap-1 p-3">
              <p className="flex flex-wrap items-center justify-between gap-2"><span><span className="font-semibold">{a.action}</span> <span className="text-muted-foreground">by {a.actor ?? 'unknown'}</span></span><span className="text-xs text-muted-foreground">{formatMessageTime(a.createdAt)}</span></p>
              {a.resourceType && <p className="break-all text-xs text-muted-foreground">{a.resourceType}: {a.resourceId}</p>}
              {Object.keys(a.metadata).length > 0 && <pre tabIndex={0} role="region" aria-label="Details of this entry" className="overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(a.metadata, null, 2)}</pre>}
            </li>))}</ul><Pager meta={q.data.meta} onPage={setPage} /></>
        )}
      </div>
    </div>
  );
}
export function AuditPage() { return <AdminShell adminOnly><Content /></AdminShell>; }
