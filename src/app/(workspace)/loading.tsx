'use client';
import { usePathname } from 'next/navigation';
import { DashboardLoading } from '@/features/admin/components/DashboardStates';
import { TableLoading, ProfileLoading, OutletDetailLoading } from '@/features/admin/components/WorkspaceLoading';

export default function Loading() {
  const pathname = usePathname();
  if (pathname === '/') return <DashboardLoading />;
  if (pathname?.includes('/outlets/')) return <OutletDetailLoading />;
  if (pathname?.includes('/profile')) return <ProfileLoading />;
  if (pathname?.includes('/sales') || pathname?.includes('/orders')) {
    return <TableLoading hasStats cols={5} rows={6} />;
  }
  if (pathname?.includes('/expenses')) {
    return <TableLoading cols={6} rows={6} />;
  }
  if (pathname?.includes('/employees')) {
    return <TableLoading cols={4} rows={5} />;
  }
  if (pathname?.includes('/outlets')) {
    return <TableLoading cols={5} rows={4} />;
  }
  if (pathname?.includes('/products')) {
    return <TableLoading cols={5} rows={6} />;
  }
  return <TableLoading cols={5} rows={6} />;
}
