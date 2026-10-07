import 'server-only';
import { prisma } from '@/server/db';
import { randomBytes } from 'node:crypto';
import { formatCalendarDate } from '@/server/dates';
import { allocateInvoiceNumber } from '@/server/numbering';
import { ValidationError } from '@/server/errors';
import { parseOrderCode, toOrderCode } from './orders';
import { AuthError, requireOutletSession, type StoreSession } from '@/server/auth/session';
import type { Prisma } from '@/generated/prisma/client';

// The store -> customer invoice for a laundry order. Entirely separate from
// SubscriptionPayment.invoiceSeq (platform -> store owner billing) — see
// .agents/2026-09-brainstorm-plan.md Item 7. Deliberately carries no
// snapshotted content of its own: OrderLine/Payment rows are already
// immutable once created, so the invoice just pins a stable number and
// reads everything else live off the order it documents.

export interface OrderInvoiceLine { name: string; quantity: number; unit: string; amount: number }
export interface OrderInvoicePayment { amount: number; method: string; date: string }
export interface OrderInvoiceData {
  invoiceSeq: number;
  invoiceNumber: string;
  accessToken: string;
  generatedAt: string;
  orderCode: string;
  orderDate: string;
  dueDate: string;
  customerName: string;
  phone: string;
  notes: string;
  lines: OrderInvoiceLine[];
  payments: OrderInvoicePayment[];
  total: number;
  paid: number;
  balance: number;
  store: { name: string; address: string; phone: string };
}

const invoiceInclude = {
  order: {
    include: { lines: true, payments: { orderBy: { paidAt: 'asc' as const } }, store: true },
  },
} satisfies Prisma.OrderInvoiceInclude;

type InvoiceRow = Prisma.OrderInvoiceGetPayload<{ include: typeof invoiceInclude }>;

function toInvoiceData(invoice: InvoiceRow): OrderInvoiceData {
  const { order } = invoice;
  const total = order.lines.reduce((sum, line) => sum + line.amount, 0);
  const paid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);

  return {
    invoiceSeq: invoice.invoiceSeq,
    invoiceNumber: invoice.invoiceNumber,
    accessToken: invoice.accessToken,
    generatedAt: invoice.generatedAt.toISOString(),
    orderCode: toOrderCode(order.orderNumber),
    orderDate: formatCalendarDate(order.orderDate),
    dueDate: formatCalendarDate(order.dueDate),
    customerName: order.customerName,
    phone: order.phone,
    notes: order.notes,
    lines: order.lines.map(line => ({ name: line.name, quantity: Number(line.quantity), unit: line.unit, amount: line.amount })),
    payments: order.payments.map(payment => ({ amount: payment.amount, method: payment.method, date: formatCalendarDate(payment.paidAt) })),
    total,
    paid,
    balance: total - paid,
    store: { name: order.store.name, address: order.store.address, phone: order.store.phone },
  };
}

/**
 * An employee may only read invoices for orders of an outlet they are
 * assigned to. Order codes are sequential, so without this any employee could
 * fetch another outlet's customer names, phones and items by counting up.
 * Owners see every outlet; an unknown code passes so the caller's own lookup
 * answers "not found" as before. Throws AuthError('FORBIDDEN').
 */
export async function assertCanReadOrderInvoice(session: StoreSession, orderCode: string): Promise<void> {
  if (session.storeRole !== 'EMPLOYEE') return;
  // Look the row up directly: getOrder hides legacyCancelled orders, yet
  // getOrCreateOrderInvoice still serves them, so they need the outlet check too.
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) return;
  const order = await prisma.order.findUnique({ where: { storeId_orderNumber: { storeId: session.storeId, orderNumber } }, select: { storeId: true, outletId: true } });
  if (!order) return;
  if (!order.outletId) throw new AuthError('FORBIDDEN');
  await requireOutletSession(session.storeId, order.outletId, 'EMPLOYEE', session, { allowRestricted: true });
}

// Callers are responsible for authorization (requireStoreSession) — this
// mirrors the rest of orders.ts, which takes a caller-scoped storeId rather
// than checking sessions itself.
export async function getOrCreateOrderInvoice(storeId: string, orderCode: string): Promise<OrderInvoiceData> {
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) throw new Error('Order not found.');

  const order = await prisma.order.findUnique({
    where: { storeId_orderNumber: { storeId, orderNumber } },
    include: { lines: true, payments: { orderBy: { paidAt: 'asc' } }, store: true },
  });
  if (!order) throw new Error('Order not found.');
  if (order.isImported) throw new ValidationError("Invoices aren't available for imported orders.");

  const total = order.lines.reduce((sum, line) => sum + line.amount, 0);
  const paid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const isDelivered = order.status === 'DELIVERED' || (order.status as string) === 'COMPLETED';
  const isPaidInFull = paid >= total;

  const existing = await prisma.orderInvoice.findUnique({ where: { orderId: order.id } });
  if (!existing && (!isPaidInFull || !isDelivered)) {
    if (!isPaidInFull) {
      throw new ValidationError('Invoice cannot be generated until the order is paid in full.');
    }
    throw new ValidationError('Invoice cannot be generated until the order is delivered.');
  }

  // Lazy, get-or-create: no invoice (and no consumed invoice number) exists
  // until someone actually asks to view/print/download/share one. The number is
  // allocated from the organization's per-FY counter (FY of the order date) in
  // the same transaction as the insert, so a failed insert returns the number.
  // A concurrent double-click loses on the unique orderId and reads the winner.
  let invoice = existing;
  if (!invoice) {
    try {
      invoice = await prisma.$transaction(async tx => tx.orderInvoice.create({
        data: {
          orderId: order.id,
          storeId,
          outletId: order.outletId ?? null,
          invoiceNumber: await allocateInvoiceNumber(tx, storeId, formatCalendarDate(order.orderDate)),
          accessToken: randomBytes(32).toString('base64url'),
        },
      }));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      invoice = await prisma.orderInvoice.findUniqueOrThrow({ where: { orderId: order.id } });
    }
  }

  return toInvoiceData({ ...invoice, order } as InvoiceRow);
}

/**
 * Reads an already-issued invoice without allocating a number or writing data.
 * This is used by restricted subscriptions, which retain historical read/export
 * access but must not be able to create a new invoice through a GET request.
 */
export async function getExistingOrderInvoice(storeId: string, orderCode: string): Promise<OrderInvoiceData | null> {
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) throw new Error('Order not found.');
  const invoice = await prisma.orderInvoice.findFirst({
    where: { storeId, order: { orderNumber } },
    include: invoiceInclude,
  });
  return invoice ? toInvoiceData(invoice) : null;
}

export async function getOrderInvoiceByToken(accessToken: string): Promise<OrderInvoiceData | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(accessToken)) return null;
  const invoice = await prisma.orderInvoice.findUnique({ where: { accessToken }, include: invoiceInclude });
  return invoice ? toInvoiceData(invoice) : null;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}
