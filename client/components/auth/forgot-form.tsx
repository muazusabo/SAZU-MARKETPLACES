'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { apiFetch, ApiError } from '@/lib/api';
import { jsonBody } from '@/lib/auth-client';
import { ForgotValues, forgotSchema } from '@/lib/validation';
import { AuthShell, FormError } from './auth-shell';

export function ForgotForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) });

  async function onSubmit(v: ForgotValues) {
    setError(null);
    try {
      await apiFetch('/auth/forgot-password', jsonBody('POST', v));
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send the email. Try again.');
    }
  }

  if (sent) {
    return (
      <AuthShell title="Check your email">
        <p role="status" className="rounded-lg border bg-card p-5">If an account exists for that email, a reset link is on its way. It stays valid for 1 hour.</p>
        <Button asChild variant="outline"><Link href="/login">Back to sign in</Link></Button>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Reset your password" intro="Enter your account email and we’ll send a reset link.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
        <FormError message={error} />
        <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Send reset link'}</Button>
      </form>
    </AuthShell>
  );
}
