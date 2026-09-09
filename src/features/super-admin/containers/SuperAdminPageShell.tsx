'use client';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import SuperAdminShell from '../components/SuperAdminShell';
import { superAdminLogoutAction } from '../actions/auth.actions';

export default function SuperAdminPageShell({ title, subtitle, name, breadcrumb, action, hidePhead, children }: {
  title: string;
  subtitle: string;
  name: string;
  breadcrumb?: ReactNode;
  action?: ReactNode;
  hidePhead?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  function logout() {
    superAdminLogoutAction().then(() => router.replace('/super-admin/login'));
  }
  return <SuperAdminShell title={title} subtitle={subtitle} name={name} breadcrumb={breadcrumb} action={action} hidePhead={hidePhead} onLogout={logout}>{children}</SuperAdminShell>;
}
