import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'Contactbeheer',
  description: 'Beheer Exchange-contacten en distributielijsten',
  manifest: '/manifest.webmanifest',
  applicationName: 'Contactbeheer',
  appleWebApp: { capable: true, title: 'Contacten', statusBarStyle: 'black-translucent' },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <Script src="/config.js" strategy="beforeInteractive" />
      </head>
      <body>
        {children}
        <Toaster richColors position="top-center" />
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
          }
        `}</Script>
      </body>
    </html>
  );
}
