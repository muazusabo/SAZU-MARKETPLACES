'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowRight, MailCheck, UserRoundPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { apiFetch, ApiError } from '@/lib/api';
import { postAuthPathForUser } from '@/lib/auth-routing';
import { jsonBody } from '@/lib/auth-client';
import { RegisterValues, normalizeNigerianPhone, registerSchema } from '@/lib/validation';
import { AuthShell, FormError } from './auth-shell';
import { useAuth } from './auth-provider';

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [doneEmail, setDoneEmail] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { phone: '', campusArea: '', acceptTerms: false },
  });

  async function onSubmit(v: RegisterValues) {
    setError(null);
    try {
      await apiFetch('/auth/register', {
        ...jsonBody('POST', {
          ...v,
          phone: v.phone ? normalizeNigerianPhone(v.phone) : undefined,
          campusArea: v.campusArea || undefined,
        }),
        timeoutMs: 60_000,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create your account. Try again.');
      return;
    }

    try {
      const user = await login(v.email, v.password);
      toast.success(`Welcome to SAZU, ${user.profile.displayName}.`);
      router.replace(postAuthPathForUser(user, params.get('next')));
    } catch {
      setDoneEmail(v.email);
    }
  }

  if (doneEmail) {
    return (
      <AuthShell branded title="One last step" intro="We sent a verification code to finish setting up your account.">
        <div className="rounded-2xl border border-primary/10 bg-brand-light-lime/35 p-5" role="status">
          <span className="grid size-11 place-items-center rounded-2xl bg-white text-primary shadow-sm">
            <MailCheck aria-hidden className="size-6" />
          </span>
          <p className="mt-4 leading-relaxed">
            If <strong>{doneEmail}</strong> can be used for a new account, we’ll send an 8-digit verification code. It stays valid for 10 minutes.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">No email yet? Check your spam folder or request another code from the verification screen.</p>
        </div>
        <div className="mt-5 grid gap-3">
          <Button asChild size="lg" className="h-12 w-full rounded-xl">
            <Link href={`/verify-email?email=${encodeURIComponent(doneEmail)}`}>Enter verification code <ArrowRight aria-hidden /></Link>
          </Button>
          <Button asChild variant="outline" className="h-11 w-full rounded-xl"><Link href="/login">Go to sign in</Link></Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell branded title="Join your campus" intro="Create your free account and get connected to student life.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><FormError message={error} /></div>
        <TextField className="gap-2" label="Full name" autoComplete="name" placeholder="Your full name" error={errors.fullName?.message} {...register('fullName')} />
        <TextField className="gap-2" label="Display name" autoComplete="nickname" placeholder="Name students will see" hint="Shown to other students." error={errors.displayName?.message} {...register('displayName')} />
        <TextField className="gap-2 sm:col-span-2" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" error={errors.email?.message} {...register('email')} />
        <TextField className="gap-2 sm:col-span-2" label="Password" type="password" autoComplete="new-password" placeholder="Create a secure password" hint="At least 10 characters." error={errors.password?.message} {...register('password')} />
        <TextField className="gap-2" label="Phone (optional)" type="tel" autoComplete="tel" placeholder="Your phone number" hint="Stays private." error={errors.phone?.message} {...register('phone')} />
        <TextField className="gap-2" label="Campus or hostel area" placeholder="e.g. North Campus" error={errors.campusArea?.message} {...register('campusArea')} />
        <div className="sm:col-span-2">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 rounded accent-primary" aria-invalid={!!errors.acceptTerms} {...register('acceptTerms')} />
            <span className="leading-relaxed text-muted-foreground">
              I agree to the <Link href="/terms" className="font-semibold text-primary decoration-primary/30 underline-offset-4 hover:underline">Terms</Link> and{' '}
              <Link href="/safety" className="font-semibold text-primary decoration-primary/30 underline-offset-4 hover:underline">community guidelines</Link>.
            </span>
          </label>
          {errors.acceptTerms && <p role="alert" className="mt-1 text-sm font-medium text-destructive">{errors.acceptTerms.message}</p>}
        </div>
        <Button type="submit" size="lg" disabled={isSubmitting} className="group h-12 w-full rounded-xl shadow-lg shadow-primary/15 transition-all hover:-translate-y-0.5 hover:shadow-xl sm:col-span-2">
          <UserRoundPlus aria-hidden className="size-4" />
          {isSubmitting ? 'Creating your account…' : 'Create your account'}
          {!isSubmitting && <ArrowRight aria-hidden className="ml-auto size-4 transition-transform group-hover:translate-x-1" />}
        </Button>
      </form>
      <div className="mt-6 border-t border-border pt-5 text-center text-sm">
        <p className="text-muted-foreground">Already part of SAZU? <Link href="/login" className="font-bold text-primary decoration-primary/30 underline-offset-4 hover:underline">Sign in</Link></p>
      </div>
    </AuthShell>
  );
}
