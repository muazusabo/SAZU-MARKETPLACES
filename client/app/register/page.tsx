import { Suspense } from 'react';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata = { title: 'Create account', robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
