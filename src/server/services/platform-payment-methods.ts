import 'server-only';
import { z } from 'zod';
import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from '@/server/db';
import { ValidationError } from '@/server/errors';

export type PaymentStage = 'PRE_ORDER' | 'POST_ORDER' | 'BOTH';

export interface PlatformPaymentMethodDTO {
  id: string;
  code: string;
  name: string;
  active: boolean;
  enabledByDefault: boolean;
  defaultStage: PaymentStage;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationPaymentMethodDTO {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  // Where the method appears: when the order is placed, after it, or both.
  // Always the catalogue stage (PlatformPaymentMethod.defaultStage), never stored per organization.
  stage: PaymentStage;
}

const stageSchema = z.enum(['PRE_ORDER', 'POST_ORDER', 'BOTH']);

/** Cash on delivery is a promise to pay, never money received, so it only exists at order placement. */
export const CASH_ON_DELIVERY_CODE = 'COD';

export function isCashOnDeliveryCode(code: string | undefined | null): boolean {
  return code === CASH_ON_DELIVERY_CODE;
}

/** Validates a stage for a method code. COD may only be PRE_ORDER. */
export function validatePaymentStage(code: string, stageInput: string): PaymentStage {
  const stage = stageSchema.parse(stageInput);
  if (isCashOnDeliveryCode(code) && stage !== 'PRE_ORDER') {
    throw new ValidationError('Cash on delivery can only appear when the order is placed.');
  }
  return stage;
}

/**
 * The one place a method's stage is read. The platform catalogue owns it
 * (`defaultStage` is the authoritative stage, not a seed value); organizations
 * only store whether a method is enabled.
 */
export function effectiveStage(platformMethod: { defaultStage: PaymentStage }): PaymentStage {
  return platformMethod.defaultStage;
}

/** True when a stage lets the method be used in the given phase of an order. */
export function stageAllows(stage: PaymentStage, phase: 'PRE_ORDER' | 'POST_ORDER'): boolean {
  return stage === 'BOTH' || stage === phase;
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
  enabledByDefault?: boolean;
  defaultStage?: PaymentStage;
}): Promise<PlatformPaymentMethodDTO> {
  const code = normalizePlatformPaymentCode(input.code);
  codeSchema.parse(code);
  const name = nameSchema.parse(input.name);
  const defaultStage = validatePaymentStage(code, input.defaultStage ?? (isCashOnDeliveryCode(code) ? 'PRE_ORDER' : 'BOTH'));

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
      enabledByDefault: input.enabledByDefault ?? false,
      defaultStage,
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
  ['platform-payment-methods', 'v2-stage-defaults'],
  { revalidate: 60, tags: ['platform-payment-methods'] },
);

/**
 * Super Admin: Rename or activate/deactivate a platform payment method.
 * Code cannot be changed.
 */
export async function updatePlatformPaymentMethod(
  id: string,
  input: { name?: string; active?: boolean; enabledByDefault?: boolean; defaultStage?: PaymentStage },
): Promise<PlatformPaymentMethodDTO> {
  const existing = await prisma.platformPaymentMethod.findUnique({ where: { id } });
  if (!existing) {
    throw new ValidationError('Platform payment method not found.');
  }

  const data: { name?: string; active?: boolean; enabledByDefault?: boolean; defaultStage?: PaymentStage } = {};
  if (input.enabledByDefault !== undefined) {
    data.enabledByDefault = input.enabledByDefault;
  }
  if (input.defaultStage !== undefined) {
    data.defaultStage = validatePaymentStage(existing.code, input.defaultStage);
  }
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
      stage: effectiveStage(pm),
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
      stage: effectiveStage(platformMethod),
    };
  });
}

export interface OrganizationPaymentConfigInput {
  platformPaymentMethodId: string;
  enabled: boolean;
}

/**
 * Super Admin: saves which payment methods an organization has enabled.
 * Validated as a set so a half-saved state can never leave the organization
 * unable to collect payment at delivery: at least one method must be enabled,
 * and at least one enabled method must appear after the order is placed
 * (judged from the catalogue stages, which an organization cannot override).
 */
export async function saveOrganizationPaymentConfig(
  storeId: string,
  items: OrganizationPaymentConfigInput[],
): Promise<OrganizationPaymentMethodDTO[]> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw new ValidationError('Organization not found.');
  if (new Set(items.map(item => item.platformPaymentMethodId)).size !== items.length) {
    throw new ValidationError('A payment method appears more than once.');
  }
  const platformMethods = await prisma.platformPaymentMethod.findMany({
    where: { id: { in: items.map(item => item.platformPaymentMethodId) } },
  });
  const byId = new Map(platformMethods.map(method => [method.id, method]));
  const existing = await prisma.organizationPaymentMethod.findMany({ where: { storeId }, include: { platformPaymentMethod: true } });
  const existingById = new Map(existing.map(row => [row.platformPaymentMethodId, row]));

  const resolved = items.map(item => {
    const method = byId.get(item.platformPaymentMethodId);
    if (!method) throw new ValidationError('Payment method not found.');
    if (item.enabled && !method.active && !existingById.get(method.id)?.enabled) {
      throw new ValidationError(`${method.name} is inactive in the platform catalogue and cannot be enabled.`);
    }
    return { method, enabled: item.enabled };
  });

  // Methods the organization already has but the request omits keep their current state.
  const omitted = existing.filter(row => !byId.has(row.platformPaymentMethodId));
  const finalEnabled = [
    ...resolved.filter(row => row.enabled).map(row => effectiveStage(row.method)),
    ...omitted.filter(row => row.enabled).map(row => effectiveStage(row.platformPaymentMethod)),
  ];
  if (!finalEnabled.length) throw new ValidationError('Enable at least one payment method.');
  if (!finalEnabled.some(stage => stage !== 'PRE_ORDER')) {
    throw new ValidationError('Enable at least one method that appears after the order, so payment can be collected at delivery.');
  }

  await prisma.$transaction(resolved.map(row => prisma.organizationPaymentMethod.upsert({
    where: { storeId_platformPaymentMethodId: { storeId, platformPaymentMethodId: row.method.id } },
    create: { storeId, platformPaymentMethodId: row.method.id, enabled: row.enabled },
    update: { enabled: row.enabled },
  })));
  return listOrganizationPaymentMethods(storeId);
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
 * Every payment must use a platform method this organization has enabled.
 */
export async function resolveActivePaymentMethod(
  storeId: string,
  methodInput: string,
  options: { phase?: 'PRE_ORDER' | 'POST_ORDER'; allowCashOnDelivery?: boolean } = {},
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
  // does, report it as unavailable rather than letting another
  // tenant's naming choice block this organization's checkout.
  const platformMethod = platformMethods.find(
    candidate => candidate.organizationPaymentMethods[0]?.enabled === true,
  );
  if (platformMethod) {
    // Cash on delivery is a promise to pay, so it can never be recorded as a payment.
    if (isCashOnDeliveryCode(platformMethod.code) && !options.allowCashOnDelivery) {
      return { valid: false, error: "Cash on delivery can't be recorded as a payment. Pick the method the customer actually used." };
    }
    const stage = effectiveStage(platformMethod);
    if (options.phase && !stageAllows(stage, options.phase)) {
      return {
        valid: false,
        error: options.phase === 'POST_ORDER'
          ? "That payment method can't be used after the order is placed."
          : "That payment method can't be used when placing the order.",
      };
    }
    return {
      valid: true,
      name: platformMethod.name,
      code: platformMethod.code,
      platformPaymentMethodId: platformMethod.id,
    };
  }

  return { valid: false, error: 'That payment method is no longer available.' };
}
