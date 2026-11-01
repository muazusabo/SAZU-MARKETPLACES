'use client';
import { Flag } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { ApiError } from '@/lib/api';
import { buyerApi } from '@/lib/buyer-api';
import { REPORT_DETAILS_MAX, REPORT_REASONS, checkReport, loginHref } from '@/lib/validation';

interface Props {
  targetType: 'product' | 'seller' | 'user' | 'conversation';
  targetId: string;
  label: string;
  /** Hide the button for the owner of the thing being reported. */
  sellerSlug?: string;
}

/** Inline report form. The server decides who may report what and rejects duplicates; this just collects the details. */
export function ReportButton({ targetType, targetId, label, sellerSlug }: Props) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (sellerSlug && user?.seller?.slug === sellerSlug) return null;

  function toggle() {
    if (status === 'anonymous') { router.push(loginHref(pathname || '/')); return; }
    setOpen((o) => !o); setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const check = checkReport(reason, details);
    if (!check.ok) return setError(check.error);
    setBusy(true); setError(null);
    try {
      await buyerApi.report({ targetType, targetId, reason, details: check.details });
      toast.success('Thanks. Our moderators will review your report.');
      setOpen(false); setReason(''); setDetails('');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not send your report. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" aria-expanded={open} onClick={toggle}><Flag />{label}</Button>
      {open && (
        <form onSubmit={submit} noValidate className="mt-2 grid gap-3 rounded-lg border bg-card p-4" aria-label={label}>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <SelectField label="What’s the problem?" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason…</option>
            {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </SelectField>
          <TextareaField label="Details (optional)" rows={3} maxLength={REPORT_DETAILS_MAX} value={details} onChange={(e) => setDetails(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Your report is confidential: the person you report is not told it was you.
            {targetType === 'conversation' && ' Moderators will be able to read this conversation to review your report.'}
          </p>
          <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      )}
    </div>
  );
}
