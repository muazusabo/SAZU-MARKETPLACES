'use client';
import { AlertTriangle, CheckCircle2, Loader2, MailCheck, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { apiFetch, ApiError } from '@/lib/api';
import { jsonBody } from '@/lib/auth-client';
import { AuthShell } from './auth-shell';
import { useAuth } from './auth-provider';

export function VerifyEmail() {
  const params = useSearchParams();
  const initialEmail = params.get('email') ?? '';
  const expiredLink = params.get('reason') === 'expired';
  const { status: authStatus, reload } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'verifying' | 'resending' | 'ok' | 'failed' | 'sent'>('idle');
  const [message, setMessage] = useState('');
  const needsFreshCode = expiredLink || (state === 'failed' && /expired|invalid/i.test(message));

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('verifying');
    setMessage('');
    try {
      await apiFetch('/auth/verify-email', jsonBody('POST', { email, code }));
      setState('ok');
      if (authStatus === 'authenticated') await reload();
    } catch (e) {
      setState('failed');
      setMessage(e instanceof ApiError ? e.message : 'Could not verify your email.');
    }
  }

  async function resend() {
    setState('resending');
    setMessage('');
    try {
      await apiFetch('/auth/resend-verification', jsonBody('POST', { email }));
      setCode('');
      setState('sent');
      setMessage('If this account needs verification, a new code is on its way.');
    } catch (e) {
      setState('failed');
      setMessage(e instanceof ApiError ? e.message : 'Could not send a new code.');
    }
  }

  return (
    <AuthShell title="Verify your email" intro="Enter the 8-digit code we sent to your email address. It expires in 10 minutes.">
      {state === 'ok' ? (
        <>
          <p role="status" className="flex items-center gap-2 rounded-lg border bg-card p-5"><CheckCircle2 aria-hidden className="text-success" /> Your email is verified.</p>
          <Button asChild><Link href={authStatus === 'authenticated' ? '/account' : '/login'}>{authStatus === 'authenticated' ? 'Continue to your account' : 'Continue to sign in'}</Link></Button>
        </>
      ) : (
        <>
          {needsFreshCode && (
            <div role="status" className="flex items-start gap-3 rounded-xl border border-accent/50 bg-accent/10 p-4">
              <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-foreground" />
              <div>
                <p className="font-semibold">{expiredLink ? 'That email link has expired' : 'This verification code may have expired'}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Verification links and codes can only be used for a limited time. Enter the email address you registered with, then request a fresh verification code below.</p>
              </div>
            </div>
          )}
          <form onSubmit={verify} className="grid gap-4">
            {message && <p role="status" className={state === 'failed' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{state === 'failed' ? <XCircle aria-hidden className="mr-1 inline size-4" /> : <MailCheck aria-hidden className="mr-1 inline size-4" />}{message}</p>}
            <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            <TextField label="Verification code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} />
            <Button type="submit" disabled={state === 'verifying' || state === 'resending' || code.length !== 8}>{state === 'verifying' ? <><Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> Verifying…</> : 'Verify email'}</Button>
          </form>
          <Button type="button" variant="outline" disabled={state === 'verifying' || state === 'resending' || !email.trim()} onClick={() => void resend()}>{state === 'resending' ? <><Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> Sending…</> : needsFreshCode ? 'Send a fresh verification code' : 'Resend code'}</Button>
        </>
      )}
    </AuthShell>
  );
}
