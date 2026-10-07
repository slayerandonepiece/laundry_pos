import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/server/db';
import { formatCalendarDate } from '@/server/dates';
import { parseOrderCode, toOrderCode } from './orders';
import type { Prisma } from '@/generated/prisma/client';

// The customer-facing order slip: what was handed in, the total, what is paid
// and what is still due. It is not an invoice (no invoice number, no tax lines);
// the invoice only exists once the order is delivered and paid. Like the invoice
// it is reached through an opaque random token, never the order number.

export interface OrderSlipLine { name: string; quantity: number; unit: string; amount: number }
export interface OrderSlipData {
  accessToken: string;
  orderCode: string;
  status: 'Pending' | 'In Progress' | 'Ready' | 'Delivered';
  orderDate: string;
  dueDate: string;
  customerName: string;
  phone: string;
  notes: string;
  lines: OrderSlipLine[];
  total: number;
  paid: number;
  balance: number;
  store: { name: string; address: string; phone: string };
  outlet: { name: string; phone: string } | null;
}

const slipInclude = { lines: true, payments: true, store: true, outlet: true } satisfies Prisma.OrderInclude;
type SlipRow = Prisma.OrderGetPayload<{ include: typeof slipInclude }>;

const STATUS_LABEL = { PENDING: 'Pending', IN_PROGRESS: 'In Progress', READY: 'Ready', DELIVERED: 'Delivered' } as const;

function toSlipData(order: SlipRow, accessToken: string): OrderSlipData {
  const total = order.lines.reduce((sum, line) => sum + line.amount, 0);
  const paid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
  return {
    accessToken,
    orderCode: toOrderCode(order.orderNumber),
    status: STATUS_LABEL[order.status],
    orderDate: formatCalendarDate(order.orderDate),
    dueDate: formatCalendarDate(order.dueDate),
    customerName: order.customerName,
    phone: order.phone,
    notes: order.notes,
    lines: order.lines.map(line => ({ name: line.name, quantity: Number(line.quantity), unit: line.unit, amount: line.amount })),
    total,
    paid,
    balance: total - paid,
    store: { name: order.store.name, address: order.store.address, phone: order.store.phone },
    outlet: order.outlet ? { name: order.outlet.displayName, phone: order.outlet.phone } : null,
  };
}

/**
 * Returns the slip for an order, creating its access token on first use.
 * Callers authorize (requireStoreSession / assertCanReadOrderInvoice); this takes
 * a caller-scoped storeId like the rest of the order services.
 */
export async function getOrCreateOrderSlip(storeId: string, orderCode: string): Promise<OrderSlipData> {
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) throw new Error('Order not found.');
  const order = await prisma.order.findUnique({ where: { storeId_orderNumber: { storeId, orderNumber } }, include: slipInclude });
  if (!order || order.legacyCancelled) throw new Error('Order not found.');
  let token = order.slipToken;
  if (!token) {
    // Only the first writer sets the token; a concurrent loser reads the winner's.
    await prisma.order.updateMany({ where: { id: order.id, slipToken: null }, data: { slipToken: randomBytes(32).toString('base64url') } });
    token = (await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { slipToken: true } })).slipToken;
  }
  if (!token) throw new Error('Order not found.');
  return toSlipData(order, token);
}

export async function getOrderSlipByToken(accessToken: string): Promise<OrderSlipData | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(accessToken)) return null;
  const order = await prisma.order.findUnique({ where: { slipToken: accessToken }, include: slipInclude });
  if (!order || order.legacyCancelled) return null;
  return toSlipData(order, accessToken);
}
