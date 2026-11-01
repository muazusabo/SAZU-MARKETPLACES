'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/ui/textarea-field';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.');

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {tabs.map(([v, l]) => <Button key={v} size="sm" variant={value === v ? 'default' : 'outline'} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</Button>)}
    </div>
  );
}

export function Pager({ meta, onPage }: { meta?: { page: number; totalPages: number; total: number }; onPage: (n: number) => void }) {
  if (!meta || meta.totalPages <= 1) return meta ? <p className="mt-3 text-sm text-muted-foreground">{meta.total} {meta.total === 1 ? 'result' : 'results'}</p> : null;
  return (
    <div className="mt-4 flex items-center justify-between">
      <Button size="sm" variant="outline" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Previous</Button>
      <span className="text-sm text-muted-foreground" aria-live="polite">Page {meta.page} of {meta.totalPages} · {meta.total} results</span>
      <Button size="sm" variant="outline" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>Next</Button>
    </div>
  );
}

/**
 * Button that opens a small form asking for a reason before running a decision. The reason is sent to the server, which
 * also enforces it; this is just the interface for collecting it.
 */
export function ReasonAction({ label, confirmLabel, variant = 'outline', hint, required = true, onSubmit, destructive = false, disabled }: {
  label: string; confirmLabel?: string; variant?: 'default' | 'outline' | 'ghost' | 'accent'; hint?: string; required?: boolean; destructive?: boolean; disabled?: boolean;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    if (required && reason.trim().length < 3) return void toast.error('Give a reason of at least 3 characters.');
    setBusy(true);
    try { await onSubmit(reason.trim()); setOpen(false); setReason(''); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  if (!open) return <Button type="button" size="sm" variant={variant} disabled={disabled} onClick={() => setOpen(true)}>{label}</Button>;
  return (
    <div className="grid w-full max-w-md gap-2 rounded-lg border bg-card p-3" role="group" aria-label={label}>
      <TextareaField label={required ? 'Reason (required)' : 'Note (optional)'} rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} hint={hint} />
      <div className="flex gap-2">
        <Button type="button" size="sm" className={cn(destructive && 'bg-destructive hover:bg-destructive/90')} disabled={busy} onClick={go}>{busy ? 'Working…' : confirmLabel ?? label}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export function HistoryList({ items }: { items: { id: string; action: string; reason: string | null; moderator: string | null; createdAt: string }[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>;
  return (
    <ol className="grid gap-2 text-sm">
      {items.map((h) => (
        <li key={h.id} className="rounded-md border bg-card p-2">
          <span className="font-semibold">{h.action}</span> by {h.moderator ?? 'a moderator'} <span className="text-muted-foreground">· {new Date(h.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}</span>
          {h.reason && <p className="mt-0.5 text-muted-foreground">“{h.reason}”</p>}
        </li>
      ))}
    </ol>
  );
}
