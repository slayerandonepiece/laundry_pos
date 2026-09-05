import type { Metadata } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './globals.css';

export const metadata: Metadata = {
  title: 'Express Laundry | Chinnappanahalli, Bengaluru',
  description: 'Laundry, dry cleaning, steam ironing, doorstep pickup and delivery in Chinnappanahalli, Bengaluru.',
};

export const viewport = { themeColor: '#0758d6' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
