import type { Metadata, Viewport } from 'next';
import './app.css';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './globals.css';
import { AdminProvider } from '@/features/admin/containers/AdminProvider';
import './(workspace)/admin/admin.css';
import './(workspace)/admin/pos.css';
import './(workspace)/admin/counter.css';
import './(workspace)/admin/tables.css';

export const metadata: Metadata = {
  title: 'Store workspace',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'EL Store' },
  robots: { index: false, follow: false },
  description: 'Store workspace for laundry business management.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0758d6',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser extensions (e.g. LocatorJS) add attributes to <html> before React
  // hydrates; this only silences attribute diffs on this one element.
  return <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning><body><AdminProvider>{children}</AdminProvider></body></html>;
}
