'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ShopForm } from './shop-form';
import { useSellerMe } from './seller-gate';

function Inner() {
  const { user } = useAuth();
  const router = useRouter();
  const q = useSellerMe();
  // Only redirect people who already had an application on arrival. After submitting here, the form itself sends them to the dashboard.
  const arrived = useRef<'unknown' | 'had' | 'none'>('unknown');
  if (q.isSuccess && arrived.current === 'unknown') arrived.current = q.data ? 'had' : 'none';
  useEffect(() => { if (arrived.current === 'had') router.replace('/dashboard/settings'); }, [q.data, q.isSuccess, router]);
  if (q.isLoading || arrived.current === 'had') return <div className="container max-w-2xl py-12" role="status" aria-label="Loading"><Skeleton className="h-64" /></div>;
  if (user && !user.emailVerified) {
    return (
      <div className="container max-w-2xl py-12"><div role="status" className="rounded-lg border bg-card p-6">
        <h1 className="text-2xl font-bold">Verify your email first</h1>
        <p className="mt-2 text-muted-foreground">We need a confirmed email address before you can apply. Open your account page to enter a verification code.</p>
        <Button asChild className="mt-4"><Link href="/account">Go to your account</Link></Button>
      </div></div>
    );
  }
  return (
    <div className="container max-w-2xl py-10">
      <h1 className="text-3xl font-bold">Apply to sell</h1>
      <p className="mt-2 text-muted-foreground">Tell buyers about your shop. An administrator reviews every application. Approval criteria are set by the marketplace administrators.</p>
      <div className="mt-8"><ShopForm /></div>
    </div>
  );
}

export function ApplyPage() { return <RequireAuth><Inner /></RequireAuth>; }
