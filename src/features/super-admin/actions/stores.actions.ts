'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/server/auth/session';
import { archiveStore, lookupOwnerByUsername, onboardStore, recordSubscriptionPayment, setStoreStatus, updateStore } from '@/server/services/stores';
import { ValidationError } from '@/server/errors';
import { createOutlet, type OutletDTO } from '@/server/services/outlets';
import type { OnboardStoreInput, OwnerLookupResult, RecordSubscriptionPaymentInput, StoreDetail, StoreInvoice, StoreListItem, UpdateStoreInput } from '../types';

export interface OnboardStoreResult {
  ok: boolean;
  error?: string;
  store?: StoreListItem;
}

export async function onboardStoreAction(input: OnboardStoreInput): Promise<OnboardStoreResult> {
  const session = await requireSuperAdmin();
  try {
    const store = await onboardStore(input, session.id);
    revalidatePath('/super-admin');
    revalidatePath('/super-admin/stores');
    return { ok: true, store };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function lookupOwnerAction(username: string): Promise<OwnerLookupResult | null> {
  await requireSuperAdmin();
  return lookupOwnerByUsername(username);
}

export interface UpdateStoreResult {
  ok: boolean;
  error?: string;
  store?: StoreDetail;
}

export async function updateStoreAction(storeId: string, input: UpdateStoreInput): Promise<UpdateStoreResult> {
  await requireSuperAdmin();
  try {
    const store = await updateStore(storeId, input);
    revalidatePath('/super-admin/stores');
    revalidatePath(`/super-admin/stores/${storeId}`);
    revalidatePath(`/super-admin/stores/${storeId}/edit`);
    return { ok: true, store };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export interface SetStoreStatusResult {
  ok: boolean;
  error?: string;
  store?: StoreDetail;
}

async function setStoreStatusAction(storeId: string, status: 'ACTIVE' | 'LOCKED'): Promise<SetStoreStatusResult> {
  await requireSuperAdmin();
  try {
    const store = await setStoreStatus(storeId, status);
    revalidatePath('/super-admin');
    revalidatePath('/super-admin/stores');
    revalidatePath(`/super-admin/stores/${storeId}`);
    return { ok: true, store };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function lockStoreAction(storeId: string): Promise<SetStoreStatusResult> {
  return setStoreStatusAction(storeId, 'LOCKED');
}

export async function unlockStoreAction(storeId: string): Promise<SetStoreStatusResult> {
  return setStoreStatusAction(storeId, 'ACTIVE');
}

export interface ArchiveStoreResult {
  ok: boolean;
  error?: string;
}

export async function archiveStoreAction(storeId: string, confirmName: string): Promise<ArchiveStoreResult> {
  await requireSuperAdmin();
  try {
    await archiveStore(storeId, confirmName);
    revalidatePath('/super-admin');
    revalidatePath('/super-admin/stores');
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export interface RecordSubscriptionPaymentResult {
  ok: boolean;
  error?: string;
  invoice?: StoreInvoice;
}

export async function recordSubscriptionPaymentAction(storeId: string, input: RecordSubscriptionPaymentInput): Promise<RecordSubscriptionPaymentResult> {
  const session = await requireSuperAdmin();
  try {
    const invoice = await recordSubscriptionPayment(storeId, input, session.id);
    revalidatePath('/super-admin/stores');
    revalidatePath(`/super-admin/stores/${storeId}`);
    revalidatePath(`/super-admin/stores/${storeId}/subscription`);
    revalidatePath('/super-admin/subscriptions/billing');
    return { ok: true, invoice };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export interface CreateOutletResult {
  ok: boolean;
  error?: string;
  outlet?: OutletDTO;
}

/** Super-admin-only outlet provisioning. Outlet codes are immutable once created. */
export async function createOutletAction(storeId: string, input: {
  outletCode: string;
  displayName: string;
  address?: string;
  phone?: string;
}): Promise<CreateOutletResult> {
  const session = await requireSuperAdmin();
  try {
    const outlet = await createOutlet({ storeId, createdById: session.id, ...input });
    revalidatePath(`/super-admin/stores/${storeId}`);
    revalidatePath(`/super-admin/stores/${storeId}/outlets`);
    return { ok: true, outlet };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
