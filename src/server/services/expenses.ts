import 'server-only';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { parseCalendarDate, formatCalendarDate, todayIST } from '@/server/dates';
import type { Expense } from '@/features/admin/admin.types';
import type { Prisma } from '@/generated/prisma/client';
import { assertStoreWritable } from '@/server/auth/session';
import { applyExpensePaidRollup } from '@/server/services/dashboard-rollups';

function nextMonthKey(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
}

function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function dueDateForMonth(month: string, dueDay: number): string {
  const day = Math.min(dueDay, daysInMonth(month));
  return `${month}-${String(day).padStart(2, '0')}`;
}

type ExpenseRow = Awaited<ReturnType<typeof prisma.expense.findFirstOrThrow>>;

function toDTO(row: ExpenseRow): Expense {
  return {
    id: row.id,
    outletId: row.outletId ?? undefined,
    title: row.title,
    category: row.category,
    amount: row.amount,
    due: formatCalendarDate(row.dueDate),
    paid: row.paidAt ? formatCalendarDate(row.paidAt) : undefined,
    monthly: row.seriesId !== null,
    seriesId: row.seriesId ?? undefined,
  };
}

// Extend each active recurring series' occurrences through next month, without
// touching existing (possibly already-paid) rows. The (seriesId, periodMonth)
// unique constraint makes this safe to call repeatedly/concurrently.
async function ensureRecurringOccurrences(storeId: string, outletId?: string): Promise<void> {
  const horizon = nextMonthKey(todayIST().slice(0, 7));
  const series = await prisma.recurringExpenseSeries.findMany({
    where: { storeId, active: true, ...(outletId ? { outletId } : {}) },
    include: { occurrences: { orderBy: { dueDate: 'asc' } } },
  });

  const creates: Prisma.ExpenseCreateManyInput[] = [];
  for (const s of series) {
    if (!s.occurrences.length) continue;
    const existingMonths = new Set(s.occurrences.map(o => formatCalendarDate(o.dueDate).slice(0, 7)));
    let cursor = formatCalendarDate(s.occurrences[0].dueDate).slice(0, 7);
    while (cursor <= horizon) {
      if (!existingMonths.has(cursor)) {
        creates.push({
          storeId,
          outletId: s.outletId,
          title: s.title,
          category: s.category,
          amount: s.amount,
          dueDate: parseCalendarDate(dueDateForMonth(cursor, s.dueDay)),
          seriesId: s.id,
          periodMonth: cursor,
        });
      }
      cursor = nextMonthKey(cursor);
    }
  }

  if (creates.length) await prisma.expense.createMany({ data: creates, skipDuplicates: true });
}

export interface ListExpensesOptions {
  outletId?: string;
}

export async function listExpenses(storeId: string, options?: ListExpensesOptions): Promise<Expense[]> {
  await ensureRecurringOccurrences(storeId, options?.outletId);
  const rows = await prisma.expense.findMany({
    where: {
      storeId,
      ...(options?.outletId ? { outletId: options.outletId } : {}),
    },
    orderBy: { dueDate: 'asc' },
  });
  return rows.map(toDTO);
}

const createExpenseSchema = z.object({
  outletId: z.string().trim().optional(),
  title: z.string().trim().min(1),
  category: z.string().trim().min(1),
  amount: z.number().int().positive(),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monthly: z.boolean(),
  paidToday: z.boolean().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export async function createExpense(
  storeId: string,
  input: CreateExpenseInput,
  explicitOutletId?: string,
): Promise<Expense> {
  await assertStoreWritable(storeId);
  const data = createExpenseSchema.parse(input);
  const dueDate = parseCalendarDate(data.due);
  const paidAt = data.paidToday ? parseCalendarDate(todayIST()) : null;
  const outletId = explicitOutletId ?? data.outletId ?? null;

  if (outletId) {
    const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
    if (!outlet || outlet.storeId !== storeId || outlet.status !== 'ACTIVE') {
      throw new Error('Invalid outlet.');
    }
  }

  if (!data.monthly) {
    const row = await prisma.$transaction(async tx => {
      const expense = await tx.expense.create({
        data: {
          storeId,
          outletId,
          title: data.title,
          category: data.category,
          amount: data.amount,
          dueDate,
          paidAt,
        },
      });
      if (paidAt && outletId) {
        await applyExpensePaidRollup(tx, {
          storeId,
          outletId,
          paidAt,
          amount: data.amount,
        });
      }
      return expense;
    });
    return toDTO(row);
  }

  const dueDay = Number(data.due.slice(-2));
  const row = await prisma.$transaction(async tx => {
    const series = await tx.recurringExpenseSeries.create({
      data: {
        storeId,
        outletId,
        title: data.title,
        category: data.category,
        amount: data.amount,
        dueDay,
      },
    });
    const expense = await tx.expense.create({
      data: {
        storeId,
        outletId,
        title: data.title,
        category: data.category,
        amount: data.amount,
        dueDate,
        paidAt,
        seriesId: series.id,
        periodMonth: data.due.slice(0, 7),
      },
    });
    if (paidAt && outletId) {
      await applyExpensePaidRollup(tx, {
        storeId,
        outletId,
        paidAt,
        amount: data.amount,
      });
    }
    return expense;
  });
  return toDTO(row);
}

export async function markExpensePaid(storeId: string, id: string): Promise<Expense> {
  await assertStoreWritable(storeId);
  const paidAt = parseCalendarDate(todayIST());

  const row = await prisma.$transaction(async tx => {
    const existing = await tx.expense.findUnique({
      where: { id },
      select: { storeId: true, outletId: true, amount: true, paidAt: true },
    });
    if (!existing || existing.storeId !== storeId) throw new Error('Expense not found.');
    if (existing.paidAt) {
      return tx.expense.findUniqueOrThrow({ where: { id } });
    }

    const updated = await tx.expense.update({
      where: { id },
      data: { paidAt },
    });

    if (existing.outletId) {
      await applyExpensePaidRollup(tx, {
        storeId,
        outletId: existing.outletId,
        paidAt,
        amount: existing.amount,
      });
    }

    return updated;
  });

  return toDTO(row);
}
