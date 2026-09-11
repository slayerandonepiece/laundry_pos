import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { getOrder, parseOrderCode } from "@/server/services/orders";
import {
  handleApiRoute,
  jsonResponse,
  requireApiStoreSession,
} from "@/server/api/handler";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderCode: string }> },
) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const { orderCode } = await params;

    const order = await getOrder(session.storeId, orderCode);
    if (!order) {
      return jsonResponse({ error: "Order not found." }, 404);
    }

    const orderNumber = parseOrderCode(orderCode);
    const existingInvoice =
      orderNumber !== null
        ? await prisma.orderInvoice.findFirst({
            where: { storeId: session.storeId, order: { orderNumber } },
            select: { invoiceSeq: true, accessToken: true },
          })
        : null;

    const total = order.lines.reduce((s, l) => s + l.amount, 0);
    const paid = order.payments.reduce((s, p) => s + p.amount, 0);
    const isDeliveredOrCompleted = order.status === "Delivered";
    const canGenerate = paid >= total && isDeliveredOrCompleted;

    return jsonResponse({
      ...order,
      invoice: {
        exists: Boolean(existingInvoice),
        invoiceSeq: existingInvoice?.invoiceSeq,
        accessToken: existingInvoice?.accessToken,
        canGenerate,
      },
    });
  });
}
