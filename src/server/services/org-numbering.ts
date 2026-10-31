import 'server-only';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/server/db';
import { ValidationError } from '@/server/errors';
import type { Prisma } from '@/generated/prisma/client';

type Client = Prisma.TransactionClient;

export const MIN_ORDER_SEQ_BASE = 1_000_000_001;
export const MAX_ORDER_SEQ_BASE = 9_999_999_999;
const ORG_CODE_PATTERN = /^\d{3,5}$/;

export function parseOrgCode(value: string): string {
  const code = value.trim();
  if (!ORG_CODE_PATTERN.test(code)) throw new ValidationError('Organization code must be 3 to 5 digits.');
  return code;
}

/** 001 and 00001 are the same number, so a code is taken when any store holds an equal numeric value. */
export async function assertOrgCodeFree(client: Client, code: string, exceptStoreId?: string): Promise<void> {
  const rows = await client.$queryRaw<{ id: string }[]>`
    SELECT id FROM stores WHERE "orgCode"::integer = ${Number(code)} LIMIT 2`;
  if (rows.some(row => row.id !== exceptStoreId)) {
    throw new ValidationError('This organization code is already in use.');
  }
}

/** Numbering is locked once any order or invoice exists for the organization. */
export async function isNumberingLocked(client: Client | typeof prisma, storeId: string): Promise<boolean> {
  const [orders, invoices] = await Promise.all([
    client.order.count({ where: { storeId } }),
    client.orderInvoice.count({ where: { storeId } }),
  ]);
  return orders + invoices > 0;
}

export interface StoreNumberingInput {
  orgCode?: string;
  orderSeqBase?: number;
}

export interface StoreNumbering {
  orgCode: string;
  orderSeqBase: number;
  locked: boolean;
}

export async function getStoreNumbering(storeId: string): Promise<StoreNumbering | null> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { orgCode: true, orderSeqBase: true } });
  if (!store) return null;
  return { orgCode: store.orgCode, orderSeqBase: Number(store.orderSeqBase), locked: await isNumberingLocked(prisma, storeId) };
}

/**
 * Super Admin changes to an organization's numbering. The org code is
 * immutable once any document exists. The order base may only move upward;
 * the live order counter is lifted to it so the next order never repeats.
 */
export async function updateStoreNumbering(storeId: string, input: StoreNumberingInput): Promise<StoreNumbering> {
  await prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stores WHERE id = ${storeId} FOR UPDATE`;
    if (!locked[0]) throw new ValidationError('Organization not found.');
    const store = await tx.store.findUniqueOrThrow({ where: { id: storeId }, select: { orgCode: true, orderSeqBase: true } });

    if (input.orgCode !== undefined && input.orgCode.trim() !== store.orgCode) {
      const code = parseOrgCode(input.orgCode);
      if (await isNumberingLocked(tx, storeId)) {
        throw new ValidationError('The organization code can no longer change because documents have been issued.');
      }
      await assertOrgCodeFree(tx, code, storeId);
      await tx.store.update({ where: { id: storeId }, data: { orgCode: code } });
    }

    if (input.orderSeqBase !== undefined) {
      const base = input.orderSeqBase;
      if (!Number.isInteger(base) || base < MIN_ORDER_SEQ_BASE || base > MAX_ORDER_SEQ_BASE) {
        throw new ValidationError(`Order number base must be a whole number from ${MIN_ORDER_SEQ_BASE} to ${MAX_ORDER_SEQ_BASE}.`);
      }
      if (BigInt(base) < store.orderSeqBase) throw new ValidationError('The order number base can only be raised.');
      await tx.store.update({ where: { id: storeId }, data: { orderSeqBase: base } });
      await tx.$executeRaw`
        UPDATE document_counters
        SET "nextValue" = GREATEST("nextValue", ${base}::bigint), "updatedAt" = CURRENT_TIMESTAMP
        WHERE "storeId" = ${storeId} AND "docType" = 'ORDER'::"DocumentType" AND "fy" = 0`;
    }
  });
  revalidateTag('stores', { expire: 0 });
  const result = await getStoreNumbering(storeId);
  if (!result) throw new ValidationError('Organization not found.');
  return result;
}
