'use server';

import { normalizePhone, isValidPhone } from '@/lib/contactValidation';
import { revalidatePath } from 'next/cache';
import { requireOutletSession, requireStoreSession, resolveOutletSelection, resolveStoreSelection } from '@/server/auth/session';
import { cancelOrder, createOrder, deliverOrderWithPayment, findCustomerNameByPhone, parseOrderCode, recordPayment, updateOrderStatus, type CreateOrderInput } from '@/server/services/orders';
import { buildOrderMessage, type OrderMessage } from '@/server/services/order-messages';
import { ValidationError } from '@/server/errors';
import { ZodError } from 'zod';
import { prisma } from '@/server/db';
import type { Order, WorkStatus } from '../admin.types';

export async function createOrderAction(input: CreateOrderInput, outletId?: string): Promise<Order> {
  const storeSelection = await resolveStoreSelection();
  const storeSession = await requireStoreSession(storeSelection?.multiStore ? storeSelection.storeId : undefined);
  let targetOutletId = typeof outletId === 'string' && outletId ? outletId : undefined;
  if (!targetOutletId) {
    const outletSelection = await resolveOutletSelection(storeSession);
    // Owners of a multi-outlet store must pick the outlet explicitly on New sale;
    // employees (and single-outlet stores) keep the selected/default outlet.
    if (storeSession.storeRole === 'OWNER' && outletSelection.options.length > 1) throw new Error('Choose an outlet for this order.');
    targetOutletId = outletSelection.outletId ?? undefined;
  }
  if (!targetOutletId) throw new Error('Select an active outlet before creating an order.');
  // Rejects outlets outside this store, inactive outlets, and (for employees) outlets they aren't assigned to.
  const session = await requireOutletSession(storeSession.storeId, targetOutletId, undefined, storeSession);
  const order = await createOrder(session.storeId, input, session.id, session.outletId);
  revalidatePath('/admin/sales');
  revalidatePath('/admin/orders');
  return order;
}

/** A failure the user should read: the server explains it (e.g. a balance is still due). */
export type OrderActionError = { ok: false; error: string };

// Owners act across every outlet of their store; employees stay in the selected one.
async function assertOrderInSelectedOutlet(session: Awaited<ReturnType<typeof requireStoreSession>>, orderCode: string) {
  const outlet = await resolveOutletSelection(session);
  const order = await prisma.order.findFirst({ where: { orderNumber: parseOrderCode(orderCode) ?? -1, storeId: session.storeId }, select: { outletId: true } });
  if (!order || (session.storeRole !== 'OWNER' && outlet.outletId && order.outletId !== outlet.outletId)) throw new Error('Order is not in the selected outlet.');
}

export async function updateOrderStatusAction(orderCode: string, nextStatus: WorkStatus): Promise<Order | OrderActionError> {
  const session = await requireStoreSession();
  await assertOrderInSelectedOutlet(session, orderCode);
  try {
    const updated = await updateOrderStatus(session.storeId, orderCode, nextStatus, session.id);
    revalidatePath('/admin/sales');
    revalidatePath('/admin/orders');
    return updated;
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Collects the outstanding balance (if any) and delivers the order in one step. */
export async function deliverOrderAction(orderCode: string, input: { method?: string } = {}): Promise<Order | OrderActionError> {
  const session = await requireStoreSession();
  await assertOrderInSelectedOutlet(session, orderCode);
  try {
    const updated = await deliverOrderWithPayment(session.storeId, orderCode, { method: input.method }, session.id);
    revalidatePath('/admin/sales');
    revalidatePath('/admin/orders');
    return updated;
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

/** The customer message for the order's current status, from the organization's template. */
export async function getOrderMessageAction(orderCode: string): Promise<OrderMessage> {
  const session = await requireStoreSession();
  await assertOrderInSelectedOutlet(session, orderCode);
  return buildOrderMessage(session.storeId, orderCode);
}

/**
 * Owner-only: cancels an order that has not been delivered, with a reason. Delivered orders
 * are final; fixing one afterwards is a Super Admin correction. Money already collected is
 * not refunded by this: the owner settles that with the customer.
 */
export async function cancelOrderAction(orderCode: string, reason: string): Promise<{ ok: true } | OrderActionError> {
  const session = await requireStoreSession(undefined, 'OWNER');
  await assertOrderInSelectedOutlet(session, orderCode);
  try {
    await cancelOrder(session.storeId, orderCode, session.id, reason);
    revalidatePath('/admin/sales');
    revalidatePath('/admin/orders');
    revalidatePath('/');
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    if (error instanceof ZodError) return { ok: false, error: error.issues.map(issue => issue.message).join(', ') };
    throw error;
  }
}

export async function recordPaymentAction(orderCode: string, amount: number, method: string): Promise<Order> {
  const session = await requireStoreSession();
  const outlet = await resolveOutletSelection(session);
  const existing = await prisma.order.findFirst({ where: { orderNumber: parseOrderCode(orderCode) ?? -1, storeId: session.storeId }, select: { outletId: true } });
  if (!existing || (session.storeRole !== 'OWNER' && outlet.outletId && existing.outletId !== outlet.outletId)) throw new Error('Order is not in the selected outlet.');
  const order = await recordPayment(session.storeId, orderCode, amount, method);
  revalidatePath('/admin/sales');
  revalidatePath('/admin/orders');
  return order;
}

export async function findCustomerNameByPhoneAction(phone: string): Promise<string | null> {
  const selection = await resolveStoreSelection();
  const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined);
  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) throw new Error('Enter a valid phone number (8–15 digits).');
  return findCustomerNameByPhone(session.storeId, normalized);
}
