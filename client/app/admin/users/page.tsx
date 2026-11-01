import { UsersPage } from '@/components/admin/users-page';

export const metadata = { title: 'Users', robots: { index: false } };

export default function Page() {
  return <UsersPage />;
}
