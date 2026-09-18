'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';
import {
  createPlatformPaymentMethod,
  updatePlatformPaymentMethod,
  type PlatformPaymentMethodDTO,
} from '@/server/services/platform-payment-methods';

export interface PlatformPaymentMethodResult {
  ok: boolean;
  error?: string;
  method?: PlatformPaymentMethodDTO;
}

export async function createPlatformPaymentMethodAction(input: {
  code: string;
  name: string;
}): Promise<PlatformPaymentMethodResult> {
  await requireSuperAdmin();
  try {
    const method = await createPlatformPaymentMethod(input);
    revalidatePath('/super-admin/payment-methods');
    return { ok: true, method };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function updatePlatformPaymentMethodAction(
  id: string,
  input: { name?: string; active?: boolean },
): Promise<PlatformPaymentMethodResult> {
  await requireSuperAdmin();
  try {
    const method = await updatePlatformPaymentMethod(id, input);
    revalidatePath('/super-admin/payment-methods');
    return { ok: true, method };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
