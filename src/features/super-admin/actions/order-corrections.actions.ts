'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { requireSuperAdmin } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';
import { prisma } from '@/server/db';
import { correctDeliveredOrder, getDeliveredOrderForCorrection, searchDeliveredOrders, type DeliveredOrderCorrectionInput, type DeliveredOrderCorrectionView, type DeliveredOrderSearchFilters, type DeliveredOrderSearchRow } from '@/server/services/orders';

// Delivered orders are final: nothing about them changes silently. A Super Admin can fix a
// wrong customer or a wrong payment amount, and every fix is audited with who, why, and the
// old and new values. Owners and employees cannot reach this.

export type CorrectionLookup = { ok: true; order: DeliveredOrderCorrectionView } | { ok: false; error: string };

export async function fetchCorrectionOrderAction(storeId: string, orderCode: string): Promise<CorrectionLookup> {
  await requireSuperAdmin();
  const order = await getDeliveredOrderForCorrection(storeId, orderCode.trim());
  return order ? { ok: true, order } : { ok: false, error: 'No delivered order with that number in this organization.' };
}

export async function correctOrderAction(storeId: string, orderCode: string, input: DeliveredOrderCorrectionInput): Promise<CorrectionLookup> {
  const session = await requireSuperAdmin();
  try {
    const order = await correctDeliveredOrder(storeId, orderCode.trim(), session.id, input);
    revalidatePath('/admin/sales');
    revalidatePath('/');
    return { ok: true, order };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    if (error instanceof ZodError) return { ok: false, error: error.issues.map(issue => issue.message).join(', ') };
    throw error;
  }
}

export type CorrectionSearch = { ok: true; rows: DeliveredOrderSearchRow[]; total: number; page: number; pageSize: number } | { ok: false; error: string };

export async function searchCorrectionOrdersAction(storeId: string, filters: DeliveredOrderSearchFilters, paging: { page: number; pageSize: number }): Promise<CorrectionSearch> {
  await requireSuperAdmin();
  try {
    return { ok: true, ...(await searchDeliveredOrders(storeId, filters, paging)) };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    return { ok: false, error: 'Could not search orders. Try again.' };
  }
}

/** Outlets for the filter, loaded when an organization is chosen. */
export async function fetchCorrectionOutletsAction(storeId: string): Promise<{ id: string; name: string }[]> {
  await requireSuperAdmin();
  const outlets = await prisma.outlet.findMany({ where: { storeId }, orderBy: { createdAt: 'asc' }, select: { id: true, displayName: true } });
  return outlets.map(outlet => ({ id: outlet.id, name: outlet.displayName }));
}
