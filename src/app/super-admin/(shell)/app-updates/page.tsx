import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { listAppUpdateSettings } from '@/server/services/app-update-settings';
import AppUpdatesScreen from '@/features/super-admin/components/AppUpdatesScreen';

export default async function Page() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  return <AppUpdatesScreen settings={await listAppUpdateSettings()} />;
}
