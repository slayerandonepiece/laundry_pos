'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';
import { recordStoreActivity } from '@/server/services/activity';
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
  const session = await requireSuperAdmin();
  try {
    const method = await createPlatformPaymentMethod(input);
    await recordStoreActivity({
      actorId: session.id,
      action: 'CREATE_PLATFORM_PAYMENT_METHOD',
      entityType: 'PlatformPaymentMethod',
      entityId: method.id,
      after: { code: method.code, name: method.name },
    });
    revalidatePath('/super-admin/payment-methods');
    revalidatePath('/super-admin/activity');
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
  const session = await requireSuperAdmin();
  try {
    const method = await updatePlatformPaymentMethod(id, input);
    await recordStoreActivity({
      actorId: session.id,
      action: 'UPDATE_PLATFORM_PAYMENT_METHOD',
      entityType: 'PlatformPaymentMethod',
      entityId: id,
      after: { name: method.name, active: method.active },
    });
    revalidatePath('/super-admin/payment-methods');
    revalidatePath('/super-admin/activity');
    return { ok: true, method };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
