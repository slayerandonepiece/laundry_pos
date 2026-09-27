'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/server/auth/session';
import { saveSuperAdminProfile } from '@/server/services/super-admin-profile';
import { changeUserPassword } from '@/server/services/profile';
import { ValidationError } from '@/server/errors';

export async function saveMyProfileAction(input: { name: string; phone: string; email: string }) {
  const session = await requireSuperAdmin();
  try {
    const result = await saveSuperAdminProfile(session.id, input);
    revalidatePath('/super-admin', 'layout');
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false as const, error: error.message };
    throw error;
  }
}

export async function changeMyPasswordAction(currentPassword: string, nextPassword: string) {
  const session = await requireSuperAdmin();
  try {
    if (currentPassword === nextPassword) throw new ValidationError('Choose a different new password.');
    await changeUserPassword(session.id, currentPassword, nextPassword);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false as const, error: error.message };
    throw error;
  }
}
