'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/server/auth/session';
import { createExpense, markExpensePaid, type CreateExpenseInput } from '@/server/services/expenses';
import type { Expense } from '../admin.types';

export async function createExpenseAction(input: CreateExpenseInput): Promise<Expense> {
  await requireSession('OWNER');
  const expense = await createExpense(input);
  revalidatePath('/admin/expenses');
  return expense;
}

export async function markExpensePaidAction(id: string): Promise<Expense> {
  await requireSession('OWNER');
  const expense = await markExpensePaid(id);
  revalidatePath('/admin/expenses');
  return expense;
}
