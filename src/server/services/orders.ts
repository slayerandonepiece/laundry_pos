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
import { Prisma } from "@/generated/prisma/client";
import { isCashOnDeliveryCode, resolveActivePaymentMethod } from "@/server/services/platform-payment-methods";
import { assertStoreWritable } from "@/server/auth/session";
import { ValidationError } from "@/server/errors";
import { allocateOrderNumber, allocateReceiptNumber } from "@/server/numbering";
import { publicErrorMessage } from "@/server/api/public-errors";
import {
  applyOrderCreationRollup,
  applyPaymentRollup,
  applyOrderStatusCompletedRollup,
} from "@/server/services/dashboard-rollups";

const ORDER_CODE_PREFIX = "EL-";
// Orders issued before per-organization numbering keep their `EL-<n>` code
// (n < 1e9). Newer orders are a plain 10-digit number (>= 1,000,000,001).
const FIRST_PLAIN_ORDER_NUMBER = 1_000_000_000;

export function toOrderCode(orderNumber: number | bigint) {
  return Number(orderNumber) < FIRST_PLAIN_ORDER_NUMBER
    ? `${ORDER_CODE_PREFIX}${orderNumber}`
    : String(orderNumber);
}

export function parseOrderCode(code: string): number | null {
  const value = code.trim();
  const legacy = /^EL-(\d{1,9})$/.exec(value);
  if (legacy) return Number(legacy[1]);
  return /^[1-9]\d{9}$/.test(value) ? Number(value) : null;
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

const correctionReasonSchema = z.string().trim().min(3, "Reason must be at least 3 characters.").max(500);
const customerCorrectionSchema = z.object({
  type: z.literal("customer"),
  customerName: z.string().trim().max(100),
  phone: z.string().regex(/^\+?[0-9]{8,15}$/),
  reason: correctionReasonSchema,
});
const paymentCorrectionSchema = z.object({
  type: z.literal("payment"),
  paymentId: z.string().min(1),
  amount: z.number().int().nonnegative(),
  reason: correctionReasonSchema,
});
export const deliveredOrderCorrectionSchema = z.discriminatedUnion("type", [
  customerCorrectionSchema,
  paymentCorrectionSchema,
]);
export type DeliveredOrderCorrectionInput = z.infer<typeof deliveredOrderCorrectionSchema>;

export interface DeliveredOrderCorrectionView {
  orderCode: string;
  customerName: string;
  phone: string;
  total: number;
  payments: { id: string; amount: number; method: string; paidAt: string; receiptNumber: string | null }[];
  outletName: string;
  orderDate: string;
  deliveredOn: string | null;
  isImported: boolean;
  invoiceNumber: string | null;
  lines: { name: string; quantity: number; unit: string; amount: number }[];
  history: { status: string; at: string; by: string }[];
}

export interface DeliveredOrderSearchFilters { orderNumber?: string; phone?: string; from?: string; to?: string; outletId?: string }
export interface DeliveredOrderSearchRow {
  orderCode: string; orderDate: string; outletName: string; customerName: string; phone: string;
  total: number; paid: number; methods: string[]; itemCount: number; isImported: boolean;
}

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
    imported: row.isImported || undefined,
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
      receiptNumber: payment.receiptNumber ?? undefined,
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
  return toOrderListDTOs(rows);
}

/** Map list rows to DTOs, resolving status-event actor names in one query. */
async function toOrderListDTOs(rows: OrderListRow[]): Promise<Order[]> {
  const actorIds = [...new Set(rows.flatMap(row => row.statusEvents.flatMap(event => event.byUserId ? [event.byUserId] : [])))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const actorNames = new Map(actors.map(actor => [actor.id, actor.name]));
  return rows.map(row => toOrderDTO(row, actorNames));
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { parseCalendarDate(value); return true; } catch { return false; }
}, "Invalid date");
const searchOrdersSchema = z.object({
  outletId: z.string().min(1).optional(),
  from: isoDate,
  to: isoDate,
  q: z.string().trim().max(100).optional(),
  work: z.enum(["Pending", "In Progress", "Ready", "Delivered"]).optional(),
  pay: z.enum(["Unpaid", "Part-paid", "Paid"]).optional(),
  due: z.enum(["today", "late", "attention"]).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]).default(25),
}).refine(value => value.from <= value.to, { message: "The start date must be on or before the end date." });

export type SearchOrdersInput = z.input<typeof searchOrdersSchema>;

export interface SearchOrdersResult {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
  /** Whether the scope (store, or the outlet) has any order at all, ignoring every filter. */
  hasOrders: boolean;
}

/**
 * One page of the Sales register, filtered in the database. Mirrors the
 * register's former in-browser rules: the period applies to the order date,
 * except Due today / Late / attention, which look at open (not delivered)
 * orders by due date regardless of the period; search matches the
 * "name phone code" text; payment status compares line and payment totals.
 * Cancelled orders are excluded; imported orders are included.
 */
export async function searchOrders(storeId: string, input: SearchOrdersInput): Promise<SearchOrdersResult> {
  const filters = searchOrdersSchema.parse(input);
  const today = todayIST();
  const conditions: Prisma.Sql[] = [
    Prisma.sql`o."storeId" = ${storeId}`,
    Prisma.sql`o."legacyCancelled" = false`,
  ];
  if (filters.outletId) conditions.push(Prisma.sql`o."outletId" = ${filters.outletId}`);
  const scope = Prisma.join(conditions, " AND ");
  if (filters.due) {
    conditions.push(Prisma.sql`o.status NOT IN ('DELIVERED', 'COMPLETED')`);
    if (filters.due === "today") conditions.push(Prisma.sql`o."dueDate" = ${today}::date`);
    else if (filters.due === "late") conditions.push(Prisma.sql`o."dueDate" < ${today}::date`);
    else conditions.push(Prisma.sql`o."dueDate" <= ${today}::date`);
  } else {
    conditions.push(Prisma.sql`o."orderDate" BETWEEN ${filters.from}::date AND ${filters.to}::date`);
  }
  if (filters.q) {
    const code = Prisma.sql`CASE WHEN o."orderNumber" < ${FIRST_PLAIN_ORDER_NUMBER}::bigint THEN ${ORDER_CODE_PREFIX}::text || o."orderNumber"::text ELSE o."orderNumber"::text END`;
    conditions.push(Prisma.sql`strpos(lower(o."customerName" || ' ' || o.phone || ' ' || ${code}), ${filters.q.toLowerCase()}::text) > 0`);
  }
  if (filters.work) {
    conditions.push(filters.work === "Delivered"
      ? Prisma.sql`o.status IN ('DELIVERED', 'COMPLETED')`
      : Prisma.sql`o.status = ${STATUS_TO_DB[filters.work]}::"WorkStatus"`);
  }
  const lineTotal = Prisma.sql`COALESCE((SELECT SUM(l.amount) FROM order_lines l WHERE l."orderId" = o.id), 0)`;
  const paidTotal = Prisma.sql`COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p."orderId" = o.id), 0)`;
  if (filters.pay === "Paid") conditions.push(Prisma.sql`${lineTotal} = ${paidTotal}`);
  else if (filters.pay === "Part-paid") conditions.push(Prisma.sql`${lineTotal} <> ${paidTotal} AND ${paidTotal} <> 0`);
  else if (filters.pay === "Unpaid") conditions.push(Prisma.sql`${lineTotal} <> ${paidTotal} AND ${paidTotal} = 0`);
  const where = Prisma.join(conditions, " AND ");

  const [[{ count }], [anyOrder]] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM orders o WHERE ${where}`,
    prisma.$queryRaw<{ id: string }[]>`SELECT o.id FROM orders o WHERE ${scope} LIMIT 1`,
  ]);
  const total = Number(count);
  const pageSize = filters.pageSize;
  const page = Math.min(filters.page, Math.max(Math.ceil(total / pageSize), 1));
  if (!total) return { orders: [], total, page, pageSize, hasOrders: Boolean(anyOrder) };
  const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT o.id FROM orders o WHERE ${where}
    ORDER BY o."orderDate" DESC, o."orderNumber" DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  const rows = await prisma.order.findMany({
    where: { storeId, id: { in: ids.map(row => row.id) } },
    include: includeForList,
    orderBy: [{ orderDate: "desc" }, { orderNumber: "desc" }],
  });
  return { orders: await toOrderListDTOs(rows), total, page, pageSize, hasOrders: true };
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

function toSyncCursor(row: { updatedAt: Date; orderNumber: number | bigint }): string {
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
      // History entered by Super Admin never reaches devices: it is old, and bulky.
      isImported: false,
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
    where: { storeId_orderNumber: { storeId, orderNumber } },
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

  // An explicit outlet (always set for employees) must match the outlet of an
  // order found by key, so one outlet can't replay another's key to read it.
  const requestedOutletId = explicitOutletId ?? data.outletId;
  const existing = await findExistingOrder(storeId, data, requestedOutletId);
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
  // Cash on delivery is a promise to pay at handover, so it records no payment.
  let initialPayment = data.initialPayment;
  if (initialPayment) {
    const paymentCheck = await resolveActivePaymentMethod(
      storeId,
      initialPayment.method,
      { phase: "PRE_ORDER", allowCashOnDelivery: true },
    );
    if (!paymentCheck.valid) {
      throw new ValidationError(paymentCheck.error);
    }
    if (isCashOnDeliveryCode(paymentCheck.code)) {
      if (initialPayment.amount > 0) {
        throw new ValidationError("Cash on delivery can't be recorded as a payment. Leave the amount at zero and collect it on delivery.");
      }
      initialPayment = undefined;
    } else {
      initialPaymentMethodName = paymentCheck.name;
      initialPlatformPaymentMethodId = paymentCheck.platformPaymentMethodId;
    }
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
      const orderNumber = await allocateOrderNumber(tx, storeId);
      const receiptNumber = initialPayment && initialPayment.amount > 0
        ? await allocateReceiptNumber(tx, storeId, todayIST())
        : null;
      const created = await tx.order.create({
        data: {
          storeId,
          orderNumber,
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
          payments: initialPayment
            ? {
                create: [
                  {
                    amount: initialPayment.amount,
                    method: initialPaymentMethodName ?? initialPayment.method,
                    platformPaymentMethodId: initialPlatformPaymentMethodId,
                    paidAt: today,
                    receiptNumber,
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
        if (initialPayment && initialPayment.amount > 0) {
          await applyPaymentRollup(tx, {
            storeId,
            outletId: resolvedOutletId,
            paidAt: today,
            amount: initialPayment.amount,
          });
        }
      }

      return created;
    });
  } catch (err) {
    // A concurrent retry with the same idempotencyKey or offlineId passed the
    // lookup above too; its insert won, so return that order instead.
    if (isUniqueViolation(err)) {
      const winner = await findExistingOrder(storeId, data, requestedOutletId);
      if (winner) return winner;
    }
    throw err;
  }

  return toOrderDTO(row);
}

async function findExistingOrder(
  storeId: string,
  data: { idempotencyKey: string; offlineId?: string },
  requestedOutletId?: string,
): Promise<Order | null> {
  const byKey = await prisma.order.findUnique({
    where: { storeId_idempotencyKey: { storeId, idempotencyKey: data.idempotencyKey } },
    include: includeForDTO,
  });
  if (byKey) {
    if (requestedOutletId && byKey.outletId !== requestedOutletId)
      throw new Error("Order not found.");
    return toOrderDTO(byKey);
  }
  if (!data.offlineId) return null;
  const byOfflineId = await prisma.order.findUnique({
    where: { storeId_offlineId: { storeId, offlineId: data.offlineId } },
    include: includeForDTO,
  });
  if (byOfflineId && requestedOutletId && byOfflineId.outletId !== requestedOutletId)
    throw new Error("Order not found.");
  return byOfflineId ? toOrderDTO(byOfflineId) : null;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

// Orders only move forward. Skipping ahead (Pending straight to Ready) is allowed;
// Delivered is the last status and can never be left.
const STATUS_RANK = { PENDING: 0, IN_PROGRESS: 1, READY: 2, DELIVERED: 3 } as const;

const inr = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100);

async function orderBalance(tx: Prisma.TransactionClient, orderId: string): Promise<{ total: number; paid: number }> {
  const [lines, payments] = await Promise.all([
    tx.orderLine.findMany({ where: { orderId }, select: { amount: true } }),
    tx.payment.findMany({ where: { orderId }, select: { amount: true } }),
  ]);
  return {
    total: lines.reduce((sum, line) => sum + line.amount, 0),
    paid: payments.reduce((sum, payment) => sum + payment.amount, 0),
  };
}

/** Marks a locked, fully paid order delivered: status, history event, delivery date and daily rollup. */
async function markDelivered(
  tx: Prisma.TransactionClient,
  storeId: string,
  order: { id: string; outletId: string | null },
  actorId: string,
): Promise<void> {
  const completedDate = parseCalendarDate(todayIST());
  await tx.order.update({
    where: { id: order.id },
    data: {
      status: "DELIVERED",
      completedAt: completedDate,
      statusEvents: { create: [{ status: "DELIVERED", byUserId: actorId, storeId, outletId: order.outletId }] },
    },
  });
  if (order.outletId) {
    await applyOrderStatusCompletedRollup(tx, { storeId, outletId: order.outletId, completedAt: completedDate });
  }
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
    // Serialize concurrent transitions on the same order (as recordPayment
    // does) so a second identical request sees the committed status and
    // cannot re-apply the completed rollup.
    await tx.$queryRaw`SELECT id FROM orders WHERE "storeId" = ${storeId} AND "orderNumber" = ${orderNumber} FOR UPDATE`;
    const current = await tx.order.findUnique({ where: { storeId_orderNumber: { storeId, orderNumber } } });
    if (!current || current.legacyCancelled || current.storeId !== storeId)
      throw new Error("Order not found.");
    if (current.status !== dbStatus) {
      if (current.status === "DELIVERED")
        throw new ValidationError("Delivered orders are final and can't change status.");
      if (STATUS_RANK[dbStatus] < STATUS_RANK[current.status])
        throw new ValidationError("An order can only move forward: Pending, In Progress, Ready, then Delivered.");

      if (dbStatus === "DELIVERED") {
        // Delivery needs the order paid in full; the check is made under the
        // row lock so a concurrent payment cannot slip past it.
        const { total, paid } = await orderBalance(tx, current.id);
        if (paid < total)
          throw new ValidationError(`Collect the balance of ${inr(total - paid)} before marking this order delivered.`);
        await markDelivered(tx, storeId, current, actorId);
      } else {
        await tx.order.update({
          where: { id: current.id },
          data: {
            status: dbStatus,
            statusEvents: { create: [{ status: dbStatus, byUserId: actorId, storeId, outletId: current.outletId ?? null }] },
          },
        });
      }
    }
    return tx.order.findUniqueOrThrow({
      where: { storeId_orderNumber: { storeId, orderNumber } },
      include: includeForDTO,
    });
  });

  return toOrderDTO(row);
}

export interface DeliverWithPaymentInput {
  /** Paise. Must equal the outstanding balance when one is due; omitted means "the balance". */
  amount?: number;
  /** Required when a balance is due. Must be a method that appears after the order is placed. */
  method?: string;
  /** Makes a retry of the same delivery a no-op instead of a second payment. */
  clientActionId?: string;
}

/**
 * Collects the outstanding balance (when there is one) and marks the order
 * delivered in one transaction: if the payment fails the order is not
 * delivered, and if delivery fails no payment is kept.
 */
export async function deliverOrderWithPayment(
  storeId: string,
  orderCode: string,
  input: DeliverWithPaymentInput,
  actorId: string,
): Promise<Order> {
  await assertStoreWritable(storeId);
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) throw new Error("Order not found.");
  const method = input.method === undefined ? undefined : z.string().trim().min(1).max(40).parse(input.method);
  if (input.amount !== undefined && (!Number.isInteger(input.amount) || input.amount <= 0))
    throw new Error("Payment must be a positive amount.");

  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE "storeId" = ${storeId} AND "orderNumber" = ${orderNumber} FOR UPDATE`;
    const current = await tx.order.findUnique({
      where: { storeId_orderNumber: { storeId, orderNumber } },
      include: { payments: { select: { clientActionId: true } } },
    });
    if (!current || current.legacyCancelled || current.storeId !== storeId)
      throw new Error("Order not found.");

    const reload = () => tx.order.findUniqueOrThrow({ where: { id: current.id }, include: includeForDTO });
    if (current.status === "DELIVERED") {
      // A retry of the delivery that already succeeded returns the order; anything else is final.
      const replay = !input.clientActionId && input.amount === undefined && method === undefined
        || (input.clientActionId && current.payments.some(payment => payment.clientActionId === input.clientActionId));
      if (replay) return reload();
      throw new ValidationError("Delivered orders are final and can't change status.");
    }

    const { total, paid } = await orderBalance(tx, current.id);
    const balance = total - paid;
    if (balance > 0) {
      if (!method) throw new ValidationError("Choose how the balance was paid.");
      const amount = input.amount ?? balance;
      if (amount !== balance)
        throw new ValidationError(`Collect the full balance of ${inr(balance)} to deliver this order.`);
      const paymentCheck = await resolveActivePaymentMethod(storeId, method, { phase: "POST_ORDER" });
      if (!paymentCheck.valid) throw new ValidationError(paymentCheck.error);

      const paymentDate = parseCalendarDate(todayIST());
      await tx.payment.create({
        data: {
          orderId: current.id,
          storeId,
          outletId: current.outletId ?? null,
          amount,
          method: paymentCheck.name,
          platformPaymentMethodId: paymentCheck.platformPaymentMethodId,
          paidAt: paymentDate,
          receiptNumber: await allocateReceiptNumber(tx, storeId, todayIST()),
          clientActionId: input.clientActionId ?? null,
        },
      });
      if (current.outletId) {
        await applyPaymentRollup(tx, { storeId, outletId: current.outletId, paidAt: paymentDate, amount });
      }
    }
    await markDelivered(tx, storeId, current, actorId);
    return reload();
  });

  return toOrderDTO(row);
}

export async function cancelOrder(
  storeId: string,
  orderCode: string,
  actorId: string,
  reasonInput: string,
): Promise<void> {
  await assertStoreWritable(storeId);
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) throw new Error("Order not found.");
  const reason = correctionReasonSchema.parse(reasonInput);

  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM orders WHERE "storeId" = ${storeId} AND "orderNumber" = ${orderNumber} FOR UPDATE`;
    const current = await tx.order.findUnique({
      where: { storeId_orderNumber: { storeId, orderNumber } },
      include: { lines: true, payments: true },
    });
    if (!current || current.storeId !== storeId || current.legacyCancelled) throw new Error("Order not found.");
    if (current.status === "DELIVERED") {
      throw new ValidationError("Delivered orders are final and cannot be cancelled.");
    }

    await tx.order.update({
      where: { id: current.id },
      data: { legacyCancelled: true, updatedAt: new Date() },
    });

    if (current.outletId) {
      await applyOrderCreationRollup(tx, {
        storeId,
        outletId: current.outletId,
        orderDate: current.orderDate,
        lines: current.lines.map(line => ({
          name: line.name,
          quantity: Number(line.quantity),
          amount: line.amount,
        })),
        delta: -1,
      });
      for (const payment of current.payments) {
        await applyPaymentRollup(tx, {
          storeId,
          outletId: current.outletId,
          paidAt: payment.paidAt,
          amount: payment.amount,
          delta: -1,
        });
      }
    }

    await tx.auditLog.create({
      data: {
        storeId,
        outletId: current.outletId,
        actorId,
        action: "CANCEL_ORDER",
        entityType: "Order",
        entityId: orderCode,
        beforeJson: { legacyCancelled: false, status: current.status },
        afterJson: { legacyCancelled: true, status: current.status, reason },
      },
    });
  });
}

export async function getDeliveredOrderForCorrection(
  storeId: string,
  orderCode: string,
): Promise<DeliveredOrderCorrectionView | null> {
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) return null;
  const order = await prisma.order.findFirst({
    where: { storeId, orderNumber, legacyCancelled: false, status: "DELIVERED" },
    include: {
      lines: true,
      payments: { orderBy: { paidAt: "asc" } },
      outlet: { select: { displayName: true } },
      invoice: { select: { invoiceNumber: true } },
      statusEvents: { orderBy: { at: "asc" }, include: { byUser: { select: { name: true } } } },
    },
  });
  if (!order) return null;
  return {
    orderCode,
    customerName: order.customerName,
    phone: order.phone,
    total: order.lines.reduce((sum, line) => sum + line.amount, 0),
    payments: order.payments.map(payment => ({
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      paidAt: formatCalendarDate(payment.paidAt),
      receiptNumber: payment.receiptNumber ?? null,
    })),
    outletName: order.outlet?.displayName ?? "Unassigned",
    orderDate: formatCalendarDate(order.orderDate),
    deliveredOn: order.completedAt ? formatCalendarDate(order.completedAt) : null,
    isImported: order.isImported,
    invoiceNumber: order.invoice?.invoiceNumber ?? null,
    lines: order.lines.map(line => ({ name: line.name, quantity: Number(line.quantity), unit: line.unit, amount: line.amount })),
    history: order.statusEvents.map(event => ({ status: event.status, at: event.at.toISOString(), by: event.byUser?.name ?? "System" })),
  };
}

/** Delivered orders of one organization, newest first, one page at a time, for the corrections search. */
export async function searchDeliveredOrders(
  storeId: string,
  filters: DeliveredOrderSearchFilters,
  paging: { page?: number; pageSize?: number } = {},
): Promise<{ rows: DeliveredOrderSearchRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = Math.min(Math.max(Math.floor(paging.pageSize ?? 10), 5), 50);
  const where: Prisma.OrderWhereInput = { storeId, legacyCancelled: false, status: "DELIVERED" };
  const code = filters.orderNumber?.trim();
  if (code) {
    const number = parseOrderCode(code);
    if (number === null) return { rows: [], total: 0, page: 1, pageSize };
    where.orderNumber = number;
  }
  const digits = (filters.phone ?? "").replace(/\D/g, "");
  if (digits) where.phone = { contains: digits };
  if (filters.outletId) where.outletId = filters.outletId;
  const range: { gte?: Date; lte?: Date } = {};
  if (filters.from) range.gte = parseCalendarDate(filters.from);
  if (filters.to) range.lte = parseCalendarDate(filters.to);
  if (range.gte || range.lte) where.orderDate = range;
  const total = await prisma.order.count({ where });
  const page = Math.min(Math.max(Math.floor(paging.page ?? 1), 1), Math.max(Math.ceil(total / pageSize), 1));
  const found = await prisma.order.findMany({
    where,
    orderBy: [{ orderDate: "desc" }, { orderNumber: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { lines: { select: { amount: true } }, payments: { select: { amount: true, method: true } }, outlet: { select: { displayName: true } } },
  });
  const rows = found.map(row => ({
    orderCode: toOrderCode(row.orderNumber),
    orderDate: formatCalendarDate(row.orderDate),
    outletName: row.outlet?.displayName ?? "Unassigned",
    customerName: row.customerName,
    phone: row.phone,
    total: row.lines.reduce((sum, line) => sum + line.amount, 0),
    paid: row.payments.reduce((sum, payment) => sum + payment.amount, 0),
    methods: [...new Set(row.payments.map(payment => payment.method))],
    itemCount: row.lines.length,
    isImported: row.isImported,
  }));
  return { rows, total, page, pageSize };
}

export async function correctDeliveredOrder(
  storeId: string,
  orderCode: string,
  actorId: string,
  input: DeliveredOrderCorrectionInput,
): Promise<DeliveredOrderCorrectionView> {
  const data = deliveredOrderCorrectionSchema.parse(input);
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) throw new Error("Order not found.");

  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM orders WHERE "storeId" = ${storeId} AND "orderNumber" = ${orderNumber} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { storeId_orderNumber: { storeId, orderNumber } },
      include: { lines: true, payments: true },
    });
    if (!order || order.storeId !== storeId || order.legacyCancelled) throw new Error("Order not found.");
    if (order.status !== "DELIVERED") {
      throw new ValidationError("Corrections are only available after delivery.");
    }

    if (data.type === "customer") {
      if (data.customerName === order.customerName && data.phone === order.phone) {
        throw new ValidationError("Enter a different customer name or phone number.");
      }
      await tx.order.update({
        where: { id: order.id },
        data: { customerName: data.customerName, phone: data.phone, updatedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          storeId,
          outletId: order.outletId,
          actorId,
          action: "CORRECT_ORDER_CUSTOMER",
          entityType: "Order",
          entityId: orderCode,
          beforeJson: { customerName: order.customerName, phone: order.phone },
          afterJson: { customerName: data.customerName, phone: data.phone, reason: data.reason },
        },
      });
      return;
    }

    const payment = order.payments.find(row => row.id === data.paymentId);
    if (!payment) throw new ValidationError("Payment not found.");
    if (payment.amount === data.amount) throw new ValidationError("Enter a different payment amount.");
    const total = order.lines.reduce((sum, line) => sum + line.amount, 0);
    const otherPayments = order.payments.reduce((sum, row) => sum + (row.id === payment.id ? 0 : row.amount), 0);
    if (data.amount > total - otherPayments) {
      throw new ValidationError("Corrected payment cannot exceed the order total.");
    }
    await tx.payment.update({ where: { id: payment.id }, data: { amount: data.amount } });
    await tx.order.update({ where: { id: order.id }, data: { updatedAt: new Date() } });
    if (order.outletId) {
      const difference = data.amount - payment.amount;
      await applyPaymentRollup(tx, {
        storeId,
        outletId: order.outletId,
        paidAt: payment.paidAt,
        amount: Math.abs(difference),
        delta: difference > 0 ? 1 : -1,
      });
    }
    await tx.auditLog.create({
      data: {
        storeId,
        outletId: order.outletId,
        actorId,
        action: data.amount === 0 ? "VOID_ORDER_PAYMENT" : "ADJUST_ORDER_PAYMENT",
        entityType: "Payment",
        entityId: payment.id,
        beforeJson: { orderCode, amount: payment.amount, method: payment.method },
        afterJson: { orderCode, amount: data.amount, method: payment.method, reason: data.reason },
      },
    });
  });

  const corrected = await getDeliveredOrderForCorrection(storeId, orderCode);
  if (!corrected) throw new Error("Order not found.");
  return corrected;
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

// Same whitelist as the single-order routes: raw Prisma/driver messages must
// never reach the client, only the server log.
function errorMessage(err: unknown): string {
  const message = publicErrorMessage(err);
  if (message !== null) return message;
  console.error("Bulk sync action error:", err);
  return "Unexpected error.";
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
      SELECT id, "storeId", "outletId", "legacyCancelled" FROM orders WHERE "storeId" = ${storeId} AND "orderNumber" = ${orderNumber} FOR UPDATE
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

    const paymentCheck = await resolveActivePaymentMethod(storeId, method, { phase: "POST_ORDER" });
    if (!paymentCheck.valid) {
      throw new ValidationError(paymentCheck.error);
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
        receiptNumber: await allocateReceiptNumber(tx, storeId, todayIST()),
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
      where: { storeId_orderNumber: { storeId, orderNumber } },
      data: { updatedAt: new Date() },
    });
    return tx.order.findUniqueOrThrow({
      where: { storeId_orderNumber: { storeId, orderNumber } },
      include: includeForDTO,
    });
  });

  return toOrderDTO(row);
}
