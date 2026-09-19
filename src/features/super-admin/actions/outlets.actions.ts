'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/server/auth/session';
import { closeOutlet, reopenOutlet, relocateOutlet, updateOutlet, type OutletDTO, type UpdateOutletInput } from '@/server/services/outlets';
import { ValidationError } from '@/server/errors';
import { recordStoreActivity } from '@/server/services/activity';

export interface OutletActionResult {
  ok: boolean;
  error?: string;
  outlet?: OutletDTO;
}

function revalidateOutletPaths(storeId: string, outletId: string) {
  revalidatePath(`/super-admin/stores/${storeId}/outlets`);
  revalidatePath(`/super-admin/stores/${storeId}/outlets/${outletId}`);
}

export async function updateOutletAction(storeId: string, outletId: string, input: UpdateOutletInput): Promise<OutletActionResult> {
  const session = await requireSuperAdmin();
  try {
    const outlet = await updateOutlet(outletId, storeId, input);
    await recordStoreActivity({ storeId, outletId, actorId: session.id, action: 'UPDATE_OUTLET', entityType: 'Outlet', entityId: outletId, after: { displayName: outlet.displayName, address: outlet.address, phone: outlet.phone } });
    revalidateOutletPaths(storeId, outletId);
    return { ok: true, outlet };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function relocateOutletAction(storeId: string, outletId: string, address: string): Promise<OutletActionResult> {
  const session = await requireSuperAdmin();
  try {
    const outlet = await relocateOutlet(outletId, storeId, address);
    await recordStoreActivity({ storeId, outletId, actorId: session.id, action: 'RELOCATE_OUTLET', entityType: 'Outlet', entityId: outletId, after: { address: outlet.address } });
    revalidateOutletPaths(storeId, outletId);
    return { ok: true, outlet };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function closeOutletAction(storeId: string, outletId: string): Promise<OutletActionResult> {
  const session = await requireSuperAdmin();
  try {
    const outlet = await closeOutlet(outletId, storeId);
    await recordStoreActivity({ storeId, outletId, actorId: session.id, action: 'CLOSE_OUTLET', entityType: 'Outlet', entityId: outletId });
    revalidateOutletPaths(storeId, outletId);
    return { ok: true, outlet };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function reopenOutletAction(storeId: string, outletId: string): Promise<OutletActionResult> {
  const session = await requireSuperAdmin();
  try {
    const outlet = await reopenOutlet(outletId, storeId);
    await recordStoreActivity({ storeId, outletId, actorId: session.id, action: 'REOPEN_OUTLET', entityType: 'Outlet', entityId: outletId });
    revalidateOutletPaths(storeId, outletId);
    return { ok: true, outlet };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
