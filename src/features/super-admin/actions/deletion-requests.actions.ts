'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/server/auth/session';
import { ConflictError } from '@/server/errors';
import { recordStoreActivity } from '@/server/services/activity';
import { deleteRequestNow, restoreDeletionRequestById } from '@/server/services/account-deletion';

export interface DeletionRequestActionResult {
  ok: boolean;
  error?: string;
}

function refresh() {
  revalidatePath('/super-admin/deletion-requests');
  revalidatePath('/super-admin', 'layout');
}

// Audit rows carry only the opaque request id: no names, phones or emails.
export async function restoreDeletionRequestAction(requestId: string): Promise<DeletionRequestActionResult> {
  const session = await requireSuperAdmin();
  try {
    await restoreDeletionRequestById(requestId);
    await recordStoreActivity({ actorId: session.id, action: 'RESTORE_DELETION_REQUEST', entityType: 'AccountDeletionRequest', entityId: requestId });
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof ConflictError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function deleteRequestNowAction(requestId: string): Promise<DeletionRequestActionResult> {
  const session = await requireSuperAdmin();
  try {
    await deleteRequestNow(requestId);
    await recordStoreActivity({ actorId: session.id, action: 'DELETE_NOW_DELETION_REQUEST', entityType: 'AccountDeletionRequest', entityId: requestId });
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof ConflictError) return { ok: false, error: error.message };
    throw error;
  }
}
