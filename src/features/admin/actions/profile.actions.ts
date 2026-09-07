'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/server/auth/session';
import { saveStoreProfile, changeOwnerPassword } from '@/server/services/profile';
import { ValidationError } from '@/server/errors';
import type { Profile } from '../admin.types';

export interface ProfileActionResult {
  ok: boolean;
  error?: string;
  profile?: Profile;
}

export async function saveProfileAction(input: Profile): Promise<ProfileActionResult> {
  const session = await requireSession('OWNER');
  try {
    const profile = await saveStoreProfile(input, session.id);
    revalidatePath('/admin/profile');
    return { ok: true, profile };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export interface PasswordActionResult {
  ok: boolean;
  error?: string;
}

export async function changePasswordAction(oldPassword: string, newPassword: string): Promise<PasswordActionResult> {
  const session = await requireSession('OWNER');
  try {
    await changeOwnerPassword(session.id, oldPassword, newPassword);
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
