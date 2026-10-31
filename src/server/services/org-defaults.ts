import 'server-only';
import { ValidationError } from '@/server/errors';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Applies the platform defaults to a freshly created organization, inside the
 * caller's onboarding transaction so the organization is never left half
 * configured: the payment methods flagged enabledByDefault are enabled for it.
 * Message templates are not copied: an organization follows the platform
 * defaults until it is given its own wording (an override row).
 *
 * Fails when no default method appears after the order is placed. Delivery
 * requires payment, so an organization that could not collect at delivery
 * would be unusable.
 */
export async function applyOrganizationDefaults(tx: Prisma.TransactionClient, storeId: string): Promise<void> {
  const methods = await tx.platformPaymentMethod.findMany({
    where: { active: true, enabledByDefault: true },
    select: { id: true, defaultStage: true },
  });
  if (!methods.some(method => method.defaultStage !== 'PRE_ORDER')) {
    throw new ValidationError('Set up at least one default payment method that appears after the order before onboarding an organization.');
  }
  await tx.organizationPaymentMethod.createMany({
    data: methods.map(method => ({ storeId, platformPaymentMethodId: method.id, enabled: true })),
  });
}
