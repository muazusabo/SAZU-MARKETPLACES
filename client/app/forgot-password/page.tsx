import { Suspense } from 'react';
import { ForgotForm } from '@/components/auth/forgot-form';

export const metadata = { title: 'Reset password', robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  );
}
