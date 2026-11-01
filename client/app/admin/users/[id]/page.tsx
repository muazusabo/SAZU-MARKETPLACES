import { UserDetail } from '@/components/admin/users-page';

export const metadata = { title: 'User', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <UserDetail id={(await params).id} />;
}
