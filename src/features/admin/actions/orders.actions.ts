'use server';

import { revalidatePath } from 'next/cache';
import { requireOutletSession, requireStoreSession, resolveOutletSelection, resolveStoreSelection } from '@/server/auth/session';
import { createOrder, recordPayment, updateOrderStatus, type CreateOrderInput } from '@/server/services/orders';
import { prisma } from '@/server/db';
import type { Order, WorkStatus } from '../admin.types';

export async function createOrderAction(input: CreateOrderInput): Promise<Order> {
  const storeSelection = await resolveStoreSelection();
  const storeSession = await requireStoreSession(storeSelection?.multiStore ? storeSelection.storeId : undefined);
  const outletSelection = await resolveOutletSelection(storeSession);
  if (!outletSelection.outletId) throw new Error('Select an active outlet before creating an order.');
  const session = await requireOutletSession(storeSession.storeId, outletSelection.outletId, undefined, storeSession);
  const order = await createOrder(session.storeId, input, session.id, session.outletId);
  revalidatePath('/admin/sales');
  revalidatePath('/admin/orders');
  return order;
}

export async function updateOrderStatusAction(orderCode: string, nextStatus: WorkStatus): Promise<Order> {
  const session = await requireStoreSession();
  const outlet = await resolveOutletSelection(session);
  const order = await prisma.order.findFirst({ where: { id: orderCode, storeId: session.storeId }, select: { outletId: true } });
  if (!order || (outlet.outletId && order.outletId !== outlet.outletId)) throw new Error('Order is not in the selected outlet.');
  const updated = await updateOrderStatus(session.storeId, orderCode, nextStatus, session.id);
  revalidatePath('/admin/sales');
  revalidatePath('/admin/orders');
  return updated;
}

export async function recordPaymentAction(orderCode: string, amount: number, method: string): Promise<Order> {
  const session = await requireStoreSession();
  const outlet = await resolveOutletSelection(session);
  const existing = await prisma.order.findFirst({ where: { id: orderCode, storeId: session.storeId }, select: { outletId: true } });
  if (!existing || (outlet.outletId && existing.outletId !== outlet.outletId)) throw new Error('Order is not in the selected outlet.');
  const order = await recordPayment(session.storeId, orderCode, amount, method);
  revalidatePath('/admin/sales');
  revalidatePath('/admin/orders');
  return order;
}
