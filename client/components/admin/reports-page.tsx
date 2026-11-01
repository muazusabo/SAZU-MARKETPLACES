'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/marketplace/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminReport, adminApi } from '@/lib/admin-api';
import { formatMessageTime } from '@/lib/format';
import { REPORT_REASONS } from '@/lib/validation';
import { cn } from '@/lib/utils';
import { AdminShell } from './admin-shell';
import { HistoryList, Pager, ReasonAction, Tabs, errMsg } from './admin-ui';

const TABS = [['active', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['all', 'All']] as const;
type Tab = (typeof TABS)[number][0];
const reasonLabel = (v: string) => REPORT_REASONS.find((r) => r.value === v)?.label ?? v;

/** Where a moderator can act on the thing that was reported. */
function targetLink(r: AdminReport): { href: string; label: string } | null {
  if (r.targetType === 'product') return { href: `/admin/listings/${r.targetId}`, label: 'Inspect listing' };
  if (r.targetType === 'seller') return r.sellerSlug ? { href: `/seller/${r.sellerSlug}`, label: 'View storefront' } : null;
  if (r.targetType === 'user') return { href: `/admin/users/${r.targetId}`, label: 'Open user' };
  return null;
}

function Content() {
  const [tab, setTab] = useState<Tab>('active');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin-reports', tab, type, page], queryFn: () => adminApi.reports(tab, type, page) });
  return (
    <div>
      <h1 className="text-3xl font-bold">Reports</h1>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Tabs label="Filter by status" tabs={TABS} value={tab} onChange={(v) => { setTab(v); setPage(1); }} />
        <label className="flex items-center gap-2 text-sm font-semibold">Type
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-card px-2 text-sm font-normal">
            <option value="">All</option><option value="product">Listings</option><option value="seller">Sellers</option><option value="user">People</option><option value="conversation">Conversations</option>
          </select>
        </label>
      </div>
      <div className="mt-4">
        {q.isLoading ? <div role="status" aria-label="Loading" className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          : q.isError ? <ErrorState message="We couldn’t load reports." />
          : !q.data?.data.length ? <EmptyState title="No reports" text="Nothing needs attention here." />
          : <><ul className="grid gap-3">{q.data.data.map((r) => (
              <li key={r.id}><Link href={`/admin/reports/${r.id}`} className="block rounded-lg border bg-card p-4 hover:border-primary">
                <p className="flex flex-wrap items-center gap-2"><span className="font-bold">{r.targetLabel}</span><Badge>{r.targetType}</Badge><Badge variant={r.status === 'open' ? 'warning' : r.status === 'reviewing' ? 'default' : 'success'}>{r.status}</Badge>
                  {r.reportsOnTarget > 1 && <span className="text-xs font-semibold text-destructive">{r.reportsOnTarget} reports on this</span>}</p>
                <p className="text-sm text-muted-foreground">{reasonLabel(r.reason)} · reported by {r.reporter} · {formatMessageTime(r.createdAt)}</p>
              </Link></li>))}</ul><Pager meta={q.data.meta} onPage={setPage} /></>}
      </div>
    </div>
  );
}
export function ReportsPage() { return <AdminShell><Content /></AdminShell>; }

function Detail({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-report', id], queryFn: () => adminApi.report(id) });
  const act = (status: string, ok: string) => async (note?: string) => {
    await adminApi.updateReport(id, status, note || undefined); toast.success(ok);
    await Promise.all([qc.invalidateQueries({ queryKey: ['admin-report', id] }), qc.invalidateQueries({ queryKey: ['admin-reports'] }), qc.invalidateQueries({ queryKey: ['admin-overview'] })]);
  };
  async function review() { try { await act('reviewing', 'Marked as under review.')(); } catch (e) { toast.error(errMsg(e)); } }
  if (q.isLoading) return <div role="status" aria-label="Loading"><Skeleton className="h-64" /></div>;
  if (q.isError || !q.data) return <ErrorState message="We couldn’t find that report." />;
  const r = q.data; const link = targetLink(r); const closed = ['resolved', 'dismissed'].includes(r.status);
  return (
    <div className="grid gap-5">
      <Button asChild variant="ghost" size="sm" className="justify-self-start"><Link href="/admin/reports">← All reports</Link></Button>
      <div>
        <h1 className="text-2xl font-bold">{r.targetLabel}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{r.targetType} report · {reasonLabel(r.reason)} · by {r.reporter} · {formatMessageTime(r.createdAt)} · status <strong>{r.status}</strong>{r.reportsOnTarget > 1 ? ` · ${r.reportsOnTarget} reports on this target` : ''}</p>
      </div>
      {r.details && <section aria-label="Details" className="rounded-lg border bg-card p-4"><h2 className="font-bold">What the reporter said</h2><p className="mt-1 whitespace-pre-line text-sm">{r.details}</p></section>}
      {r.targetType === 'conversation' && (
        <section aria-label="Conversation" className="rounded-lg border bg-card p-4">
          <h2 className="font-bold">Conversation transcript</h2>
          <p className="text-xs text-muted-foreground">Visible only because it was reported. Your access is recorded in the audit log.</p>
          <ol className="mt-3 grid gap-2">
            {(r.conversation ?? []).map((m) => (
              <li key={m.id} className={cn('max-w-[85%] rounded-lg border p-2 text-sm', m.role === 'seller' ? 'justify-self-end bg-secondary' : 'bg-muted')}>
                <span className="text-xs font-semibold">{m.name} ({m.role})</span><p className="whitespace-pre-wrap break-words">{m.body}</p>
                <span className="text-[11px] text-muted-foreground">{formatMessageTime(m.createdAt)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {r.resolutionNote && <p className="rounded-lg border-l-4 border-accent bg-card p-3 text-sm">Decision note: “{r.resolutionNote}”</p>}
      <div className="flex flex-wrap items-start gap-2">
        {link && <Button asChild variant="outline" size="sm"><Link href={link.href}>{link.label}</Link></Button>}
        {r.status === 'open' && <Button size="sm" variant="outline" onClick={review}>Start review</Button>}
        {!closed && <>
          <ReasonAction label="Resolve" variant="default" hint="Record what you did. The reporter gets a generic thank-you." onSubmit={act('resolved', 'Report resolved.')} />
          <ReasonAction label="Dismiss" hint="Record why no breach was found." onSubmit={act('dismissed', 'Report dismissed.')} />
        </>}
      </div>
      <details><summary className="cursor-pointer text-sm font-semibold">Decision history</summary><div className="mt-2"><HistoryList items={r.history ?? []} /></div></details>
    </div>
  );
}
export function ReportDetail({ id }: { id: string }) { return <AdminShell><Detail id={id} /></AdminShell>; }
