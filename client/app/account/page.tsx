import { Suspense } from 'react';
import { AccountPage } from '@/components/auth/account-page';

export const metadata = { title: 'Your dashboard', robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <AccountPage />
    </Suspense>
  );
}
