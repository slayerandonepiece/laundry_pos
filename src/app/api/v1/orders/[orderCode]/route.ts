import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { getOrder, parseOrderCode } from "@/server/services/orders";
import {
  handleApiRoute,
  jsonResponse,
  requireApiStoreSession,
} from "@/server/api/handler";
import { requireOutletSession, AuthError } from "@/server/auth/session";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderCode: string }> },
) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, undefined, { allowRestricted: true });
    const { orderCode } = await params;

    const order = await getOrder(session.storeId, orderCode);
    if (!order) {
      return jsonResponse({ error: "Order not found." }, 404);
    }

    if (session.storeRole === "EMPLOYEE") {
      // Legacy pre-outlet orders cannot be safely attributed to an employee.
      if (!order.outletId) throw new AuthError("FORBIDDEN");
      await requireOutletSession(session.storeId, order.outletId, 'EMPLOYEE', session, { allowRestricted: true });
    }

    const orderNumber = parseOrderCode(orderCode);
    const existingInvoice =
      orderNumber !== null
        ? await prisma.orderInvoice.findFirst({
            where: { storeId: session.storeId, order: { orderNumber } },
            select: { invoiceSeq: true, invoiceNumber: true, accessToken: true, generatedAt: true },
          })
        : null;

    const total = order.lines.reduce((s, l) => s + l.amount, 0);
    const paid = order.payments.reduce((s, p) => s + p.amount, 0);
    const isDeliveredOrCompleted = order.status === "Delivered";
    const canGenerate = paid >= total && isDeliveredOrCompleted && !order.imported;

    return jsonResponse({
      ...order,
      invoice: {
        exists: Boolean(existingInvoice),
        invoiceSeq: existingInvoice?.invoiceSeq,
        invoiceNumber: existingInvoice?.invoiceNumber,
        accessToken: existingInvoice?.accessToken,
        generatedAt: existingInvoice ? existingInvoice.generatedAt.toISOString() : undefined,
        canGenerate,
      },
    });
  });
}
