import 'server-only';
import { z } from 'zod';
import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from '@/server/db';
import { ValidationError } from '@/server/errors';

export interface PlatformPaymentMethodDTO {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationPaymentMethodDTO {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
}

const codeSchema = z
  .string()
  .trim()
  .min(2, 'Code must be at least 2 characters.')
  .max(30, 'Code must be 30 characters or fewer.')
  .regex(/^[A-Z0-9_]+$/, 'Code must contain only uppercase letters, numbers, and underscores.');

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(50, 'Name must be 50 characters or fewer.');

export function normalizePlatformPaymentCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '_');
}

/**
 * Super Admin: Create a new platform-wide payment method.
 * Code is immutable once created.
 */
export async function createPlatformPaymentMethod(input: {
  code: string;
  name: string;
}): Promise<PlatformPaymentMethodDTO> {
  const code = normalizePlatformPaymentCode(input.code);
  codeSchema.parse(code);
  const name = nameSchema.parse(input.name);

  const existing = await prisma.platformPaymentMethod.findUnique({
    where: { code },
  });
  if (existing) {
    throw new ValidationError('A payment method with this code already exists.');
  }

  const method = await prisma.platformPaymentMethod.create({
    data: {
      code,
      name,
      active: true,
    },
  });
  revalidateTag('platform-payment-methods', { expire: 0 });
  return method;
}

/**
 * Super Admin: List all platform payment methods.
 */
export const listPlatformPaymentMethods = unstable_cache(
  async (includeInactive = false): Promise<PlatformPaymentMethodDTO[]> => {
    return prisma.platformPaymentMethod.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  },
  ['platform-payment-methods'],
  { revalidate: 60, tags: ['platform-payment-methods'] },
);

/**
 * Super Admin: Rename or activate/deactivate a platform payment method.
 * Code cannot be changed.
 */
export async function updatePlatformPaymentMethod(
  id: string,
  input: { name?: string; active?: boolean },
): Promise<PlatformPaymentMethodDTO> {
  const existing = await prisma.platformPaymentMethod.findUnique({ where: { id } });
  if (!existing) {
    throw new ValidationError('Platform payment method not found.');
  }

  const data: { name?: string; active?: boolean } = {};
  if (input.name !== undefined) {
    data.name = nameSchema.parse(input.name);
  }
  if (input.active !== undefined) {
    data.active = input.active;
  }

  const method = await prisma.platformPaymentMethod.update({
    where: { id },
    data,
  });
  revalidateTag('platform-payment-methods', { expire: 0 });
  return method;
}

/**
 * Store Owner / Staff: List all active platform payment methods with their
 * explicit organization-level enablement status for this store. New methods
 * are opt-in: an organization must enable them before they can be used.
 */
export async function listOrganizationPaymentMethods(
  storeId: string,
): Promise<OrganizationPaymentMethodDTO[]> {
  const platformMethods = await prisma.platformPaymentMethod.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    include: {
      organizationPaymentMethods: {
        where: { storeId },
      },
    },
  });

  return platformMethods.map(pm => {
    const orgConfig = pm.organizationPaymentMethods[0];
    return {
      id: pm.id,
      code: pm.code,
      name: pm.name,
      enabled: orgConfig?.enabled ?? false,
    };
  });
}

/**
 * Store Owner: Enable or disable an active platform payment method for their organization.
 */
export async function setOrganizationPaymentMethodEnabled(
  storeId: string,
  platformPaymentMethodId: string,
  enabled: boolean,
): Promise<OrganizationPaymentMethodDTO> {
  const platformMethod = await prisma.platformPaymentMethod.findUnique({
    where: { id: platformPaymentMethodId },
  });
  if (!platformMethod || !platformMethod.active) {
    throw new ValidationError('Platform payment method not found or inactive.');
  }

  return prisma.$transaction(async tx => {
    const orgConfig = await tx.organizationPaymentMethod.upsert({
      where: {
        storeId_platformPaymentMethodId: {
          storeId,
          platformPaymentMethodId,
        },
      },
      create: {
        storeId,
        platformPaymentMethodId,
        enabled,
      },
      update: {
        enabled,
      },
    });

    return {
      id: platformMethod.id,
      code: platformMethod.code,
      name: platformMethod.name,
      enabled: orgConfig.enabled,
    };
  });
}

export type PaymentMethodResolution =
  | {
      valid: true;
      name: string;
      code?: string;
      platformPaymentMethodId: string | null;
    }
  | {
      valid: false;
      error: string;
    };

/**
 * Resolves and validates a payment method at order creation or payment recording.
 * New outlet-owned payments must use an explicitly enabled platform method.
 * Legacy methods remain available only for historical, pre-outlet orders.
 */
export async function resolveActivePaymentMethod(
  storeId: string,
  methodInput: string,
  options: { allowLegacy?: boolean } = {},
): Promise<PaymentMethodResolution> {
  const clean = methodInput.trim();

  // 1. Look up by ID, code, or name in PlatformPaymentMethod
  const platformMethods = await prisma.platformPaymentMethod.findMany({
    where: {
      active: true,
      OR: [
        { id: clean },
        { code: clean.toUpperCase() },
        { name: { equals: clean, mode: 'insensitive' } },
      ],
    },
    include: {
      organizationPaymentMethods: {
        where: { storeId },
      },
    },
  });

  // Names are display labels and are not globally unique, and this lookup is
  // not tenant-scoped, so a candidate may belong to another organization
  // entirely. Only one this organization explicitly enabled counts; when none
  // does, fall through to the legacy lookup rather than letting another
  // tenant's naming choice block this organization's checkout.
  const platformMethod = platformMethods.find(
    candidate => candidate.organizationPaymentMethods[0]?.enabled === true,
  );
  if (platformMethod) {
    return {
      valid: true,
      name: platformMethod.name,
      code: platformMethod.code,
      platformPaymentMethodId: platformMethod.id,
    };
  }

  // Legacy methods cannot create new outlet-owned payments. They only keep
  // older, pre-outlet orders operable while historical data is retired.
  if (!options.allowLegacy) {
    return { valid: false, error: 'That payment method is no longer available.' };
  }

  // 2. Fallback to legacy StorePaymentMethod for pre-outlet orders only.
  const legacy = await prisma.storePaymentMethod.findFirst({
    where: { storeId, name: clean, active: true },
  });
  if (legacy) {
    return {
      valid: true,
      name: legacy.name,
      platformPaymentMethodId: null,
    };
  }

  return {
    valid: false,
    error: 'That payment method is no longer available.',
  };
}
