'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/server/auth/session';
import { createOrder, recordPayment, updateOrderStatus, type CreateOrderInput } from '@/server/services/orders';
import type { Order, WorkStatus } from '../admin.types';

export async function createOrderAction(input: CreateOrderInput): Promise<Order> {
  const session = await requireSession();
  const order = await createOrder(input, session.id);
  revalidatePath('/admin/sales');
  revalidatePath('/admin/orders');
  return order;
}

export async function updateOrderStatusAction(orderCode: string, nextStatus: WorkStatus): Promise<Order> {
  const session = await requireSession();
  const order = await updateOrderStatus(orderCode, nextStatus, session.id);
  revalidatePath('/admin/sales');
  revalidatePath('/admin/orders');
  return order;
}

export async function recordPaymentAction(orderCode: string, amount: number, method: string): Promise<Order> {
  await requireSession('OWNER');
  const order = await recordPayment(orderCode, amount, method);
  revalidatePath('/admin/sales');
  revalidatePath('/admin/orders');
  return order;
}
