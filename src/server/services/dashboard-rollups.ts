import 'server-only';
import { prisma } from '@/server/db';
import { parseCalendarDate, formatCalendarDate, assertCalendarRange } from '@/server/dates';
import { ValidationError } from '@/server/errors';
import type { Prisma } from '@/generated/prisma/client';

export interface DailyOutletSummaryDTO {
  outletId: string;
  businessDate: string;
  ordersCreatedCount: number;
  ordersCompletedCount: number;
  grossOrderAmount: number;
  paymentsCollectedAmount: number;
  expensesAmount: number;
}

export interface DailyOutletServiceSummaryDTO {
  outletId: string;
  serviceName: string;
  businessDate: string;
  piecesCount: number;
  orderCount: number;
  amount: number;
}

export const MAX_RECONCILE_DAYS = 92;

export interface RollupFilterOptions {
  outletId?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Incrementally updates daily outlet rollups during transactional order creation.
 */
export async function applyOrderCreationRollup(
  tx: Prisma.TransactionClient,
  params: {
    storeId: string;
    outletId: string;
    orderDate: Date;
    lines: { name: string; quantity: number; amount: number }[];
  },
): Promise<void> {
  const { storeId, outletId, orderDate, lines } = params;
  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);

  // 1. Update DailyOutletSummary
  await tx.dailyOutletSummary.upsert({
    where: {
      storeId_outletId_businessDate: {
        storeId,
        outletId,
        businessDate: orderDate,
      },
    },
    create: {
      storeId,
      outletId,
      businessDate: orderDate,
      ordersCreatedCount: 1,
      grossOrderAmount: totalAmount,
    },
    update: {
      ordersCreatedCount: { increment: 1 },
      grossOrderAmount: { increment: totalAmount },
    },
  });

  // A service can appear in multiple lines in one order. `orderCount` is
  // the number of distinct orders containing a service, never line count.
  const services = new Map<string, { piecesCount: number; amount: number }>();
  for (const line of lines) {
    const service = services.get(line.name) ?? { piecesCount: 0, amount: 0 };
    service.piecesCount += Math.round(line.quantity);
    service.amount += line.amount;
    services.set(line.name, service);
  }

  // 2. Update each service once for this order.
  for (const [serviceName, service] of services) {
    await tx.dailyOutletServiceSummary.upsert({
      where: {
        storeId_outletId_serviceName_businessDate: {
          storeId,
          outletId,
          serviceName,
          businessDate: orderDate,
        },
      },
      create: {
        storeId,
        outletId,
        serviceName,
        businessDate: orderDate,
        piecesCount: service.piecesCount,
        orderCount: 1,
        amount: service.amount,
      },
      update: {
        piecesCount: { increment: service.piecesCount },
        orderCount: { increment: 1 },
        amount: { increment: service.amount },
      },
    });
  }
}

/**
 * Incrementally updates daily outlet rollups during payment recording.
 */
export async function applyPaymentRollup(
  tx: Prisma.TransactionClient,
  params: {
    storeId: string;
    outletId: string;
    paidAt: Date;
    amount: number;
  },
): Promise<void> {
  const { storeId, outletId, paidAt, amount } = params;

  await tx.dailyOutletSummary.upsert({
    where: {
      storeId_outletId_businessDate: {
        storeId,
        outletId,
        businessDate: paidAt,
      },
    },
    create: {
      storeId,
      outletId,
      businessDate: paidAt,
      paymentsCollectedAmount: amount,
    },
    update: {
      paymentsCollectedAmount: { increment: amount },
    },
  });
}

/**
 * Incrementally updates completed orders count when status changes to DELIVERED.
 */
export async function applyOrderStatusCompletedRollup(
  tx: Prisma.TransactionClient,
  params: {
    storeId: string;
    outletId: string;
    completedAt: Date;
    delta?: 1 | -1;
  },
): Promise<void> {
  const { storeId, outletId, completedAt, delta = 1 } = params;

  await tx.dailyOutletSummary.upsert({
    where: {
      storeId_outletId_businessDate: {
        storeId,
        outletId,
        businessDate: completedAt,
      },
    },
    create: {
      storeId,
      outletId,
      businessDate: completedAt,
      ordersCompletedCount: delta,
    },
    update: {
      ordersCompletedCount: { increment: delta },
    },
  });
}

/**
 * Incrementally updates expenses in daily outlet rollups when an expense is paid.
 */
export async function applyExpensePaidRollup(
  tx: Prisma.TransactionClient,
  params: {
    storeId: string;
    outletId: string;
    paidAt: Date;
    amount: number;
  },
): Promise<void> {
  const { storeId, outletId, paidAt, amount } = params;

  await tx.dailyOutletSummary.upsert({
    where: {
      storeId_outletId_businessDate: {
        storeId,
        outletId,
        businessDate: paidAt,
      },
    },
    create: {
      storeId,
      outletId,
      businessDate: paidAt,
      expensesAmount: amount,
    },
    update: {
      expensesAmount: { increment: amount },
    },
  });
}

/**
 * Protected reconciliation / rebuild service.
 * Recomputes all rollups from authoritative source records for a specified
 * organization, outlet, and date range, then writes an AuditLog row.
 */
export async function reconcileDailyOutletRollups(
  storeId: string,
  outletId: string,
  fromDate: string,
  toDate: string,
  actorId?: string,
): Promise<{ daysReconciled: number }> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet || outlet.storeId !== storeId) {
    throw new ValidationError('Outlet not found for this organization.');
  }

  // Each reconciled day runs its own transaction, so the span must be bounded.
  const { start, end } = assertCalendarRange(fromDate, toDate, MAX_RECONCILE_DAYS);

  // Iterate day-by-day across the date range
  let current = new Date(start);
  let daysReconciled = 0;

  while (current <= end) {
    const businessDate = new Date(current);

    await prisma.$transaction(async tx => {
      // 1. Orders created on this day
      const createdOrders = await tx.order.findMany({
        where: {
          storeId,
          outletId,
          orderDate: businessDate,
          legacyCancelled: false,
        },
        include: { lines: true },
      });

      const ordersCreatedCount = createdOrders.length;
      let grossOrderAmount = 0;
      const serviceMap = new Map<string, { pieces: number; count: number; amount: number }>();

      for (const order of createdOrders) {
        const servicesInOrder = new Map<string, { pieces: number; amount: number }>();
        for (const line of order.lines) {
          grossOrderAmount += line.amount;
          const service = servicesInOrder.get(line.name) ?? { pieces: 0, amount: 0 };
          service.pieces += Math.round(Number(line.quantity));
          service.amount += line.amount;
          servicesInOrder.set(line.name, service);
        }
        for (const [serviceName, service] of servicesInOrder) {
          const prev = serviceMap.get(serviceName) ?? { pieces: 0, count: 0, amount: 0 };
          prev.pieces += service.pieces;
          prev.count += 1;
          prev.amount += service.amount;
          serviceMap.set(serviceName, prev);
        }
      }

      // 2. Orders completed on this day
      const ordersCompletedCount = await tx.order.count({
        where: {
          storeId,
          outletId,
          completedAt: businessDate,
          legacyCancelled: false,
        },
      });

      // 3. Payments collected on this day
      const paymentsAgg = await tx.payment.aggregate({
        _sum: { amount: true },
        where: {
          storeId,
          outletId,
          paidAt: businessDate,
        },
      });
      const paymentsCollectedAmount = paymentsAgg._sum.amount ?? 0;

      // 4. Expenses paid on this day
      const expensesAgg = await tx.expense.aggregate({
        _sum: { amount: true },
        where: {
          storeId,
          outletId,
          paidAt: businessDate,
        },
      });
      const expensesAmount = expensesAgg._sum.amount ?? 0;

      // Upsert exact source totals into DailyOutletSummary
      await tx.dailyOutletSummary.upsert({
        where: {
          storeId_outletId_businessDate: {
            storeId,
            outletId,
            businessDate,
          },
        },
        create: {
          storeId,
          outletId,
          businessDate,
          ordersCreatedCount,
          ordersCompletedCount,
          grossOrderAmount,
          paymentsCollectedAmount,
          expensesAmount,
        },
        update: {
          ordersCreatedCount,
          ordersCompletedCount,
          grossOrderAmount,
          paymentsCollectedAmount,
          expensesAmount,
        },
      });

      // Reconcile service breakdown for this day
      // First, delete existing service summaries for this day to avoid stale items
      await tx.dailyOutletServiceSummary.deleteMany({
        where: {
          storeId,
          outletId,
          businessDate,
        },
      });

      // Insert recomputed service summaries
      for (const [serviceName, stats] of serviceMap.entries()) {
        await tx.dailyOutletServiceSummary.create({
          data: {
            storeId,
            outletId,
            serviceName,
            businessDate,
            piecesCount: stats.pieces,
            orderCount: stats.count,
            amount: stats.amount,
          },
        });
      }
    });

    daysReconciled++;
    // Advance to next day
    current = new Date(current.getTime() + 86400000);
  }

  // Audit log entry for protected reconciliation
  await prisma.auditLog.create({
    data: {
      storeId,
      outletId,
      actorId: actorId ?? null,
      action: 'RECONCILE_DAILY_ROLLUPS',
      entityType: 'Outlet',
      entityId: outletId,
      afterJson: { fromDate, toDate, daysReconciled },
    },
  });

  return { daysReconciled };
}

/**
 * Read services for DailyOutletSummary.
 * Owner can query all outlets or a specific outlet; employees query only active outlet.
 */
export async function getDailyOutletSummaries(
  storeId?: string,
  options?: RollupFilterOptions,
): Promise<DailyOutletSummaryDTO[]> {
  const where: Prisma.DailyOutletSummaryWhereInput = {
    ...(storeId ? { storeId } : {}),
    ...(options?.outletId ? { outletId: options.outletId } : {}),
    ...(options?.fromDate || options?.toDate
      ? {
          businessDate: {
            ...(options.fromDate ? { gte: parseCalendarDate(options.fromDate) } : {}),
            ...(options.toDate ? { lte: parseCalendarDate(options.toDate) } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.dailyOutletSummary.findMany({
    where,
    orderBy: { businessDate: 'asc' },
  });

  return rows.map(r => ({
    outletId: r.outletId,
    businessDate: formatCalendarDate(r.businessDate),
    ordersCreatedCount: r.ordersCreatedCount,
    ordersCompletedCount: r.ordersCompletedCount,
    grossOrderAmount: r.grossOrderAmount,
    paymentsCollectedAmount: r.paymentsCollectedAmount,
    expensesAmount: r.expensesAmount,
  }));
}

/**
 * Read services for DailyOutletServiceSummary.
 */
export async function getDailyOutletServiceSummaries(
  storeId?: string,
  options?: RollupFilterOptions,
): Promise<DailyOutletServiceSummaryDTO[]> {
  const where: Prisma.DailyOutletServiceSummaryWhereInput = {
    ...(storeId ? { storeId } : {}),
    ...(options?.outletId ? { outletId: options.outletId } : {}),
    ...(options?.fromDate || options?.toDate
      ? {
          businessDate: {
            ...(options.fromDate ? { gte: parseCalendarDate(options.fromDate) } : {}),
            ...(options.toDate ? { lte: parseCalendarDate(options.toDate) } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.dailyOutletServiceSummary.findMany({
    where,
    orderBy: { businessDate: 'asc' },
  });

  return rows.map(r => ({
    outletId: r.outletId,
    serviceName: r.serviceName,
    businessDate: formatCalendarDate(r.businessDate),
    piecesCount: r.piecesCount,
    orderCount: r.orderCount,
    amount: r.amount,
  }));
}
