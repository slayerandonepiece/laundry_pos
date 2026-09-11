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
  customerName: z.string().trim().default(""),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().default(""),
  entries: z.array(entrySchema).min(1),
  initialPayment: z
    .object({
      amount: z.number().int().nonnegative(),
      method: z.string().trim().min(1).max(40),
    })
    .optional(),
});

const includeForDTO = {
  lines: true,
  payments: { orderBy: { paidAt: "asc" } },
  statusEvents: { orderBy: { at: "asc" }, include: { byUser: true } },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof includeForDTO }>;

function toOrderDTO(row: OrderRow): Order {
  return {
    id: toOrderCode(row.orderNumber),
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
    })),
    notes: row.notes,
    history: row.statusEvents.map((event) => ({
      status: STATUS_FROM_DB[event.status],
      at: event.at.toISOString(),
      by: event.byUser?.name ?? "System",
    })),
  };
}

export interface ListOrdersOptions {
  limit?: number;
  sort?: "recent" | "default";
}

export async function listOrders(
  storeId: string,
  options?: ListOrdersOptions,
): Promise<Order[]> {
  const rows = await prisma.order.findMany({
    where: { storeId, legacyCancelled: false },
    include: includeForDTO,
    orderBy: { orderNumber: "desc" },
    ...(options?.limit ? { take: options.limit } : {}),
  });
  return rows.map(toOrderDTO);
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
): Promise<{
  orders: (Order & { deleted: boolean })[];
  nextCursor: string | null;
}> {
  const rows = await prisma.order.findMany({
    where: {
      storeId,
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
  customerName?: string;
  phone: string;
  dueDate: string;
  notes?: string;
  entries: { productId: string; quantity: number }[];
  initialPayment?: { amount: number; method: string };
}

export async function createOrder(
  storeId: string,
  input: CreateOrderInput,
  actorId: string,
): Promise<Order> {
  const data = createOrderSchema.parse(input);

  const existing = await prisma.order.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    include: includeForDTO,
  });
  if (existing) {
    if (existing.storeId !== storeId) throw new Error("Order not found.");
    return toOrderDTO(existing);
  }

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
  if (data.initialPayment) {
    const method = await prisma.storePaymentMethod.findFirst({
      where: { storeId, name: data.initialPayment.method, active: true },
    });
    if (!method) throw new Error("That payment method is no longer available.");
  }

  const today = parseCalendarDate(todayIST());

  const row = await prisma.order.create({
    data: {
      storeId,
      idempotencyKey: data.idempotencyKey,
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
                method: data.initialPayment.method,
                paidAt: today,
              },
            ],
          }
        : undefined,
      statusEvents: { create: [{ status: "PENDING", byUserId: actorId }] },
    },
    include: includeForDTO,
  });

  return toOrderDTO(row);
}

export async function updateOrderStatus(
  storeId: string,
  orderCode: string,
  nextStatus: WorkStatus,
  actorId: string,
): Promise<Order> {
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) throw new Error("Order not found.");
  const dbStatus = STATUS_TO_DB[nextStatus];
  if (!dbStatus) throw new Error("Invalid status.");

  const row = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { orderNumber } });
    if (!current || current.legacyCancelled || current.storeId !== storeId)
      throw new Error("Order not found.");
    if (current.status !== dbStatus) {
      await tx.order.update({
        where: { orderNumber },
        data: {
          status: dbStatus,
          completedAt:
            dbStatus === "DELIVERED" ? parseCalendarDate(todayIST()) : null,
          statusEvents: { create: [{ status: dbStatus, byUserId: actorId }] },
        },
      });
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
  offlineCode: z.string().min(1),
  payload: createOrderSchema,
});
const bulkStatusActionSchema = z.object({
  type: z.literal("update_status"),
  clientActionId: z.string().min(1),
  orderRef: z.string().min(1),
  status: z.custom<WorkStatus>(
    (val) => typeof val === "string" && val.trim().length > 0,
    "Status is required",
  ),
});
const bulkPaymentActionSchema = z.object({
  type: z.literal("record_payment"),
  clientActionId: z.string().min(1),
  orderRef: z.string().min(1),
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
 * sync pass without a network round trip in between.
 */
export async function bulkSyncOrders(
  storeId: string,
  actions: BulkSyncAction[],
  actorId: string,
): Promise<BulkSyncResult[]> {
  const codeMap = new Map<string, string>(); // offlineCode -> confirmed order code, this batch only
  const failedOffline = new Set<string>(); // offlineCode whose create_order failed this batch
  const results: BulkSyncResult[] = [];

  for (const action of actions) {
    if (action.type === "create_order") {
      try {
        const order = await createOrder(storeId, action.payload, actorId);
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
      results.push({
        clientActionId: action.clientActionId,
        type: action.type,
        status: "skipped",
        error: "Referenced order was not created yet.",
      });
      continue;
    }

    try {
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
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) throw new Error("Order not found.");
  if (!Number.isInteger(amount) || amount <= 0)
    throw new Error("Payment must be a positive amount.");
  const method = z.string().trim().min(1).max(40).parse(methodInput);

  const row = await prisma.$transaction(async (tx) => {
    if (clientActionId) {
      const existing = await tx.payment.findUnique({
        where: { clientActionId },
      });
      if (existing) {
        return tx.order.findUniqueOrThrow({
          where: { orderNumber },
          include: includeForDTO,
        });
      }
    }

    // Lock the order row first so a concurrent payment can't read the same
    // stale balance and double-spend it; only after the lock do we read
    // lines/payments, guaranteeing the balance check sees committed state.
    const locked = await tx.$queryRaw<
      { id: string; storeId: string; legacyCancelled: boolean }[]
    >`
      SELECT id, "storeId", "legacyCancelled" FROM orders WHERE "orderNumber" = ${orderNumber} FOR UPDATE
    `;
    const order = locked[0];
    if (!order || order.legacyCancelled || order.storeId !== storeId)
      throw new Error("Order not found.");

    const availableMethod = await tx.storePaymentMethod.findFirst({
      where: { storeId, name: method, active: true },
    });
    if (!availableMethod)
      throw new Error("That payment method is no longer available.");

    const [lines, payments] = await Promise.all([
      tx.orderLine.findMany({ where: { orderId: order.id } }),
      tx.payment.findMany({ where: { orderId: order.id } }),
    ]);
    const total = lines.reduce((sum, line) => sum + line.amount, 0);
    const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (amount > total - paid)
      throw new Error("Payment must be no more than the outstanding balance.");

    await tx.payment.create({
      data: {
        orderId: order.id,
        amount,
        method,
        paidAt: parseCalendarDate(todayIST()),
        clientActionId: clientActionId ?? null,
      },
    });
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
