import { CheckCircle2, XCircle } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';

export const metadata = { title: 'System status', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Ready = { status: string; checks: { database: string } };

async function check(): Promise<{ ok: boolean; detail: string }> {
  try {
    const r = await apiFetch<Ready>('/health/ready', { cache: 'no-store', timeoutMs: 4000 });
    return { ok: r.checks.database === 'up', detail: 'API reachable, database connected' };
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    return { ok: false, detail: status === 503 ? 'API reachable, database unavailable' : 'API unreachable' };
  }
}

export default async function StatusPage() {
  const { ok, detail } = await check();
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div className="container py-16">
      <h1 className="text-3xl font-bold">System status</h1>
      <p className="mt-6 flex items-center gap-2 text-lg" role="status">
        <Icon aria-hidden className={ok ? 'text-success' : 'text-destructive'} />
        {detail}
      </p>
    </div>
  );
}
