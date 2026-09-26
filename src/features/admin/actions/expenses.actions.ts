'use server';

import { revalidatePath } from 'next/cache';
import { requireStoreSession, resolveStoreSelection } from '@/server/auth/session';
import { createExpense, markExpensePaid, type CreateExpenseInput } from '@/server/services/expenses';
import type { Expense } from '../admin.types';

// Note: createExpenseAction no longer forces the cookie-selected outlet.
// The outletId (null = org-wide, string = one outlet) comes from the form
// via input.outletId and is validated inside createExpense() against the store.
export async function createExpenseAction(input: CreateExpenseInput): Promise<Expense> {
  const storeSelection = await resolveStoreSelection();
  const session = await requireStoreSession(
    storeSelection?.multiStore ? storeSelection.storeId : undefined,
    'OWNER',
  );
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
