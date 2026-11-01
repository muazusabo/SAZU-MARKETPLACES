import { Thread } from '@/components/messages/thread';

export const metadata = { title: 'Conversation', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Thread id={(await params).id} />;
}
