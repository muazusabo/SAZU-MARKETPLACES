import { Suspense } from 'react';
import { VerifyEmail } from '@/components/auth/verify-email';

export const metadata = { title: 'Verify email', robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
