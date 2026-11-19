'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ApiError } from '@/lib/api';
import { postAuthPathForUser } from '@/lib/auth-routing';
import { LoginValues, loginSchema, safeNextPath } from '@/lib/validation';
import { AuthShell, FormError } from './auth-shell';
import { useAuth } from './auth-provider';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: params.get('email') ?? '', password: '' },
  });
  const requestedNext = params.get('next');
  const next = safeNextPath(requestedNext);

  async function onSubmit(v: LoginValues) {
    setError(null);
    try {
      const me = await login(v.email, v.password);
      toast.success(`Welcome back, ${me.profile.displayName}.`);
      router.replace(postAuthPathForUser(me, requestedNext));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in. Try again.');
    }
  }

  return (
    <AuthShell branded title="Welcome back" intro="Sign in to pick up where you left off.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5 md:grid-cols-2">
        {next !== '/' && <p role="status" className="rounded-2xl border border-primary/10 bg-brand-light-lime/40 p-4 text-sm leading-relaxed text-brand-deep md:col-span-2">Sign in to return to your previous page. Any saved listing or shop draft on this device will be restored.</p>}
        <div className="md:col-span-2"><FormError message={error} /></div>
        <TextField className="gap-2" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" error={errors.email?.message} {...register('email')} />
        <TextField className="gap-2" label="Password" type="password" autoComplete="current-password" placeholder="Enter your password" error={errors.password?.message} {...register('password')} />
        <div className="-mt-1 flex justify-end md:col-span-2">
          <Link href="/forgot-password" className="text-sm font-semibold text-primary decoration-primary/30 underline-offset-4 hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" size="lg" disabled={isSubmitting} className="group mt-1 h-12 w-full rounded-xl shadow-lg shadow-primary/15 transition-all hover:-translate-y-0.5 hover:shadow-xl md:col-span-2">
          <LockKeyhole aria-hidden className="size-4" />
          {isSubmitting ? 'Signing in…' : 'Sign in to SAZU'}
          {!isSubmitting && <ArrowRight aria-hidden className="ml-auto size-4 transition-transform group-hover:translate-x-1" />}
        </Button>
      </form>
      <div className="mt-7 border-t border-border pt-5 text-center text-sm">
        <p className="text-muted-foreground">New to SAZU? <Link href={`/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-bold text-primary decoration-primary/30 underline-offset-4 hover:underline">Create your account</Link></p>
      </div>
    </AuthShell>
  );
}
