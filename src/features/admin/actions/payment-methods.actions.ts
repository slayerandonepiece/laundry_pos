'use server';

import { revalidatePath } from 'next/cache';
import { requireStoreSession } from '@/server/auth/session';
import { createStorePaymentMethod, renameStorePaymentMethod, setStorePaymentMethodActive } from '@/server/services/payment-methods';
import { setOrganizationPaymentMethodEnabled } from '@/server/services/platform-payment-methods';
import { ValidationError } from '@/server/errors';
import type { StorePaymentMethod } from '../admin.types';

type Result = { ok: boolean; error?: string; method?: StorePaymentMethod };

function refreshPaymentMethodScreens() {
  revalidatePath('/admin/profile');
  revalidatePath('/admin/sales');
  revalidatePath('/admin/orders');
}

async function resultFor(action: () => Promise<StorePaymentMethod>): Promise<Result> {
  try {
    const method = await action();
    refreshPaymentMethodScreens();
    return { ok: true, method };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function addPaymentMethodAction(name: string): Promise<Result> {
  const session = await requireStoreSession(undefined, 'OWNER');
  return resultFor(() => createStorePaymentMethod(session.storeId, name));
}

export async function renamePaymentMethodAction(methodId: string, name: string): Promise<Result> {
  const session = await requireStoreSession(undefined, 'OWNER');
  return resultFor(() => renameStorePaymentMethod(session.storeId, methodId, name));
}

export async function setPaymentMethodActiveAction(methodId: string, active: boolean): Promise<Result> {
  const session = await requireStoreSession(undefined, 'OWNER');
  return resultFor(() => setStorePaymentMethodActive(session.storeId, methodId, active));
}

/** Owners configure only Super Admin-defined methods for new outlet payments. */
export async function setOrganizationPaymentMethodEnabledAction(methodId: string, enabled: boolean): Promise<Result> {
  const session = await requireStoreSession(undefined, 'OWNER');
  try {
    await setOrganizationPaymentMethodEnabled(session.storeId, methodId, enabled);
    refreshPaymentMethodScreens();
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
