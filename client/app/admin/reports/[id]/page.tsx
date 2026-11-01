import { ReportDetail } from '@/components/admin/reports-page';

export const metadata = { title: 'Report', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ReportDetail id={(await params).id} />;
}
