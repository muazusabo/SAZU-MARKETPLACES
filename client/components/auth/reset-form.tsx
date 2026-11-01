'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { apiFetch, ApiError } from '@/lib/api';
import { jsonBody } from '@/lib/auth-client';
import { ResetValues, resetSchema } from '@/lib/validation';
import { AuthShell, FormError } from './auth-shell';

export function ResetForm() {
  const token = useSearchParams().get('token');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetValues>({ resolver: zodResolver(resetSchema) });

  async function onSubmit(v: ResetValues) {
    setError(null);
    try {
      await apiFetch('/auth/reset-password', jsonBody('POST', { token, password: v.password }));
      toast.success('Password updated. Sign in with your new password.');
      router.replace('/login');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reset your password. Try again.');
    }
  }

  if (!token) {
    return (
      <AuthShell title="Reset link missing">
        <p>This page needs the link from your reset email. Request a new one to continue.</p>
        <Button asChild><Link href="/forgot-password">Request a reset link</Link></Button>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" intro="You’ll be signed out on all devices.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
        <FormError message={error} />
        <TextField label="New password" type="password" autoComplete="new-password" hint="At least 10 characters." error={errors.password?.message} {...register('password')} />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
        <Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Update password'}</Button>
      </form>
    </AuthShell>
  );
}
