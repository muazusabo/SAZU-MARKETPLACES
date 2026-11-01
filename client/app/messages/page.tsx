import { Inbox } from '@/components/messages/inbox';

export const metadata = { title: 'Messages', robots: { index: false } };

export default function Page() {
  return <Inbox />;
}
