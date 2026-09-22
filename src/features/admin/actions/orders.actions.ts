'use server';

import { revalidatePath } from 'next/cache';
import { requireOutletSession, requireStoreSession, resolveOutletSelection, resolveStoreSelection } from '@/server/auth/session';
import { createOrder, parseOrderCode, recordPayment, updateOrderStatus, type CreateOrderInput } from '@/server/services/orders';
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

export async function updateOrderStatusAction(orderCode: string, nextStatus: WorkStatus): Promise<Order> {
  const session = await requireStoreSession();
  const outlet = await resolveOutletSelection(session);
  const order = await prisma.order.findFirst({ where: { orderNumber: parseOrderCode(orderCode) ?? -1, storeId: session.storeId }, select: { outletId: true } });
  // Owners act across every outlet of their store; employees stay in the selected one.
  if (!order || (session.storeRole !== 'OWNER' && outlet.outletId && order.outletId !== outlet.outletId)) throw new Error('Order is not in the selected outlet.');
  const updated = await updateOrderStatus(session.storeId, orderCode, nextStatus, session.id);
  revalidatePath('/admin/sales');
  revalidatePath('/admin/orders');
  return updated;
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
