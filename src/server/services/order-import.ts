import 'server-only';
import { prisma } from '@/server/db';
import { isValidPhone, normalizePhone } from '@/lib/contactValidation';
import { formatCalendarDate, parseCalendarDate, todayIST } from '@/server/dates';
import { ValidationError } from '@/server/errors';
import { allocateOrderNumber } from '@/server/numbering';
import { applyImportedBatchRollup } from '@/server/services/dashboard-rollups';
import { resolveActivePaymentMethod } from '@/server/services/platform-payment-methods';
import { toOrderCode } from '@/server/services/orders';
import type { Prisma } from '@/generated/prisma/client';

// Super Admin history import: past orders entered for one organization, outlet and
// date. Every imported order is Delivered and paid in full on that date, carries the
// price that was actually charged, and is marked isImported so it never takes part in
// invoicing, customer messages or mobile sync. A whole batch can be undone.

export const MAX_IMPORT_ROWS = 300;

export interface ImportRowInput {
  phone: string;
  /** Optional. A typed name always wins; blank keeps the customer's most recent name. */
  name?: string;
  service: string;
  /** A method the organization currently has enabled for collecting after the order. Falls back to the sheet's method. */
  paymentMethod?: string;
  quantity: number | string;
  /** Price charged for the line, in rupees (e.g. "210" or "99.50"). */
  price: number | string;
}

export interface OrderImportInput {
  storeId: string;
  outletId: string;
  /** Order, payment and delivery date (IST calendar day, not in the future). */
  date: string;
  /** Fallback for rows that do not name their own payment method. */
  paymentMethod?: string;
  rows: ImportRowInput[];
}

export interface ImportRowError {
  /** 1-based row number, or 0 for a problem with the whole sheet. */
  row: number;
  field: 'phone' | 'name' | 'service' | 'quantity' | 'price' | 'payment' | 'general';
  message: string;
}

export interface ImportOrderPreview {
  phone: string;
  name: string;
  rows: number[];
  total: number;
}

export interface OrderImportPreview {
  ok: boolean;
  errors: ImportRowError[];
  rowCount: number;
  orderCount: number;
  /** Paise. Imported orders are paid in full, so this is also the amount collected. */
  totalAmount: number;
  orders: ImportOrderPreview[];
}

export interface ImportBatchDTO {
  id: string;
  outletName: string;
  businessDate: string;
  paymentMethod: string;
  rowCount: number;
  orderCount: number;
  totalAmount: number;
  status: 'IMPORTED' | 'UNDONE';
  createdAt: string;
  createdBy: string;
  canUndo: boolean;
}

interface ParsedLine {
  row: number;
  productId: string;
  name: string;
  unit: 'kg' | 'pcs';
  quantity: number;
  amount: number;
}

interface ParsedOrder {
  payment: { name: string; platformPaymentMethodId: string | null };
  phone: string;
  name: string;
  rows: number[];
  lines: ParsedLine[];
  total: number;
}

interface Validated {
  errors: ImportRowError[];
  orders: ParsedOrder[];
  rowCount: number;
  context: { outletId: string; date: Date } | null;
}

function parseQuantity(value: number | string, type: 'ITEM' | 'WEIGHT'): number | string {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return 'Enter a quantity (up to 3 decimals).';
  const quantity = Number(text);
  if (!(quantity > 0)) return 'Quantity must be above zero.';
  if (type === 'ITEM' && !Number.isInteger(quantity)) return 'Items need whole numbers.';
  return quantity;
}

function parsePricePaise(value: number | string): number | string {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return 'Enter the price charged in rupees.';
  const paise = Math.round(Number(text) * 100);
  return paise > 2_000_000_000 ? 'That price is too large.' : paise;
}

async function validate(input: OrderImportInput): Promise<Validated> {
  const errors: ImportRowError[] = [];
  const general = (message: string) => errors.push({ row: 0, field: 'general', message });
  const rowCount = input.rows.length;

  const store = await prisma.store.findUnique({ where: { id: input.storeId }, select: { id: true, deletedAt: true } });
  if (!store || store.deletedAt) general('Organization not found.');
  const outlet = store ? await prisma.outlet.findFirst({ where: { id: input.outletId, storeId: input.storeId }, select: { id: true } }) : null;
  if (store && !outlet) general('Choose an outlet that belongs to this organization.');

  let date: Date | null = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) general('Choose the order date.');
  else {
    try {
      date = parseCalendarDate(input.date);
      if (input.date > todayIST()) { general('The date cannot be in the future.'); date = null; }
    } catch { general('The date is not a real calendar day.'); }
  }

  // Each distinct method is resolved once: it must be enabled for this organization for collecting after the order.
  type Payment = { name: string; platformPaymentMethodId: string | null };
  const payments = new Map<string, Payment | string>();
  if (store) {
    const wanted = new Set(input.rows.map(row => (row.paymentMethod ?? input.paymentMethod ?? '').trim()).filter(Boolean));
    for (const wantedName of wanted) {
      const check = await resolveActivePaymentMethod(input.storeId, wantedName, { phase: 'POST_ORDER' });
      payments.set(wantedName, check.valid ? { name: check.name, platformPaymentMethodId: check.platformPaymentMethodId } : check.error);
    }
  }

  if (rowCount === 0) general('Add at least one row.');
  if (rowCount > MAX_IMPORT_ROWS) general(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
  if (!store || rowCount === 0 || rowCount > MAX_IMPORT_ROWS) {
    return { errors, orders: [], rowCount, context: null };
  }

  // The organization's own catalogue, active or not: old orders may use a service that was retired.
  const products = await prisma.product.findMany({ where: { storeId: input.storeId }, select: { id: true, name: true, type: true, active: true }, orderBy: { createdAt: 'asc' } });
  const byName = new Map<string, (typeof products)[number]>();
  for (const product of products) {
    const key = product.name.trim().toLowerCase();
    const current = byName.get(key);
    if (!current || (!current.active && product.active)) byName.set(key, product);
  }

  const groups = new Map<string, ParsedOrder>();
  const typedNames = new Map<string, string>();
  input.rows.forEach((row, index) => {
    const number = index + 1;
    const fail = (field: ImportRowError['field'], message: string) => errors.push({ row: number, field, message });
    const phone = normalizePhone(String(row.phone ?? ''));
    if (!isValidPhone(phone)) fail('phone', 'Enter a customer number with 8 to 15 digits.');
    const product = byName.get(String(row.service ?? '').trim().toLowerCase());
    if (!product) fail('service', "Pick a service from this organization's catalogue.");
    const name = (row.name ?? '').trim();
    if (name.length > 100) fail('name', 'Names are at most 100 characters.');
    const quantity = product ? parseQuantity(row.quantity, product.type) : null;
    if (typeof quantity === 'string') fail('quantity', quantity);
    else if (!product) { /* the service error already explains this row */ }
    const amount = parsePricePaise(row.price);
    if (typeof amount === 'string') fail('price', amount);
    const methodName = (row.paymentMethod ?? input.paymentMethod ?? '').trim();
    const resolved = methodName ? payments.get(methodName) : undefined;
    if (!methodName) fail('payment', 'Choose the payment method.');
    else if (typeof resolved === 'string') fail('payment', resolved);
    if (!isValidPhone(phone) || !product || typeof quantity !== 'number' || typeof amount !== 'number' || name.length > 100 || !resolved || typeof resolved === 'string') return;

    const group = groups.get(phone) ?? { payment: resolved, phone, name: '', rows: [], lines: [], total: 0 };
    if (group.payment.name !== resolved.name) { fail('payment', 'Rows for the same customer number are one order, so they need the same payment method.'); return; }
    group.rows.push(number);
    group.lines.push({ row: number, productId: product.id, name: product.name, unit: product.type === 'WEIGHT' ? 'kg' : 'pcs', quantity, amount });
    group.total += amount;
    groups.set(phone, group);
    if (name && !typedNames.has(phone)) typedNames.set(phone, name);
  });

  // A typed name always wins; otherwise the customer's most recent name is kept, never blanked.
  const known = await customerNames(input.storeId, [...groups.keys()]);
  for (const group of groups.values()) group.name = typedNames.get(group.phone) ?? known.get(group.phone) ?? '';

  return { errors, orders: [...groups.values()], rowCount, context: date && outlet ? { outletId: outlet.id, date } : null };
}

/** Most recent non-blank customer name per phone for one organization. */
export async function customerNames(storeId: string, phones: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(phones.map(normalizePhone).filter(isValidPhone))];
  if (!unique.length) return names;
  const rows = await prisma.order.findMany({
    where: { storeId, phone: { in: unique }, customerName: { not: '' } },
    orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
    select: { phone: true, customerName: true },
  });
  for (const row of rows) if (!names.has(row.phone)) names.set(row.phone, row.customerName);
  return names;
}

/** Dry run: the same checks as the import, with no writes. */
export async function previewOrderImport(input: OrderImportInput): Promise<OrderImportPreview> {
  const result = await validate(input);
  return {
    ok: result.errors.length === 0 && result.context !== null,
    errors: result.errors,
    rowCount: result.rowCount,
    orderCount: result.orders.length,
    totalAmount: result.orders.reduce((sum, order) => sum + order.total, 0),
    orders: result.orders.map(order => ({ phone: order.phone, name: order.name, rows: order.rows, total: order.total })),
  };
}

function toBatchDTO(batch: {
  id: string; businessDate: Date; paymentMethod: string; rowCount: number; orderCount: number; totalAmount: number;
  status: 'IMPORTED' | 'UNDONE'; createdAt: Date; outlet: { displayName: string }; createdBy: { name: string } | null;
}): ImportBatchDTO {
  return {
    id: batch.id,
    outletName: batch.outlet.displayName,
    businessDate: formatCalendarDate(batch.businessDate),
    paymentMethod: batch.paymentMethod,
    rowCount: batch.rowCount,
    orderCount: batch.orderCount,
    totalAmount: batch.totalAmount,
    status: batch.status,
    createdAt: batch.createdAt.toISOString(),
    createdBy: batch.createdBy?.name ?? 'Super Admin',
    canUndo: batch.status === 'IMPORTED',
  };
}

const batchInclude = { outlet: { select: { displayName: true } }, createdBy: { select: { name: true } } } satisfies Prisma.ImportBatchInclude;

export async function listImportBatches(storeId: string, limit = 20): Promise<ImportBatchDTO[]> {
  const rows = await prisma.importBatch.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: limit, include: batchInclude });
  return rows.map(toBatchDTO);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

/**
 * Imports the sheet as one batch in one transaction. `idempotencyKey` is chosen by
 * the caller per import attempt: a retry or double click returns the batch the first
 * call made instead of importing again.
 */
export async function importOrders(input: OrderImportInput, actorId: string, idempotencyKey: string): Promise<ImportBatchDTO> {
  const key = idempotencyKey.trim();
  if (!key || key.length > 64) throw new ValidationError('Missing import key. Reload the page and try again.');

  const existing = await prisma.importBatch.findUnique({ where: { storeId_idempotencyKey: { storeId: input.storeId, idempotencyKey: key } }, include: batchInclude });
  if (existing) return toBatchDTO(existing);

  const result = await validate(input);
  if (result.errors.length || !result.context) {
    throw new ValidationError(result.errors[0]?.message ?? 'Fix the highlighted rows before importing.');
  }
  const { outletId, date } = result.context;
  const orders = result.orders;
  const totalAmount = orders.reduce((sum, order) => sum + order.total, 0);
  // Event time derived from the order date (midday IST), not from when the import ran.
  const eventAt = new Date(`${input.date}T12:00:00+05:30`);
  const methodSummary = [...new Set(orders.map(order => order.payment.name))].join(', ') || 'None';

  try {
    const batchId = await prisma.$transaction(async tx => {
      const batch = await tx.importBatch.create({
        data: {
          storeId: input.storeId, outletId, createdById: actorId, idempotencyKey: key, businessDate: date,
          paymentMethod: methodSummary, rowCount: result.rowCount, orderCount: orders.length, totalAmount,
        },
      });
      for (const order of orders) {
        await tx.order.create({
          data: {
            storeId: input.storeId,
            outletId,
            orderNumber: await allocateOrderNumber(tx, input.storeId),
            customerName: order.name,
            phone: order.phone,
            orderDate: date,
            dueDate: date,
            completedAt: date,
            status: 'DELIVERED',
            isImported: true,
            importBatchId: batch.id,
            lines: { create: order.lines.map(line => ({ productId: line.productId, name: line.name, quantity: line.quantity, unit: line.unit, amount: line.amount })) },
            payments: order.total > 0
              ? { create: [{ amount: order.total, method: order.payment.name, platformPaymentMethodId: order.payment.platformPaymentMethodId, paidAt: date, storeId: input.storeId, outletId }] }
              : undefined,
            statusEvents: { create: [{ status: 'DELIVERED', at: eventAt, byUserId: actorId, storeId: input.storeId, outletId }] },
          },
        });
      }
      await applyImportedBatchRollup(tx, {
        storeId: input.storeId, outletId, businessDate: date, delta: 1,
        orders: orders.map(order => ({ lines: order.lines.map(line => ({ name: line.name, quantity: line.quantity, amount: line.amount })), paid: order.total })),
      });
      await tx.importBatch.update({ where: { id: batch.id }, data: { finishedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          storeId: input.storeId, outletId, actorId, action: 'IMPORT_ORDERS', entityType: 'ImportBatch', entityId: batch.id,
          afterJson: { businessDate: input.date, paymentMethod: methodSummary, rows: result.rowCount, orders: orders.length, totalAmount },
        },
      });
      return batch.id;
    }, { timeout: 120_000, maxWait: 10_000 });
    return toBatchDTO(await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: batchInclude }));
  } catch (error) {
    // A concurrent attempt with the same key won; return its batch.
    if (isUniqueViolation(error)) {
      const winner = await prisma.importBatch.findUnique({ where: { storeId_idempotencyKey: { storeId: input.storeId, idempotencyKey: key } }, include: batchInclude });
      if (winner) return toBatchDTO(winner);
    }
    throw error;
  }
}

/**
 * Undoes a batch: its orders, payments and history are removed and its rollups
 * reversed exactly. Refused once any imported order has been changed afterwards,
 * so an edit is never silently thrown away. Undoing twice is a no-op.
 */
export async function undoImportBatch(storeId: string, batchId: string, actorId: string): Promise<ImportBatchDTO> {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM import_batches WHERE id = ${batchId} AND "storeId" = ${storeId} FOR UPDATE`;
    const batch = await tx.importBatch.findFirst({ where: { id: batchId, storeId } });
    if (!batch) throw new ValidationError('Import not found.');
    if (batch.status === 'UNDONE') return;

    const orders = await tx.order.findMany({
      where: { importBatchId: batch.id },
      include: { lines: true, payments: true, statusEvents: true, invoice: { select: { id: true } } },
    });
    const finishedAt = batch.finishedAt ?? batch.createdAt;
    for (const order of orders) {
      const total = order.lines.reduce((sum, line) => sum + line.amount, 0);
      const paid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
      const untouched = !order.legacyCancelled && order.status === 'DELIVERED' && order.statusEvents.length === 1
        && paid === total && order.payments.length <= 1 && !order.invoice && order.updatedAt <= finishedAt;
      if (!untouched) {
        throw new ValidationError(`This import can't be undone because order ${toOrderCode(order.orderNumber)} was changed after it was imported.`);
      }
    }

    await applyImportedBatchRollup(tx, {
      storeId, outletId: batch.outletId, businessDate: batch.businessDate, delta: -1,
      orders: orders.map(order => ({
        lines: order.lines.map(line => ({ name: line.name, quantity: Number(line.quantity), amount: line.amount })),
        paid: order.payments.reduce((sum, payment) => sum + payment.amount, 0),
      })),
    });
    await tx.order.deleteMany({ where: { importBatchId: batch.id } });
    await tx.importBatch.update({ where: { id: batch.id }, data: { status: 'UNDONE', undoneAt: new Date(), undoneById: actorId } });
    await tx.auditLog.create({
      data: {
        storeId, outletId: batch.outletId, actorId, action: 'UNDO_ORDER_IMPORT', entityType: 'ImportBatch', entityId: batch.id,
        beforeJson: { orders: batch.orderCount, totalAmount: batch.totalAmount },
      },
    });
  }, { timeout: 120_000, maxWait: 10_000 });
  return toBatchDTO(await prisma.importBatch.findFirstOrThrow({ where: { id: batchId, storeId }, include: batchInclude }));
}
