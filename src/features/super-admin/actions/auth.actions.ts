'use server';

import { loginAction, logoutAction } from '@/server/auth/actions';
import { destroySession } from '@/server/auth/session';

export interface SuperAdminLoginResult {
  ok: boolean;
  error?: string;
  name?: string;
}

export async function superAdminLoginAction(username: string, password: string): Promise<SuperAdminLoginResult> {
  const result = await loginAction(username, password);
  if (!result.ok || !result.user) return { ok: false, error: result.error ?? 'Invalid username or password' };
  if (!result.user.isSuperAdmin) {
    // A real account, just not a platform admin — don't leave them holding a
    // session cookie for an area they can't use.
    await destroySession();
    return { ok: false, error: 'This account does not have platform admin access.' };
  }
  return { ok: true, name: result.user.name };
}

export async function superAdminLogoutAction(): Promise<void> {
  await logoutAction();
}
