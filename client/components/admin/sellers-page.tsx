'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth/auth-provider';
import { EmptyState, ErrorState } from '@/components/marketplace/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminSeller, adminApi } from '@/lib/admin-api';
import { formatDate } from '@/lib/format';
import { AdminShell } from './admin-shell';
import { Pager, ReasonAction, Tabs, errMsg } from './admin-ui';

const TABS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['suspended', 'Suspended'], ['all', 'All']] as const;
type Tab = (typeof TABS)[number][0];

function Row({ s }: { s: AdminSeller }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['admin-sellers'] }), qc.invalidateQueries({ queryKey: ['admin-overview'] })]); };
  const decide = (d: string, ok: string) => async (reason?: string) => { await adminApi.reviewSeller(s.id, d, reason || undefined); toast.success(ok); await refresh(); };
  async function verify() {
    setBusy(true);
    try { await adminApi.setVerified(s.id, !s.verified); toast.success(s.verified ? 'Verified badge removed.' : 'Marked as a verified seller.'); await refresh(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <li className="grid gap-2 rounded-lg border bg-card p-4">
      <p className="flex flex-wrap items-center gap-2"><span className="text-lg font-bold">{s.shopName}</span><Badge variant={s.status === 'approved' ? 'success' : s.status === 'pending' ? 'warning' : 'destructive'}>{s.status}</Badge>
        {s.verified && <span className="inline-flex items-center gap-1 text-sm font-semibold text-success"><BadgeCheck aria-hidden className="size-4" />Verified</span>}</p>
      <p className="text-sm text-muted-foreground">{s.user.displayName} · {s.user.email}{s.user.emailVerified ? '' : ' (email not verified)'} · {s.submittedAt ? `submitted ${formatDate(s.submittedAt)}` : 'not submitted'}</p>
      {s.description && <p className="text-sm">{s.description}</p>}
      <p className="text-sm text-muted-foreground">Categories: {s.categories.join(', ') || 'none'}</p>
      {s.reviewNote && <p className="text-sm text-muted-foreground">Last note: “{s.reviewNote}”</p>}
      <div className="flex flex-wrap items-start gap-2">
        {s.status === 'pending' && <>
          <ReasonAction label="Approve" variant="default" required={false} confirmLabel="Approve seller" onSubmit={decide('approve', 'Seller approved.')} />
          <ReasonAction label="Reject" destructive hint="The applicant will see this reason." onSubmit={decide('reject', 'Application rejected.')} />
        </>}
        {s.status === 'approved' && <ReasonAction label="Suspend" destructive hint="Hides all their listings immediately. The seller will see this reason." onSubmit={decide('suspend', 'Seller suspended.')} />}
        {s.status === 'suspended' && <ReasonAction label="Reinstate" variant="default" required={false} onSubmit={decide('reinstate', 'Seller reinstated.')} />}
        {s.status === 'approved' && user?.roles.includes('admin') && <Button size="sm" variant="ghost" disabled={busy} onClick={verify}>{s.verified ? 'Remove verified badge' : 'Confirm as verified'}</Button>}
      </div>
    </li>
  );
}

function Content() {
  const [tab, setTab] = useState<Tab>('pending');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin-sellers', tab, page], queryFn: () => adminApi.applications(tab, page) });
  return (
    <div>
      <h1 className="text-3xl font-bold">Seller applications</h1>
      <div className="mt-4"><Tabs label="Filter by status" tabs={TABS} value={tab} onChange={(v) => { setTab(v); setPage(1); }} /></div>
      <div className="mt-4">
        {q.isLoading ? <div role="status" aria-label="Loading" className="grid gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-32" />)}</div>
          : q.isError ? <ErrorState message="We couldn’t load seller applications." />
          : !q.data?.data.length ? <EmptyState title="Nothing here" text={tab === 'pending' ? 'No applications are waiting for review.' : 'No sellers match this filter.'} />
          : <><ul className="grid gap-3">{q.data.data.map((s) => <Row key={s.id} s={s} />)}</ul><Pager meta={q.data.meta} onPage={setPage} /></>}
      </div>
    </div>
  );
}
export function SellersPage() { return <AdminShell><Content /></AdminShell>; }
