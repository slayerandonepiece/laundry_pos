'use server';

import { revalidatePath } from 'next/cache';
import { destroySession, getSession, requireStoreSession } from '@/server/auth/session';
import { ConflictError } from '@/server/errors';
import { requestAccountDeletion, restoreAccountDeletion } from '@/server/services/account-deletion';

export interface AccountDeletionResult {
  ok: boolean;
  error?: string;
  scheduledFor?: string;
}

/** Owner requests deletion of the whole organization they are working in. */
export async function requestOrganizationDeletionAction(): Promise<AccountDeletionResult> {
  const session = await requireStoreSession(undefined, 'OWNER');
  try {
    const request = await requestAccountDeletion({ userId: session.id, storeId: session.storeId, via: 'WEB' });
    // requestAccountDeletion revoked every session row; clear this browser's cookie too.
    await destroySession();
    return { ok: true, scheduledFor: request.scheduledFor };
  } catch (error) {
    if (error instanceof ConflictError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Restores the signed-in user's own pending request (callable while blocked). */
export async function restoreAccountDeletionAction(): Promise<AccountDeletionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Please sign in again.' };
  try {
    await restoreAccountDeletion(session.id);
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof ConflictError) return { ok: false, error: error.message };
    throw error;
  }
}
