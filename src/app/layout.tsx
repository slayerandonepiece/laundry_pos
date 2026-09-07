import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './globals.css';
import { AdminProvider } from '@/features/admin/containers/AdminProvider';
import './admin/admin.css';
import './admin/pos.css';
import './admin/counter.css';
import './admin/tables.css';

export const metadata: Metadata = {
  title: 'Store workspace | Express Laundry',
  robots: { index: false, follow: false },
  description: 'Express Laundry store workspace.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0758d6',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AdminProvider>{children}</AdminProvider></body></html>;
}
