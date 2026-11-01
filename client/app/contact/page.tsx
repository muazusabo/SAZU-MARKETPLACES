import { Mail, Phone } from 'lucide-react';
import { loadContent } from '@/components/content/content-page';
import { safeEmail, safePhone } from '@/lib/content';

export const metadata = { title: 'Contact us', description: 'How to reach the SAZU Marketplace team.' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const c = await loadContent();
  const email = safeEmail(c?.support_email); const phone = safePhone(c?.support_phone);
  return (
    <div className="container max-w-3xl py-12">
      <h1 className="text-4xl font-extrabold">Contact us</h1>
      {email || phone ? (
        <ul className="mt-6 grid gap-3">
          {email && <li className="flex items-center gap-3 rounded-lg border bg-card p-4"><Mail aria-hidden className="text-primary" /><a className="font-semibold text-primary hover:underline" href={`mailto:${email}`}>{email}</a></li>}
          {phone && <li className="flex items-center gap-3 rounded-lg border bg-card p-4"><Phone aria-hidden className="text-primary" /><a className="font-semibold text-primary hover:underline" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a></li>}
        </ul>
      ) : (
        <p role="status" className="mt-6 rounded-lg border border-dashed bg-card p-5 text-muted-foreground">
          {c ? 'Support contact details haven’t been published yet.' : 'We couldn’t load contact details right now.'} To report a problem with a listing, seller or message, use the Report buttons inside the app.
        </p>
      )}
    </div>
  );
}
