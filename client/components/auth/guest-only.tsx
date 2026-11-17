'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { postAuthPathForUser } from '@/lib/auth-routing';
import { useAuth } from './auth-provider';

export function GuestOnly({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    if (status === 'authenticated' && user) {
      router.replace(postAuthPathForUser(user, params.get('next')));
    }
  }, [params, router, status, user]);

  if (status !== 'anonymous') {
    return (
      <div className="container max-w-md py-12" role="status" aria-label="Checking your session">
        <p className="sr-only">Checking your session…</p>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-6 h-48" />
      </div>
    );
  }
  return <>{children}</>;
}
