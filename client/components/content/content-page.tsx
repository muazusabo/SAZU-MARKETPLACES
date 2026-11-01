import Link from 'next/link';
import { fetchPublicContent, paragraphs, PublicContent } from '@/lib/content';

export async function loadContent(): Promise<PublicContent | null> {
  try { return await fetchPublicContent(); } catch { return null; }
}

/**
 * Renders text the marketplace administrators publish in settings. Nothing is invented here: when the text hasn't been
 * published yet, visitors are told so. The text is rendered as plain paragraphs (never as HTML).
 */
export async function ContentPage({ title, field, children }: { title: string; field: keyof PublicContent; children?: React.ReactNode }) {
  const content = await loadContent();
  const text = content?.[field]?.trim();
  return (
    <div className="container max-w-3xl py-12">
      <h1 className="text-4xl font-extrabold">{title}</h1>
      {text ? (
        <div className="mt-6 grid gap-4 leading-relaxed">{paragraphs(text).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>
      ) : (
        <p role="status" className="mt-6 rounded-lg border border-dashed bg-card p-5 text-muted-foreground">
          {content ? 'The marketplace administrators haven’t published this page yet.' : 'We couldn’t load this page right now. Please try again shortly.'}{' '}
          <Link href="/contact" className="font-semibold text-primary underline">See how to contact us</Link>.
        </p>
      )}
      {children}
    </div>
  );
}
