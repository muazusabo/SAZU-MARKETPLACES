import { Dashboard } from '@/components/seller/dashboard';

export const metadata = { title: 'Seller dashboard', robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ published?: string; application?: string }> }) {
  const params = await searchParams;
  return <Dashboard published={params.published === '1'} applicationSubmitted={params.application === 'submitted'} />;
}
