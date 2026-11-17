import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { GuestOnly } from '@/components/auth/guest-only';

export const metadata = { title: 'Sign in', robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <GuestOnly><LoginForm /></GuestOnly>
    </Suspense>
  );
}
