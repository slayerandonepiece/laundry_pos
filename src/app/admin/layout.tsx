import type { Metadata } from 'next';
import { AdminProvider } from '@/features/admin/containers/AdminProvider';
import './admin.css';
import './pos.css';
import './counter.css';
import './tables.css';
export const metadata: Metadata = { title: 'Store workspace | Express Laundry', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <AdminProvider>{children}</AdminProvider>; }
