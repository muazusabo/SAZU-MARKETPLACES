import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/layout/providers';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SITE } from '@/lib/site';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${SITE.name}: ${SITE.tagline}`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png', sizes: '512x512' }],
    shortcut: '/icon.png',
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: { title: SITE.name, description: SITE.description, type: 'website', siteName: SITE.name },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#064E3B' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
          Skip to main content
        </a>
        <Providers>
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
