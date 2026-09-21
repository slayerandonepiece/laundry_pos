'use client';
import { usePathname } from 'next/navigation';
import { DashboardLoading } from '@/features/admin/components/DashboardStates';

export default function Loading() {
  const pathname = usePathname();
  if (pathname === '/') return <DashboardLoading />;
  return <div className="content-loading" aria-live="polite" aria-busy="true"><span className="ad-spinner" aria-hidden="true" /></div>;
}
