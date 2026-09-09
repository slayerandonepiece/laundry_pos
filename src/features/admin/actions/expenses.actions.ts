'use server';

import { revalidatePath } from 'next/cache';
import { requireStoreSession } from '@/server/auth/session';
import { createExpense, markExpensePaid, type CreateExpenseInput } from '@/server/services/expenses';
import type { Expense } from '../admin.types';

export async function createExpenseAction(input: CreateExpenseInput): Promise<Expense> {
  const session = await requireStoreSession(undefined, 'OWNER');
  const expense = await createExpense(session.storeId, input);
  revalidatePath('/admin/expenses');
  return expense;
}

export async function markExpensePaidAction(id: string): Promise<Expense> {
  const session = await requireStoreSession(undefined, 'OWNER');
  const expense = await markExpensePaid(session.storeId, id);
  revalidatePath('/admin/expenses');
  return expense;
}
