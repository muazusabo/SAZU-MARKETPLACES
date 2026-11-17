'use client';
import { useEffect, useState } from 'react';
import { buyerApi } from '@/lib/buyer-api';

export function MessageAttachment({ conversationId, messageId, fileName, contentType }: {
  conversationId: string; messageId: string; fileName: string; contentType: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void buyerApi.attachment(conversationId, messageId).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (active) setError(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [conversationId, messageId]);

  if (error) return <p role="status" className="mt-1 text-xs">Attachment could not be loaded.</p>;
  if (!url) return <p role="status" className="mt-1 text-xs">Loading attachment…</p>;

  return (
    <div className="mt-2 grid gap-1">
      {contentType === 'image/webp' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-h-64 max-w-full rounded-lg object-contain" />
      )}
      <a href={url} download={fileName} className="break-all text-sm font-semibold underline underline-offset-2">
        Download {fileName}
      </a>
    </div>
  );
}
