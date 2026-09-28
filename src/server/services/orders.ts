import "server-only";
import { z } from "zod";
import { prisma } from "@/server/db";
import { computeLineAmount } from "@/server/pricing";
import {
  parseCalendarDate,
  formatCalendarDate,
  todayIST,
} from "@/server/dates";
import type { Order, WorkStatus } from "@/features/admin/admin.types";
import type { Prisma } from "@/generated/prisma/client";
import { resolveActivePaymentMethod } from "@/server/services/platform-payment-methods";
import { assertStoreWritable } from "@/server/auth/session";
import {
  applyOrderCreationRollup,
  applyPaymentRollup,
  applyOrderStatusCompletedRollup,
} from "@/server/services/dashboard-rollups";

const ORDER_CODE_PREFIX = "EL-";

export function toOrderCode(orderNumber: number) {
  return `${ORDER_CODE_PREFIX}${orderNumber}`;
}

export function parseOrderCode(code: string): number | null {
  const match = /^EL-(\d+)$/.exec(code.trim());
  return match ? Number(match[1]) : null;
}

const STATUS_TO_DB = {
  Pending: "PENDING",
  "In Progress": "IN_PROGRESS",
  Ready: "READY",
  Delivered: "DELIVERED",
} as const;
const STATUS_FROM_DB: Record<string, WorkStatus> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  READY: "Ready",
  DELIVERED: "Delivered",
  COMPLETED: "Delivered",
};

const entrySchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
});
const createOrderSchema = z.object({
  idempotencyKey: z.string().min(1),
  offlineId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((id) => parseOrderCode(id) === null, "offlineId cannot look like an order code.")
    .optional(),
  customerName: z.string().trim().default(""),
  phone: z.string().regex(/^\+?[0-9]{8,15}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().default(""),
  entries: z.array(entrySchema).min(1),
  outletId: z.string().trim().optional(),
  initialPayment: z
    .object({
      amount: z.number().int().nonnegative(),
      method: z.string().trim().min(1).max(40),
    })
    .optional(),
});

const includeForList = {
  lines: true,
  payments: { orderBy: { paidAt: "asc" } },
  statusEvents: { orderBy: { at: "asc" } },
} satisfies Prisma.OrderInclude;

const includeForDTO = {
  lines: true,
  payments: { orderBy: { paidAt: "asc" } },
  statusEvents: { orderBy: { at: "asc" }, include: { byUser: { select: { name: true } } } },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof includeForDTO }>;

type OrderListRow = Prisma.OrderGetPayload<{ include: typeof includeForList }>;

function toOrderDTO(row: OrderRow | OrderListRow, actorNames?: Map<string, string>): Order {
  return {
    id: toOrderCode(row.orderNumber),
    offlineId: row.offlineId ?? undefined,
    outletId: row.outletId ?? undefined,
    name: row.customerName,
    phone: row.phone,
    date: formatCalendarDate(row.orderDate),
    due: formatCalendarDate(row.dueDate),
    completed: row.completedAt
      ? formatCalendarDate(row.completedAt)
      : undefined,
    status: STATUS_FROM_DB[row.status],
    lines: row.lines.map((line) => ({
      productId: line.productId ?? "",
      name: line.name,
      quantity: Number(line.quantity),
      unit: line.unit,
      amount: line.amount,
    })),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      date: formatCalendarDate(payment.paidAt),
      method: payment.method,
      clientActionId: payment.clientActionId ?? undefined,
    })),
    notes: row.notes,
    history: row.statusEvents.map((event) => ({
      status: STATUS_FROM_DB[event.status],
      at: event.at.toISOString(),
      by: ("byUser" in event ? event.byUser?.name : actorNames?.get(event.byUserId ?? "")) ?? "System",
    })),
  };
}

export interface ListOrdersOptions {
  limit?: number;
  sort?: "recent" | "default";
  outletId?: string;
}

export async function listOrders(
  storeId: string,
  options?: ListOrdersOptions,
): Promise<Order[]> {
  const rows = await prisma.order.findMany({
    where: {
      storeId,
      legacyCancelled: false,
      ...(options?.outletId ? { outletId: options.outletId } : {}),
    },
    include: includeForList,
    orderBy: { orderNumber: "desc" },
    ...(options?.limit ? { take: options.limit } : {}),
  });
  const actorIds = [...new Set(rows.flatMap(row => row.statusEvents.flatMap(event => event.byUserId ? [event.byUserId] : [])))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const actorNames = new Map(actors.map(actor => [actor.id, actor.name]));
  return rows.map(row => toOrderDTO(row, actorNames));
}

/**
 * Returning-customer lookup for the new-order flow's phone step: the most
 * recent order's customer name for this phone at this store, or null if
 * this phone has never ordered here (or every past order left the name
 * blank). Store-scoped like everything else — a phone number is not a
 * unique identity across stores.
 */
export async function findCustomerNameByPhone(
  storeId: string,
  phone: string,
): Promise<string | null> {
  const row = await prisma.order.findFirst({
    where: { storeId, phone, customerName: { not: "" } },
    orderBy: { orderDate: "desc" },
    select: { customerName: true },
  });
  return row?.customerName ?? null;
}

export interface OrderSyncCursor {
  updatedAt: Date;
  orderNumber: number;
}

export function parseSyncCursor(raw: string): OrderSyncCursor {
  const idx = raw.lastIndexOf("_");
  if (idx <= 0) throw new Error("Invalid sync cursor.");
  const updatedAt = new Date(raw.slice(0, idx));
  const orderNumber = Number(raw.slice(idx + 1));
  if (Number.isNaN(updatedAt.getTime()) || !Number.isInteger(orderNumber)) {
    throw new Error("Invalid sync cursor.");
  }
  return { updatedAt, orderNumber };
}

function toSyncCursor(row: { updatedAt: Date; orderNumber: number }): string {
  return `${row.updatedAt.toISOString()}_${row.orderNumber}`;
}

/**
 * Delta sync: returns only orders changed after `cursor`, oldest-first, in
 * pages of `limit`. Ordered by (updatedAt, orderNumber) so pagination stays
 * correct even when two rows share the same updatedAt millisecond. A
 * cancelled order is still returned (with `deleted: true`) rather than
 * filtered out, so a device that already cached it can remove it locally —
 * dropping it here would leave a stale ghost order on other devices forever.
 */
export async function listOrdersSince(
  storeId: string,
  cursor: OrderSyncCursor | null,
  limit: number,
  outletId?: string,
): Promise<{
  orders: (Order & { deleted: boolean })[];
  nextCursor: string | null;
}> {
  const rows = await prisma.order.findMany({
    where: {
      storeId,
      ...(outletId ? { outletId } : {}),
      ...(cursor
        ? {
            OR: [
              { updatedAt: { gt: cursor.updatedAt } },
              {
                updatedAt: cursor.updatedAt,
                orderNumber: { gt: cursor.orderNumber },
              },
            ],
          }
        : {}),
    },
    include: includeForDTO,
    orderBy: [{ updatedAt: "asc" }, { orderNumber: "asc" }],
    take: limit,
  });

  const orders = rows.map((row) => ({
    ...toOrderDTO(row),
    deleted: row.legacyCancelled,
  }));
  const last = rows[rows.length - 1];
  const nextCursor = rows.length === limit && last ? toSyncCursor(last) : null;
  return { orders, nextCursor };
}

export async function getOrder(
  storeId: string,
  orderCode: string,
): Promise<Order | null> {
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) return null;
  const row = await prisma.order.findUnique({
    where: { orderNumber },
    include: includeForDTO,
  });
  if (!row || row.storeId !== storeId || row.legacyCancelled) return null;
  return toOrderDTO(row);
}

export interface CreateOrderInput {
  idempotencyKey: string;
  offlineId?: string;
  customerName?: string;
  phone: string;
  dueDate: string;
  notes?: string;
  entries: { productId: string; quantity: number }[];
  initialPayment?: { amount: number; method: string };
  outletId?: string;
}

export async function createOrder(
  storeId: string,
  input: CreateOrderInput,
  actorId: string,
  explicitOutletId?: string,
): Promise<Order> {
  await assertStoreWritable(storeId);
  const data = createOrderSchema.parse(input);

  const existing = await findExistingOrder(storeId, data);
  if (existing) return existing;

  if (
    new Set(data.entries.map((e) => e.productId)).size !== data.entries.length
  ) {
    throw new Error("Combine repeated services into one line.");
  }

  const products = await prisma.product.findMany({
    where: {
      id: { in: data.entries.map((e) => e.productId) },
      storeId,
      active: true,
    },
    include: { slabs: { orderBy: { limit: "asc" } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = data.entries.map((entry) => {
    const product = byId.get(entry.productId);
    if (!product) throw new Error("A selected service is no longer available.");
    if (product.type === "ITEM" && !Number.isInteger(entry.quantity))
      throw new Error("Enter a whole number of pieces.");
    const amount = computeLineAmount(
      {
        type: product.type,
        price: product.price,
        extra: product.extra,
        slabs: product.slabs.map((s) => ({
          limit: Number(s.limit),
          price: s.price,
        })),
      },
      entry.quantity,
    );
    return {
      productId: product.id,
      name: product.name,
      quantity: entry.quantity,
      unit: product.type === "WEIGHT" ? "kg" : "pcs",
      amount,
    };
  });

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  if (data.initialPayment && data.initialPayment.amount > total)
    throw new Error("Payment must be between zero and the order total.");
  let initialPaymentMethodName: string | undefined;
  let initialPlatformPaymentMethodId: string | null = null;
  if (data.initialPayment) {
    const paymentCheck = await resolveActivePaymentMethod(
      storeId,
      data.initialPayment.method,
      { allowLegacy: !data.outletId && !explicitOutletId },
    );
    if (!paymentCheck.valid) {
      throw new Error(paymentCheck.error);
    }
    initialPaymentMethodName = paymentCheck.name;
    initialPlatformPaymentMethodId = paymentCheck.platformPaymentMethodId;
  }

  const today = parseCalendarDate(todayIST());

  let resolvedOutletId: string | null = explicitOutletId ?? data.outletId ?? null;
  if (resolvedOutletId) {
    const outlet = await prisma.outlet.findUnique({ where: { id: resolvedOutletId } });
    if (!outlet || outlet.storeId !== storeId || outlet.status !== "ACTIVE") {
      throw new Error("Invalid outlet.");
    }
  } else {
    const defaultOutlet = await prisma.outlet.findFirst({
      where: { storeId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    resolvedOutletId = defaultOutlet?.id ?? null;
  }

  let row: OrderRow;
  try {
    row = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          storeId,
          outletId: resolvedOutletId,
          idempotencyKey: data.idempotencyKey,
          offlineId: data.offlineId ?? null,
          customerName: data.customerName ?? "",
          phone: data.phone,
          orderDate: today,
          dueDate: parseCalendarDate(data.dueDate),
          status: "PENDING",
          notes: data.notes ?? "",
          lines: { create: lines },
          payments: data.initialPayment
            ? {
                create: [
                  {
                    amount: data.initialPayment.amount,
                    method: initialPaymentMethodName ?? data.initialPayment.method,
                    platformPaymentMethodId: initialPlatformPaymentMethodId,
                    paidAt: today,
                    storeId,
                    outletId: resolvedOutletId,
                  },
                ],
              }
            : undefined,
          statusEvents: {
            create: [
              {
                status: "PENDING",
                byUserId: actorId,
                storeId,
                outletId: resolvedOutletId,
              },
            ],
          },
        },
        include: includeForDTO,
      });

      if (resolvedOutletId) {
        await applyOrderCreationRollup(tx, {
          storeId,
          outletId: resolvedOutletId,
          orderDate: today,
          lines: lines.map((l) => ({ name: l.name, quantity: l.quantity, amount: l.amount })),
        });
        if (data.initialPayment && data.initialPayment.amount > 0) {
          await applyPaymentRollup(tx, {
            storeId,
            outletId: resolvedOutletId,
            paidAt: today,
            amount: data.initialPayment.amount,
          });
        }
      }

      return created;
    });
  } catch (err) {
    // A concurrent retry with the same idempotencyKey or offlineId passed the
    // lookup above too; its insert won, so return that order instead.
    if (isUniqueViolation(err)) {
      const winner = await findExistingOrder(storeId, data);
      if (winner) return winner;
    }
    throw err;
  }

  return toOrderDTO(row);
}

async function findExistingOrder(
  storeId: string,
  data: { idempotencyKey: string; offlineId?: string },
): Promise<Order | null> {
  const byKey = await prisma.order.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    include: includeForDTO,
  });
  if (byKey) {
    if (byKey.storeId !== storeId) throw new Error("Order not found.");
    return toOrderDTO(byKey);
  }
  if (!data.offlineId) return null;
  const byOfflineId = await prisma.order.findUnique({
    where: { storeId_offlineId: { storeId, offlineId: data.offlineId } },
    include: includeForDTO,
  });
  return byOfflineId ? toOrderDTO(byOfflineId) : null;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

export async function updateOrderStatus(
  storeId: string,
  orderCode: string,
  nextStatus: WorkStatus,
  actorId: string,
): Promise<Order> {
  await assertStoreWritable(storeId);
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) throw new Error("Order not found.");
  const dbStatus = STATUS_TO_DB[nextStatus];
  if (!dbStatus) throw new Error("Invalid status.");

  const row = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { orderNumber } });
    if (!current || current.legacyCancelled || current.storeId !== storeId)
      throw new Error("Order not found.");
    if (current.status !== dbStatus) {
      const previousCompletedAt = current.status === "DELIVERED" ? current.completedAt : null;
      const completedDate =
        dbStatus === "DELIVERED" ? parseCalendarDate(todayIST()) : null;
      await tx.order.update({
        where: { orderNumber },
        data: {
          status: dbStatus,
          completedAt: completedDate,
          statusEvents: {
            create: [
              {
                status: dbStatus,
                byUserId: actorId,
                storeId,
                outletId: current.outletId ?? null,
              },
            ],
          },
        },
      });

      if (dbStatus === "DELIVERED" && current.outletId && completedDate) {
        await applyOrderStatusCompletedRollup(tx, {
          storeId,
          outletId: current.outletId,
          completedAt: completedDate,
        });
      }
      if (current.status === "DELIVERED" && dbStatus !== "DELIVERED" && current.outletId && previousCompletedAt) {
        await applyOrderStatusCompletedRollup(tx, {
          storeId,
          outletId: current.outletId,
          completedAt: previousCompletedAt,
          delta: -1,
        });
      }
    }
    return tx.order.findUniqueOrThrow({
      where: { orderNumber },
      include: includeForDTO,
    });
  });

  return toOrderDTO(row);
}

const bulkCreateActionSchema = z.object({
  type: z.literal("create_order"),
  clientActionId: z.string().min(1),
  offlineCode: z.string().trim().min(1),
  payload: createOrderSchema,
});
const bulkStatusActionSchema = z.object({
  type: z.literal("update_status"),
  clientActionId: z.string().min(1),
  orderRef: z.string().trim().min(1),
  status: z.custom<WorkStatus>(
    (val) => typeof val === "string" && val.trim().length > 0,
    "Status is required",
  ),
});
const bulkPaymentActionSchema = z.object({
  type: z.literal("record_payment"),
  clientActionId: z.string().min(1),
  orderRef: z.string().trim().min(1),
  amount: z.number().int().positive("Payment must be a positive amount"),
  method: z.string().trim().min(1, "Payment method is required"),
});
const bulkSyncActionSchema = z.discriminatedUnion("type", [
  bulkCreateActionSchema,
  bulkStatusActionSchema,
  bulkPaymentActionSchema,
]);
export const bulkSyncRequestSchema = z.object({
  actions: z.array(bulkSyncActionSchema).min(1).max(200),
});

export type BulkSyncAction = z.infer<typeof bulkSyncActionSchema>;

export interface BulkSyncResult {
  clientActionId: string;
  type: BulkSyncAction["type"];
  status: "success" | "failed" | "skipped";
  order?: Order;
  error?: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error.";
}

/**
 * Replays a device's offline action queue in one request, in the order the
 * actions were queued. An update_status/record_payment action queued against
 * an order that was itself created offline (and hasn't synced before) carries
 * that order's offlineCode as orderRef — this resolves it against the
 * create_order results earlier in the SAME batch before applying the update,
 * so "create then update the same order while still offline" works in one
 * sync pass without a network round trip in between. An orderRef that is
 * neither a code from this batch nor an EL- code is looked up as the order's
 * offlineId, for orders whose create synced in an earlier request.
 *
 * authorizeOrderOutlet, when given, is asked before any update_status or
 * record_payment whether the caller may act on an order at that outlet
 * (employees: only outlets they are granted, as on the single-order routes).
 */
export async function bulkSyncOrders(
  storeId: string,
  actions: BulkSyncAction[],
  actorId: string,
  defaultOutletId?: string,
  authorizeOrderOutlet?: (outletId: string | null) => Promise<boolean>,
): Promise<BulkSyncResult[]> {
  await assertStoreWritable(storeId);
  const codeMap = new Map<string, string>(); // offlineCode -> confirmed order code, this batch only
  const failedOffline = new Set<string>(); // offlineCode whose create_order failed this batch
  const results: BulkSyncResult[] = [];

  for (const action of actions) {
    if (action.type === "create_order") {
      try {
        // The queued order carries the outlet it was actually taken at, which
        // may not be the one selected now that connectivity is back. Its own
        // outlet wins; defaultOutletId is only the fallback for a payload that
        // predates outlet awareness. createOrder still verifies the outlet
        // belongs to this organization and is active.
        const order = await createOrder(
          storeId,
          action.payload,
          actorId,
          action.payload.outletId ?? defaultOutletId,
        );
        codeMap.set(action.offlineCode, order.id);
        results.push({
          clientActionId: action.clientActionId,
          type: action.type,
          status: "success",
          order,
        });
      } catch (err) {
        failedOffline.add(action.offlineCode);
        results.push({
          clientActionId: action.clientActionId,
          type: action.type,
          status: "failed",
          error: errorMessage(err),
        });
      }
      continue;
    }

    let resolvedRef: string;
    if (codeMap.has(action.orderRef)) {
      resolvedRef = codeMap.get(action.orderRef)!;
    } else if (failedOffline.has(action.orderRef)) {
      results.push({
        clientActionId: action.clientActionId,
        type: action.type,
        status: "skipped",
        error: "Referenced order failed to create in this batch.",
      });
      continue;
    } else if (parseOrderCode(action.orderRef) !== null) {
      resolvedRef = action.orderRef;
    } else {
      // An order created offline and synced in an EARLIER request: the
      // device may still only know it by its offlineId.
      const offlineRow = await prisma.order.findUnique({
        where: { storeId_offlineId: { storeId, offlineId: action.orderRef } },
        select: { orderNumber: true },
      });
      if (!offlineRow) {
        results.push({
          clientActionId: action.clientActionId,
          type: action.type,
          status: "skipped",
          error: "Referenced order was not created yet.",
        });
        continue;
      }
      resolvedRef = toOrderCode(offlineRow.orderNumber);
    }

    try {
      if (authorizeOrderOutlet) {
        const target = await prisma.order.findFirst({
          where: { storeId, orderNumber: parseOrderCode(resolvedRef) ?? -1 },
          select: { outletId: true },
        });
        if (target && !(await authorizeOrderOutlet(target.outletId)))
          throw new Error("You don't have access to this order's outlet.");
      }
      if (action.type === "update_status") {
        const order = await updateOrderStatus(
          storeId,
          resolvedRef,
          action.status,
          actorId,
        );
        results.push({
          clientActionId: action.clientActionId,
          type: action.type,
          status: "success",
          order,
        });
      } else {
        const order = await recordPayment(
          storeId,
          resolvedRef,
          action.amount,
          action.method,
          action.clientActionId,
        );
        results.push({
          clientActionId: action.clientActionId,
          type: action.type,
          status: "success",
          order,
        });
      }
    } catch (err) {
      results.push({
        clientActionId: action.clientActionId,
        type: action.type,
        status: "failed",
        error: errorMessage(err),
      });
    }
  }

  return results;
}

export async function recordPayment(
  storeId: string,
  orderCode: string,
  amount: number,
  methodInput: string,
  clientActionId?: string,
): Promise<Order> {
  await assertStoreWritable(storeId);
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) throw new Error("Order not found.");
  if (!Number.isInteger(amount) || amount <= 0)
    throw new Error("Payment must be a positive amount.");
  const method = z.string().trim().min(1).max(40).parse(methodInput);

  const row = await prisma.$transaction(async (tx) => {
    // Lock the order row first so a concurrent payment can't read the same
    // stale balance and double-spend it; only after the lock do we read
    // lines/payments, guaranteeing the balance check sees committed state.
    const locked = await tx.$queryRaw<
      {
        id: string;
        storeId: string;
        outletId: string | null;
        legacyCancelled: boolean;
      }[]
    >`
      SELECT id, "storeId", "outletId", "legacyCancelled" FROM orders WHERE "orderNumber" = ${orderNumber} FOR UPDATE
    `;
    const order = locked[0];
    if (!order || order.legacyCancelled || order.storeId !== storeId)
      throw new Error("Order not found.");

    // Replay of an already-recorded payment. Checked after the lock so a
    // concurrent duplicate waits for the first and then sees its row.
    if (clientActionId) {
      const existing = await tx.payment.findUnique({
        where: { clientActionId },
        select: { orderId: true },
      });
      if (existing) {
        if (existing.orderId !== order.id)
          throw new Error("That payment was already recorded on another order.");
        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: includeForDTO,
        });
      }
    }

    const paymentCheck = await resolveActivePaymentMethod(storeId, method, {
      allowLegacy: !order.outletId,
    });
    if (!paymentCheck.valid) {
      throw new Error(paymentCheck.error);
    }

    const [lines, payments] = await Promise.all([
      tx.orderLine.findMany({ where: { orderId: order.id } }),
      tx.payment.findMany({ where: { orderId: order.id } }),
    ]);
    const total = lines.reduce((sum, line) => sum + line.amount, 0);
    const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (amount > total - paid)
      throw new Error("Payment must be no more than the outstanding balance.");

    const paymentDate = parseCalendarDate(todayIST());
    await tx.payment.create({
      data: {
        orderId: order.id,
        storeId,
        outletId: order.outletId ?? null,
        amount,
        method: paymentCheck.name,
        platformPaymentMethodId: paymentCheck.platformPaymentMethodId,
        paidAt: paymentDate,
        clientActionId: clientActionId ?? null,
      },
    });

    if (order.outletId) {
      await applyPaymentRollup(tx, {
        storeId,
        outletId: order.outletId,
        paidAt: paymentDate,
        amount,
      });
    }

    // Touch the order row itself so its `updatedAt` advances — a payment only
    // inserts a child row, and delta sync (listOrdersSince) filters on the
    // parent order's updatedAt, so without this a payment would be invisible
    // to other devices until some other field on the order changed too.
    await tx.order.update({
      where: { orderNumber },
      data: { updatedAt: new Date() },
    });
    return tx.order.findUniqueOrThrow({
      where: { orderNumber },
      include: includeForDTO,
    });
  });

  return toOrderDTO(row);
}
