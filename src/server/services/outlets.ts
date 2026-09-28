import 'server-only';
import { revalidateTag } from 'next/cache';
import { hasCurrentAccess } from '@/lib/subscriptionAccess';
import { isValidPhone } from '@/lib/contactValidation';
import { todayIST, formatCalendarDate } from '@/server/dates';
import { prisma } from '@/server/db';
import { ValidationError } from '@/server/errors';
import type { OutletMembership, OutletStatus } from '@/generated/prisma/client';
import type { OutletDetail, OutletListItem } from '@/features/super-admin/types';

export interface OutletDTO {
  id: string;
  outletCode: string;
  storeId: string;
  displayName: string;
  address: string;
  phone: string;
  status: OutletStatus;
  openedAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOutletInput {
  storeId: string;
  outletCode: string;
  displayName: string;
  address?: string;
  phone?: string;
  createdById?: string;
}

export async function createOutlet(input: CreateOutletInput): Promise<OutletDTO> {
  const store = await prisma.store.findUnique({ where: { id: input.storeId } });
  if (!store || store.deletedAt) {
    throw new ValidationError('Organization not found.');
  }

  const subscription = await prisma.subscription.findUnique({ where: { storeId: input.storeId } });
  const date = (value: Date | null | undefined) => value ? formatCalendarDate(value) : undefined;
  if (store.status === 'LOCKED' || !hasCurrentAccess(todayIST(), date(subscription?.paidThroughDate), date(subscription?.trialEndsAt), date(store.accessGrantedUntil))) {
    throw new ValidationError('Set up an active subscription or trial before adding outlets.');
  }
  if (input.phone && !isValidPhone(input.phone)) throw new ValidationError('Enter a valid phone number.');

  const existingCode = await prisma.outlet.findUnique({ where: { outletCode: input.outletCode } });
  if (existingCode) {
    throw new ValidationError('This outlet code is already in use. Choose another.');
  }

  const outlet = await prisma.outlet.create({
    data: {
      storeId: input.storeId,
      outletCode: input.outletCode.trim(),
      displayName: input.displayName.trim(),
      address: input.address?.trim() ?? '',
      phone: input.phone?.trim() ?? '',
      createdById: input.createdById ?? null,
    },
  });

  revalidateTag('stores', { expire: 0 });
  return outlet;
}

export async function getOutlet(outletId: string): Promise<OutletDTO | null> {
  return prisma.outlet.findUnique({ where: { id: outletId } });
}

export async function listOutletsForStore(storeId: string): Promise<OutletDTO[]> {
  return prisma.outlet.findMany({
    where: { storeId },
    orderBy: { createdAt: 'asc' },
  });
}

/** Active outlet memberships for every user in a store, keyed by userId. */
export async function listOutletMembershipsForStore(
  storeId: string,
): Promise<Record<string, { outletId: string; isDefault: boolean }[]>> {
  const rows = await prisma.outletMembership.findMany({
    where: { active: true, outlet: { storeId } },
    select: { userId: true, outletId: true, isDefault: true },
  });
  const byUser: Record<string, { outletId: string; isDefault: boolean }[]> = {};
  for (const row of rows) {
    (byUser[row.userId] ??= []).push({ outletId: row.outletId, isDefault: row.isDefault });
  }
  return byUser;
}

/**
 * Assigns or updates an employee's default outlet within an organization.
 * Guaranteed transactional: clears isDefault on all other outlet memberships
 * for this user within the organization so at most one active default outlet exists.
 */
export async function assignDefaultOutlet(
  userId: string,
  storeId: string,
  outletId: string,
): Promise<OutletMembership> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet || outlet.storeId !== storeId || outlet.status !== 'ACTIVE') {
    throw new ValidationError('Invalid or inactive outlet for this organization.');
  }

  const storeMembership = await prisma.storeMembership.findUnique({
    where: { userId_storeId: { userId, storeId } },
  });
  if (!storeMembership || !storeMembership.active) {
    throw new ValidationError('User does not have an active membership in this organization.');
  }

  const membership = await prisma.$transaction(async tx => {
    // 1. Clear isDefault on all outlet memberships for this user in this store
    const storeOutlets = await tx.outlet.findMany({
      where: { storeId },
      select: { id: true },
    });
    const outletIds = storeOutlets.map(o => o.id);

    await tx.outletMembership.updateMany({
      where: {
        userId,
        outletId: { in: outletIds },
      },
      data: { isDefault: false },
    });

    // 2. Upsert the target outlet membership with active: true, isDefault: true
    return tx.outletMembership.upsert({
      where: { userId_outletId: { userId, outletId } },
      create: {
        userId,
        outletId,
        active: true,
        isDefault: true,
      },
      update: {
        active: true,
        isDefault: true,
      },
    });
  });
  revalidateTag('employees', { expire: 0 });
  return membership;
}

/**
 * Assigns an employee to an outlet. If isDefault is true, handles default
 * outlet uniqueness transactionally.
 */
export async function assignEmployeeToOutlet(
  userId: string,
  storeId: string,
  outletId: string,
  isDefault = false,
): Promise<OutletMembership> {
  if (isDefault) {
    return assignDefaultOutlet(userId, storeId, outletId);
  }

  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet || outlet.storeId !== storeId || outlet.status !== 'ACTIVE') {
    throw new ValidationError('Invalid or inactive outlet for this organization.');
  }

  const membership = await prisma.outletMembership.upsert({
    where: { userId_outletId: { userId, outletId } },
    create: {
      userId,
      outletId,
      active: true,
      isDefault: false,
    },
    update: {
      active: true,
    },
  });
  revalidateTag('employees', { expire: 0 });
  return membership;
}

/**
 * Removes an employee's access to one outlet. If it was their default, the
 * default clears rather than transferring — resolveAllowedOutlets falls back
 * to the employee's next remaining outlet automatically.
 */
export async function removeEmployeeFromOutlet(
  userId: string,
  storeId: string,
  outletId: string,
): Promise<OutletMembership | null> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet || outlet.storeId !== storeId) {
    throw new ValidationError('Invalid outlet for this organization.');
  }

  const existing = await prisma.outletMembership.findUnique({
    where: { userId_outletId: { userId, outletId } },
  });
  if (!existing) return null;

  const membership = await prisma.outletMembership.update({
    where: { userId_outletId: { userId, outletId } },
    data: { active: false, isDefault: false },
  });
  revalidateTag('employees', { expire: 0 });
  return membership;
}

// --- Super Admin-facing queries and mutations below. Authorization
// (requireSuperAdmin) is the caller's responsibility, in the Server Action
// layer, matching stores.ts's pattern. ---

function toOutletListItem(outlet: OutletDTO): OutletListItem {
  return {
    id: outlet.id,
    storeId: outlet.storeId,
    outletCode: outlet.outletCode,
    displayName: outlet.displayName,
    address: outlet.address,
    phone: outlet.phone,
    status: outlet.status,
    openedAt: outlet.openedAt.toISOString(),
    closedAt: outlet.closedAt ? outlet.closedAt.toISOString() : undefined,
  };
}

export async function listOutletsForStoreAdmin(storeId: string): Promise<OutletListItem[]> {
  const outlets = await listOutletsForStore(storeId);
  return outlets.map(toOutletListItem);
}

export async function getOutletDetailForAdmin(outletId: string, storeId: string): Promise<OutletDetail | null> {
  const outlet = await getOutlet(outletId);
  if (!outlet || outlet.storeId !== storeId) return null;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [staffCount, orders30d, collectedAggregate] = await Promise.all([
    prisma.outletMembership.count({ where: { outletId, active: true } }),
    prisma.order.count({ where: { outletId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.payment.aggregate({ where: { outletId, paidAt: { gte: thirtyDaysAgo } }, _sum: { amount: true } }),
  ]);
  return {
    ...toOutletListItem(outlet),
    staffCount,
    orders30d,
    collected30d: collectedAggregate._sum.amount ?? 0,
  };
}

export interface UpdateOutletInput {
  displayName: string;
  address: string;
  phone: string;
}

/** Updates an outlet's editable details. The outlet code is immutable and not accepted here. */
export async function updateOutlet(outletId: string, storeId: string, input: UpdateOutletInput): Promise<OutletDTO> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet || outlet.storeId !== storeId) throw new ValidationError('Outlet not found.');
  if (!input.displayName.trim()) throw new ValidationError('Enter an outlet name.');

  const updated = await prisma.outlet.update({
    where: { id: outletId },
    data: {
      displayName: input.displayName.trim(),
      address: input.address.trim(),
      phone: input.phone.trim(),
    },
  });
  revalidateTag('employees', { expire: 0 });
  return updated;
}

/** Same outlet, same code — only the address changes. Marks the outlet RELOCATED. */
export async function relocateOutlet(outletId: string, storeId: string, address: string): Promise<OutletDTO> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet || outlet.storeId !== storeId) throw new ValidationError('Outlet not found.');
  if (outlet.status === 'CLOSED') throw new ValidationError('Reopen this outlet before relocating it.');
  if (!address.trim()) throw new ValidationError('Enter the new address.');

  return prisma.outlet.update({
    where: { id: outletId },
    data: { address: address.trim(), status: 'RELOCATED' },
  });
}

/** Hides the outlet from staff switchers. Order and payment history is kept; the code cannot be reused. */
export async function closeOutlet(outletId: string, storeId: string): Promise<OutletDTO> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet || outlet.storeId !== storeId) throw new ValidationError('Outlet not found.');
  if (outlet.status === 'CLOSED') return outlet;

  return prisma.outlet.update({
    where: { id: outletId },
    data: { status: 'CLOSED', closedAt: new Date() },
  });
}

/** Reverses closeOutlet — restores ACTIVE status and clears closedAt. */
export async function reopenOutlet(outletId: string, storeId: string): Promise<OutletDTO> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet || outlet.storeId !== storeId) throw new ValidationError('Outlet not found.');
  if (outlet.status !== 'CLOSED') return outlet;

  return prisma.outlet.update({
    where: { id: outletId },
    data: { status: 'ACTIVE', closedAt: null },
  });
}
