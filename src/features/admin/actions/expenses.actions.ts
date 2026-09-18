'use server';

import { revalidatePath } from 'next/cache';
import { requireOutletSession, requireStoreSession, resolveOutletSelection, resolveStoreSelection } from '@/server/auth/session';
import { createExpense, markExpensePaid, type CreateExpenseInput } from '@/server/services/expenses';
import type { Expense } from '../admin.types';

export async function createExpenseAction(input: CreateExpenseInput): Promise<Expense> {
  const storeSelection = await resolveStoreSelection();
  const storeSession = await requireStoreSession(storeSelection?.multiStore ? storeSelection.storeId : undefined, 'OWNER');
  const outletSelection = await resolveOutletSelection(storeSession);
  if (!outletSelection.outletId) throw new Error('Select an active outlet before creating an expense.');
  const session = await requireOutletSession(storeSession.storeId, outletSelection.outletId, 'OWNER', storeSession);
  const expense = await createExpense(session.storeId, input, session.outletId);
  revalidatePath('/admin/expenses');
  return expense;
}

export async function markExpensePaidAction(id: string): Promise<Expense> {
  const session = await requireStoreSession(undefined, 'OWNER');
  const expense = await markExpensePaid(session.storeId, id);
  revalidatePath('/admin/expenses');
  return expense;
}
