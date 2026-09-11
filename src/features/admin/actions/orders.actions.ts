'use server';

import { revalidatePath } from 'next/cache';
import { requireStoreSession } from '@/server/auth/session';
import { createOrder, recordPayment, updateOrderStatus, type CreateOrderInput } from '@/server/services/orders';
import type { Order, WorkStatus } from '../admin.types';

export async function createOrderAction(input: CreateOrderInput): Promise<Order> {
  const session = await requireStoreSession();
  const order = await createOrder(session.storeId, input, session.id);
  revalidatePath('/admin/sales');
  revalidatePath('/admin/orders');
  return order;
}

export async function updateOrderStatusAction(orderCode: string, nextStatus: WorkStatus): Promise<Order> {
  const session = await requireStoreSession();
  const order = await updateOrderStatus(session.storeId, orderCode, nextStatus, session.id);
  revalidatePath('/admin/sales');
  revalidatePath('/admin/orders');
  return order;
}

export async function recordPaymentAction(orderCode: string, amount: number, method: string): Promise<Order> {
  const session = await requireStoreSession();
  const order = await recordPayment(session.storeId, orderCode, amount, method);
  revalidatePath('/admin/sales');
  revalidatePath('/admin/orders');
  return order;
}
