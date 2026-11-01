'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { apiFetch, ApiError } from '@/lib/api';
import { jsonBody } from '@/lib/auth-client';
import { RegisterValues, normalizeNigerianPhone, registerSchema } from '@/lib/validation';
import { AuthShell, FormError } from './auth-shell';

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [doneEmail, setDoneEmail] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { phone: '', campusArea: '', acceptTerms: false },
  });

  async function onSubmit(v: RegisterValues) {
    setError(null);
    try {
      await apiFetch('/auth/register', jsonBody('POST', {
        ...v,
        phone: v.phone ? normalizeNigerianPhone(v.phone) : undefined,
        campusArea: v.campusArea || undefined,
      }));
      setDoneEmail(v.email);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create your account. Try again.');
    }
  }

  if (doneEmail) {
    return (
      <AuthShell title="Check your email">
        <div className="rounded-lg border bg-card p-5" role="status">
          <MailCheck aria-hidden className="size-7 text-success" />
          <p className="mt-3">
            If <strong>{doneEmail}</strong> can be used for a new account, we’ve sent an 8-digit verification code. It stays valid for 10 minutes.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">No email? Check spam or resend a code from the verification screen.</p>
        </div>
        <Button asChild><Link href={`/verify-email?email=${encodeURIComponent(doneEmail)}`}>Enter verification code</Link></Button>
        <Button asChild variant="outline"><Link href="/login">Go to sign in</Link></Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" intro="Free for students. We only ask for what we need.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
        <FormError message={error} />
        <TextField label="Full name" autoComplete="name" error={errors.fullName?.message} {...register('fullName')} />
        <TextField label="Display name" hint="Shown to other students instead of your full name." error={errors.displayName?.message} {...register('displayName')} />
        <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <TextField label="Password" type="password" autoComplete="new-password" hint="At least 10 characters." error={errors.password?.message} {...register('password')} />
        <TextField label="Phone (optional)" type="tel" autoComplete="tel" hint="Stays private. Not shown on listings." error={errors.phone?.message} {...register('phone')} />
        <TextField label="Campus or hostel area (optional)" error={errors.campusArea?.message} {...register('campusArea')} />
        <div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" aria-invalid={!!errors.acceptTerms} {...register('acceptTerms')} />
            <span>
              I agree to the <Link href="/terms" className="font-semibold text-primary underline">Terms</Link> and{' '}
              <Link href="/safety" className="font-semibold text-primary underline">community guidelines</Link>.
            </span>
          </label>
          {errors.acceptTerms && <p role="alert" className="mt-1 text-sm font-medium text-destructive">{errors.acceptTerms.message}</p>}
        </div>
        <Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'}</Button>
      </form>
      <p className="text-sm text-muted-foreground">Already registered? <Link href="/login" className="font-semibold text-primary hover:underline">Sign in</Link></p>
    </AuthShell>
  );
}
