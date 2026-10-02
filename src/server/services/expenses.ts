import 'server-only';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { parseCalendarDate, formatCalendarDate, todayIST } from '@/server/dates';
import type { Expense } from '@/features/admin/admin.types';
import type { Prisma } from '@/generated/prisma/client';
import { assertStoreWritable } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';
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

// Serialize reminders and mutations so a deleted recurring bill cannot be regenerated
// by a concurrent read, and paid rollups are reversed exactly once.
async function lockExpenses(tx: Prisma.TransactionClient, storeId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ 'expenses:' + storeId }, 0))`;
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
  await prisma.$transaction(async tx => {
    await lockExpenses(tx, storeId);
    const horizon = nextMonthKey(todayIST().slice(0, 7));
    const series = await tx.recurringExpenseSeries.findMany({
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

    if (creates.length) await tx.expense.createMany({ data: creates, skipDuplicates: true });
  });
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
  idempotencyKey: z.string().trim().min(1).max(64).optional(),
  outletId: z.string().trim().optional(),
  title: z.string().trim().min(1),
  category: z.string().trim().min(1),
  amount: z.number().int().positive(),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monthly: z.boolean(),
  paidToday: z.boolean().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

async function findExistingExpense(
  storeId: string,
  idempotencyKey?: string,
): Promise<Expense | null> {
  if (!idempotencyKey) return null;
  const byKey = await prisma.expense.findUnique({
    where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
  });
  if (!byKey) return null;
  return toDTO(byKey);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

export async function createExpense(
  storeId: string,
  input: CreateExpenseInput,
  explicitOutletId?: string,
): Promise<Expense> {
  await assertStoreWritable(storeId);
  const data = createExpenseSchema.parse(input);
  // The header outlet would silently win over the body's; fail loudly instead.
  if (explicitOutletId && data.outletId && explicitOutletId !== data.outletId) {
    throw new ValidationError('Conflicting outlet: X-Outlet-Id and body.outletId must match.');
  }

  const existing = await findExistingExpense(storeId, data.idempotencyKey);
  if (existing) return existing;

  const dueDate = parseCalendarDate(data.due);
  const paidAt = data.paidToday ? parseCalendarDate(todayIST()) : null;
  const outletId = explicitOutletId ?? data.outletId ?? null;

  if (outletId) {
    const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
    if (!outlet || outlet.storeId !== storeId || outlet.status !== 'ACTIVE') {
      throw new Error('Invalid outlet.');
    }
  }

  let row: ExpenseRow;
  try {
    if (!data.monthly) {
      row = await prisma.$transaction(async tx => {
        await lockExpenses(tx, storeId);
        const expense = await tx.expense.create({
          data: {
            storeId,
            outletId,
            idempotencyKey: data.idempotencyKey ?? null,
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
    } else {
      const dueDay = Number(data.due.slice(-2));
      row = await prisma.$transaction(async tx => {
        await lockExpenses(tx, storeId);
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
            idempotencyKey: data.idempotencyKey ?? null,
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
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      const winner = await findExistingExpense(storeId, data.idempotencyKey);
      if (winner) return winner;
    }
    throw err;
  }

  return toDTO(row);
}

export async function markExpensePaid(storeId: string, id: string, paidDate = todayIST()): Promise<Expense> {
  await assertStoreWritable(storeId);
  let paidAt: Date;
  try { paidAt = parseCalendarDate(paidDate); } catch { throw new ValidationError('Choose a valid paid date.'); }
  if (paidDate > todayIST()) throw new ValidationError('Paid date cannot be in the future.');

  const row = await prisma.$transaction(async tx => {
    await lockExpenses(tx, storeId);
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

// Recompute the affected date rather than subtracting from a possibly missing
// historical summary. Other daily metrics stay untouched.
async function refreshExpenseTotal(tx: Prisma.TransactionClient, storeId: string, outletId: string, paidAt: Date): Promise<void> {
  const result = await tx.expense.aggregate({ where: { storeId, outletId, paidAt }, _sum: { amount: true } });
  const expensesAmount = result._sum.amount ?? 0;
  await tx.dailyOutletSummary.upsert({
    where: { storeId_outletId_businessDate: { storeId, outletId, businessDate: paidAt } },
    create: { storeId, outletId, businessDate: paidAt, expensesAmount },
    update: { expensesAmount },
  });
}

const updateExpenseSchema = createExpenseSchema.pick({ title: true, category: true, amount: true, due: true, outletId: true }).extend({ outletId: z.string().trim().nullable().optional() });
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export async function updateExpense(storeId: string, id: string, input: UpdateExpenseInput): Promise<Expense> {
  await assertStoreWritable(storeId);
  const data = updateExpenseSchema.parse(input);
  const dueDate = parseCalendarDate(data.due);
  const outletId = data.outletId || null;
  const row = await prisma.$transaction(async tx => {
    await lockExpenses(tx, storeId);
    const existing = await tx.expense.findFirst({ where: { id, storeId } });
    if (!existing) throw new ValidationError('Expense not found.');
    if (outletId && !await tx.outlet.findFirst({ where: { id: outletId, storeId, status: 'ACTIVE' } })) {
      throw new ValidationError('Choose an active outlet in this store.');
    }
    if (existing.seriesId && data.due.slice(0, 7) !== existing.periodMonth) {
      throw new ValidationError('Keep a monthly bill in its original month.');
    }
    const updated = await tx.expense.update({ where: { id }, data: {
      title: data.title, category: data.category, amount: data.amount, dueDate, outletId,
    } });
    if (existing.paidAt && existing.outletId) {
      await refreshExpenseTotal(tx, storeId, existing.outletId, existing.paidAt);
    }
    if (updated.paidAt && updated.outletId && updated.outletId !== existing.outletId) {
      await refreshExpenseTotal(tx, storeId, updated.outletId, updated.paidAt);
    }
    return updated;
  });
  return toDTO(row);
}

export async function deleteExpense(storeId: string, id: string): Promise<void> {
  await assertStoreWritable(storeId);
  await prisma.$transaction(async tx => {
    await lockExpenses(tx, storeId);
    const existing = await tx.expense.findFirst({ where: { id, storeId } });
    if (!existing) throw new ValidationError('Expense not found.');
    if (existing.seriesId) {
      await tx.recurringExpenseSeries.update({ where: { id: existing.seriesId }, data: { active: false } });
    }
    await tx.expense.delete({ where: { id } });
    if (existing.paidAt && existing.outletId) {
      await refreshExpenseTotal(tx, storeId, existing.outletId, existing.paidAt);
    }
  });
}
