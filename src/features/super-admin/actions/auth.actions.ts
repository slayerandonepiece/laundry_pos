'use server';

import { logoutAction } from '@/server/auth/actions';

export async function superAdminLogoutAction(): Promise<void> {
  await logoutAction();
}
