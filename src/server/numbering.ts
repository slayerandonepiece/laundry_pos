import 'server-only';
import type { Prisma } from '@/generated/prisma/client';

// Per-organization document numbering. Counters live in `document_counters`,
// keyed (storeId, docType, fy). `nextValue` is always the next value to hand
// out. Allocation is one INSERT ... ON CONFLICT DO UPDATE ... RETURNING, so the
// row lock it takes serializes concurrent allocations until the surrounding
// transaction commits, and a rollback gives the number back (no gaps, no reuse).
//
// ORDER numbers are continuous (fy = 0) and start at Store.orderSeqBase.
// INVOICE / RECEIPT numbers restart at 1 each Indian financial year (1 April, IST).

type Tx = Prisma.TransactionClient;

export type NumberedDocument = 'ORDER' | 'INVOICE' | 'RECEIPT';

const DOCUMENT_PREFIX = { INVOICE: 'IN', RECEIPT: 'RC' } as const;

/** Year the Indian financial year containing this IST calendar date ENDS (2026-05-01 -> 2027). */
export function financialYearEnding(date: string): number {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!match) throw new Error(`Invalid calendar date: ${date}`);
  const year = Number(match[1]);
  return Number(match[2]) >= 4 ? year + 1 : year;
}

/** `IN` or `RC` + org code + `/` + two-digit FY + `/` + 7-digit counter, e.g. IN001/27/0000632. */
export function formatDocumentNumber(
  kind: keyof typeof DOCUMENT_PREFIX,
  orgCode: string,
  fy: number,
  value: bigint | number,
): string {
  const year = String(fy % 100).padStart(2, '0');
  return `${DOCUMENT_PREFIX[kind]}${orgCode}/${year}/${String(value).padStart(7, '0')}`;
}

async function allocate(tx: Tx, storeId: string, docType: NumberedDocument, fy: number): Promise<bigint> {
  const rows = docType === 'ORDER'
    ? await tx.$queryRaw<{ allocated: bigint }[]>`
        INSERT INTO document_counters ("storeId", "docType", "fy", "nextValue", "updatedAt")
        SELECT s.id, 'ORDER'::"DocumentType", 0, s."orderSeqBase" + 1, CURRENT_TIMESTAMP
        FROM stores s WHERE s.id = ${storeId}
        ON CONFLICT ("storeId", "docType", "fy")
        DO UPDATE SET "nextValue" = document_counters."nextValue" + 1, "updatedAt" = CURRENT_TIMESTAMP
        RETURNING "nextValue" - 1 AS allocated`
    : await tx.$queryRaw<{ allocated: bigint }[]>`
        INSERT INTO document_counters ("storeId", "docType", "fy", "nextValue", "updatedAt")
        SELECT s.id, ${docType}::"DocumentType", ${fy}, 2, CURRENT_TIMESTAMP
        FROM stores s WHERE s.id = ${storeId}
        ON CONFLICT ("storeId", "docType", "fy")
        DO UPDATE SET "nextValue" = document_counters."nextValue" + 1, "updatedAt" = CURRENT_TIMESTAMP
        RETURNING "nextValue" - 1 AS allocated`;
  const row = rows[0];
  if (!row) throw new Error('Organization not found.');
  return BigInt(row.allocated);
}

export function allocateOrderNumber(tx: Tx, storeId: string): Promise<bigint> {
  return allocate(tx, storeId, 'ORDER', 0);
}

/** `date` is the order date for invoices and the payment date for receipts (IST `YYYY-MM-DD`). */
async function allocateFormatted(tx: Tx, storeId: string, kind: keyof typeof DOCUMENT_PREFIX, date: string): Promise<string> {
  const fy = financialYearEnding(date);
  const [value, store] = await Promise.all([
    allocate(tx, storeId, kind, fy),
    tx.store.findUniqueOrThrow({ where: { id: storeId }, select: { orgCode: true } }),
  ]);
  return formatDocumentNumber(kind, store.orgCode, fy, value);
}

export function allocateInvoiceNumber(tx: Tx, storeId: string, orderDate: string): Promise<string> {
  return allocateFormatted(tx, storeId, 'INVOICE', orderDate);
}

export function allocateReceiptNumber(tx: Tx, storeId: string, paidAt: string): Promise<string> {
  return allocateFormatted(tx, storeId, 'RECEIPT', paidAt);
}

/**
 * Next unused org code: draws from the sequence and skips any value whose
 * numeric form is already taken by a custom code (001 and 00001 are the same).
 */
export async function nextFreeOrgCode(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [next] = await tx.$queryRaw<{ code: string }[]>`SELECT lpad(nextval('"stores_orgCode_seq"'::regclass)::text, 3, '0') AS code`;
    if (!next || next.code.length > 5) throw new Error('No organization codes are left.');
    const taken = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stores WHERE "orgCode"::integer = ${Number(next.code)} LIMIT 1`;
    if (taken.length === 0) return next.code;
  }
  throw new Error('Could not assign an organization code. Try again.');
}
