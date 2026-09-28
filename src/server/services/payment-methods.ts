import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { ValidationError } from '@/server/errors';
import type { StorePaymentMethod } from '@/features/admin/admin.types';

const nameSchema = z.string().trim().min(1, 'Enter a payment method name.').max(40, 'Use 40 characters or fewer.');

function parseName(input: string) {
  const result = nameSchema.safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0].message);
  return result.data;
}

function toDTO(method: { id: string; name: string; active: boolean }): StorePaymentMethod {
  return { id: method.id, name: method.name, active: method.active };
}

export async function listStorePaymentMethods(storeId: string, includeInactive = false): Promise<StorePaymentMethod[]> {
  return unstable_cache(async () => {
    const methods = await prisma.storePaymentMethod.findMany({
      where: { storeId, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    });
    return methods.map(toDTO);
  }, ['payment-methods', storeId, String(includeInactive)], { tags: ['payment-methods', storeId], revalidate: 120 })();
}

async function assertUniqueName(storeId: string, name: string, excludeId?: string) {
  const duplicate = await prisma.storePaymentMethod.findFirst({
    where: { storeId, name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (duplicate) throw new ValidationError('That payment method already exists.');
}

export async function createStorePaymentMethod(storeId: string, input: string): Promise<StorePaymentMethod> {
  const name = parseName(input);
  await assertUniqueName(storeId, name);
  const method = await prisma.storePaymentMethod.create({ data: { storeId, name } });
  revalidateTag(storeId, { expire: 0 });
  return toDTO(method);
}

export async function renameStorePaymentMethod(storeId: string, methodId: string, input: string): Promise<StorePaymentMethod> {
  const name = parseName(input);
  const existing = await prisma.storePaymentMethod.findFirst({ where: { id: methodId, storeId } });
  if (!existing) throw new ValidationError('Payment method not found.');
  await assertUniqueName(storeId, name, methodId);
  const method = await prisma.storePaymentMethod.update({ where: { id: methodId }, data: { name } });
  revalidateTag(storeId, { expire: 0 });
  return toDTO(method);
}

export async function setStorePaymentMethodActive(storeId: string, methodId: string, active: boolean): Promise<StorePaymentMethod> {
  const method = await prisma.$transaction(async tx => {
    const existing = await tx.storePaymentMethod.findFirst({ where: { id: methodId, storeId } });
    if (!existing) throw new ValidationError('Payment method not found.');
    if (!active && existing.active) {
      const activeCount = await tx.storePaymentMethod.count({ where: { storeId, active: true } });
      if (activeCount <= 1) throw new ValidationError('Keep at least one payment method active.');
    }
    return toDTO(await tx.storePaymentMethod.update({ where: { id: methodId }, data: { active } }));
  });
  revalidateTag(storeId, { expire: 0 });
  return method;
}
