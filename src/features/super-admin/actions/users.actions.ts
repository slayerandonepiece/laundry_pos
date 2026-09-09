'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/server/auth/session';
import { createUser, resetUserPassword, setUserActive, updateUser } from '@/server/services/platform-users';
import { ValidationError } from '@/server/errors';
import type { CreateUserInput, PlatformUserDetail, PlatformUserListItem, ResetPasswordInput, UpdateUserInput } from '../types';

export interface UserActionResult {
  ok: boolean;
  error?: string;
  user?: PlatformUserListItem;
}

export async function createUserAction(input: CreateUserInput): Promise<UserActionResult> {
  await requireSuperAdmin();
  try {
    const user = await createUser(input);
    revalidatePath('/super-admin/users');
    return { ok: true, user };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export interface UpdateUserResult {
  ok: boolean;
  error?: string;
  user?: PlatformUserDetail;
}

export async function updateUserAction(userId: string, input: UpdateUserInput): Promise<UpdateUserResult> {
  await requireSuperAdmin();
  try {
    const user = await updateUser(userId, input);
    revalidatePath('/super-admin/users');
    revalidatePath(`/super-admin/users/${userId}`);
    return { ok: true, user };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export interface ResetPasswordResult {
  ok: boolean;
  error?: string;
  password?: string;
}

export async function resetUserPasswordAction(userId: string, input: ResetPasswordInput): Promise<ResetPasswordResult> {
  await requireSuperAdmin();
  try {
    const result = await resetUserPassword(userId, input);
    revalidatePath(`/super-admin/users/${userId}`);
    return { ok: true, password: result.password };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

async function setUserActiveAction(userId: string, active: boolean): Promise<UpdateUserResult> {
  await requireSuperAdmin();
  try {
    const user = await setUserActive(userId, active);
    revalidatePath('/super-admin/users');
    revalidatePath(`/super-admin/users/${userId}`);
    return { ok: true, user };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function deactivateUserAction(userId: string): Promise<UpdateUserResult> {
  return setUserActiveAction(userId, false);
}

export async function reactivateUserAction(userId: string): Promise<UpdateUserResult> {
  return setUserActiveAction(userId, true);
}
