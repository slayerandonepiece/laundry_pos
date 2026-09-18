import 'server-only';
import { prisma } from '@/server/db';
import { ValidationError } from '@/server/errors';
import type { OutletMembership, OutletStatus } from '@/generated/prisma/client';

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

  return prisma.$transaction(async tx => {
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

  return prisma.outletMembership.upsert({
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

  return prisma.outletMembership.update({
    where: { userId_outletId: { userId, outletId } },
    data: { active: false, isDefault: false },
  });
}
