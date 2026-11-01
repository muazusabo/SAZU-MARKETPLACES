import { Suspense } from 'react';
import { ResetForm } from '@/components/auth/reset-form';

export const metadata = { title: 'Choose a new password', robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
