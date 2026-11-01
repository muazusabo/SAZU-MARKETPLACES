'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ApiError } from '@/lib/api';
import { LoginValues, loginSchema, safeNextPath } from '@/lib/validation';
import { AuthShell, FormError } from './auth-shell';
import { useAuth } from './auth-provider';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const next = safeNextPath(params.get('next'));

  async function onSubmit(v: LoginValues) {
    setError(null);
    try {
      const me = await login(v.email, v.password);
      toast.success(`Welcome back, ${me.profile.displayName}.`);
      router.replace(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in. Try again.');
    }
  }

  return (
    <AuthShell title="Sign in" intro="Use your SAZU Marketplace account to message sellers and manage your listings.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
        {next !== '/' && <p role="status" className="rounded-md border bg-secondary/60 p-3 text-sm text-muted-foreground">Sign in to return to your previous page. If you were editing a listing or shop application, your saved draft on this device will be restored.</p>}
        <FormError message={error} />
        <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <TextField label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        <Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</Button>
      </form>
      <div className="grid gap-2 text-sm">
        <Link href="/forgot-password" className="font-semibold text-primary hover:underline">Forgot your password?</Link>
        <p className="text-muted-foreground">New here? <Link href={`/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-primary hover:underline">Create an account</Link></p>
      </div>
    </AuthShell>
  );
}
