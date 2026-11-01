'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/marketplace/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { adminApi } from '@/lib/admin-api';
import { formatDate } from '@/lib/format';
import { AdminShell } from './admin-shell';
import { HistoryList, Pager, ReasonAction, errMsg } from './admin-ui';

function Content() {
  const [text, setText] = useState(''); const [q, setQ] = useState('');
  const [status, setStatus] = useState(''); const [role, setRole] = useState(''); const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['admin-users', q, status, role, page], queryFn: () => adminApi.users(q, status, role, page) });
  const sel = 'h-10 rounded-md border border-input bg-card px-2 text-sm';
  return (
    <div>
      <h1 className="text-3xl font-bold">Users</h1>
      <form role="search" onSubmit={(e) => { e.preventDefault(); setQ(text.trim()); setPage(1); }} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm font-semibold">Search<Input value={text} maxLength={100} onChange={(e) => setText(e.target.value)} placeholder="Email or name" className="w-60" /></label>
        <label className="grid gap-1 text-sm font-semibold">Status<select className={sel} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="deactivated">Deactivated</option><option value="deleted">Deleted</option></select></label>
        <label className="grid gap-1 text-sm font-semibold">Role<select className={sel} value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="">Any</option><option value="seller">Seller</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select></label>
        <Button type="submit">Search</Button>
      </form>
      <div className="mt-4">
        {list.isLoading ? <div role="status" aria-label="Loading" className="grid gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          : list.isError ? <ErrorState message="We couldn’t load users." error={list.error} onRetry={() => { void list.refetch(); }} />
          : !list.data?.data.length ? <EmptyState title="No users found" text="Try a different search or filter." />
          : <><ul className="divide-y rounded-lg border bg-card">{list.data.data.map((u) => (
              <li key={u.id}><Link href={`/admin/users/${u.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-secondary">
                <span className="min-w-0"><span className="block truncate font-semibold">{u.displayName}</span><span className="block truncate text-sm text-muted-foreground">{u.email}</span></span>
                <span className="flex flex-wrap gap-1.5"><Badge variant={u.status === 'active' ? 'success' : 'destructive'}>{u.status}</Badge>{u.roles.filter((r) => r !== 'user').map((r) => <Badge key={r}>{r}</Badge>)}</span>
              </Link></li>))}</ul><Pager meta={list.data.meta} onPage={setPage} /></>}
      </div>
    </div>
  );
}
export function UsersPage() { return <AdminShell adminOnly><Content /></AdminShell>; }

function Detail({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-user', id], queryFn: () => adminApi.user(id) });
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['admin-user', id] }), qc.invalidateQueries({ queryKey: ['admin-users'] }), qc.invalidateQueries({ queryKey: ['admin-overview'] })]); };
  async function run(fn: () => Promise<unknown>, ok: string) { try { await fn(); toast.success(ok); await refresh(); } catch (e) { toast.error(errMsg(e)); } }
  if (q.isLoading) return <div role="status" aria-label="Loading"><Skeleton className="h-64" /></div>;
  if (q.isError || !q.data) return <ErrorState message="We couldn’t load this user." error={q.error} onRetry={() => { void q.refetch(); }} />;
  const u = q.data; const isAdminUser = u.roles.includes('admin');
  return (
    <div className="grid gap-5">
      <Button asChild variant="ghost" size="sm" className="justify-self-start"><Link href="/admin/users">← All users</Link></Button>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">{u.profile.displayName}<Badge variant={u.status === 'active' ? 'success' : 'destructive'}>{u.status}</Badge>{u.roles.filter((r) => r !== 'user').map((r) => <Badge key={r}>{r}</Badge>)}</h1>
        <p className="text-sm text-muted-foreground">{u.email}{u.emailVerified ? ' (verified)' : ' (not verified)'} · joined {formatDate(u.createdAt)}{u.lastLoginAt ? ` · last sign-in ${formatDate(u.lastLoginAt)}` : ''}</p>
      </div>
      <dl className="grid gap-2 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold">Full name</dt><dd className="text-muted-foreground">{u.profile.fullName}</dd></div>
        <div><dt className="font-semibold">Phone</dt><dd className="text-muted-foreground">{u.profile.phone ?? 'Not provided'}</dd></div>
        <div><dt className="font-semibold">Campus area</dt><dd className="text-muted-foreground">{u.profile.campusArea ?? 'Not provided'}</dd></div>
        <div><dt className="font-semibold">Student verification</dt><dd>
          <select aria-label="Student verification status" className="h-9 rounded-md border border-input bg-card px-2" value={u.profile.studentVerification} onChange={(e) => run(() => adminApi.studentVerification(id, e.target.value), 'Verification status saved.')}>
            <option value="unverified">Unverified</option><option value="pending">Pending review</option><option value="verified">Verified</option><option value="rejected">Rejected</option>
          </select></dd></div>
        <div><dt className="font-semibold">Seller</dt><dd className="text-muted-foreground">{u.seller ? `${u.seller.shopName} (${u.seller.status}), ${u.seller.listings} listings` : 'Not a seller'}</dd></div>
        <div><dt className="font-semibold">Reports</dt><dd className="text-muted-foreground">{u.activity.reportsFiled} filed · {u.activity.reportsAgainst} against</dd></div>
      </dl>
      <p className="text-xs text-muted-foreground">Student verification here records an administrator’s own decision. No evidence-upload flow exists yet and no verification rule is assumed.</p>
      <div className="flex flex-wrap items-start gap-2">
        {isAdminUser ? <p className="text-sm text-muted-foreground">Administrator accounts can’t be suspended here. Change roles with the server-side CLI.</p>
          : u.status === 'suspended' ? <ReasonAction label="Reactivate" variant="default" required={false} onSubmit={(note) => run(() => adminApi.setUserStatus(id, 'active', note || undefined), 'Account reactivated.')} />
          : <ReasonAction label="Suspend account" destructive hint="Signs them out of every device immediately." onSubmit={(reason) => run(() => adminApi.setUserStatus(id, 'suspended', reason), 'Account suspended.')} disabled={u.status === 'deleted'} />}
        {!isAdminUser && (u.roles.includes('moderator')
          ? <Button size="sm" variant="outline" onClick={() => run(() => adminApi.revokeModerator(id), 'Moderator role removed.')}>Remove moderator role</Button>
          : <Button size="sm" variant="outline" disabled={u.status !== 'active'} onClick={() => run(() => adminApi.grantModerator(id), 'Moderator role granted.')}>Make moderator</Button>)}
      </div>
      <section aria-labelledby="uh"><h2 id="uh" className="mb-2 font-bold">Moderation history</h2><HistoryList items={u.history} /></section>
    </div>
  );
}
export function UserDetail({ id }: { id: string }) { return <AdminShell adminOnly><Detail id={id} /></AdminShell>; }
