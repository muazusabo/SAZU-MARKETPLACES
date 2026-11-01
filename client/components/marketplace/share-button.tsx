'use client';
import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function ShareButton({ title }: { title: string }) {
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard.');
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') toast.error('Could not share. Copy the link from the address bar.');
    }
  }
  return <Button type="button" variant="outline" onClick={share}><Share2 />Share</Button>;
}
