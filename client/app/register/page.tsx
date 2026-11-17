import { Suspense } from 'react';
import { RegisterForm } from '@/components/auth/register-form';
import { GuestOnly } from '@/components/auth/guest-only';

export const metadata = { title: 'Create account', robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <GuestOnly><RegisterForm /></GuestOnly>
    </Suspense>
  );
}
