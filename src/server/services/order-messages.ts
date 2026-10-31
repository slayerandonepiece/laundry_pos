import 'server-only';
import { prisma } from '@/server/db';
import { formatCalendarDate } from '@/server/dates';
import { parseOrderCode, toOrderCode } from './orders';
import { getOrCreateOrderSlip } from './order-slips';
import { getOrCreateOrderInvoice } from './order-invoices';
import { listOrganizationMessageTemplates, type MessageAttachment, type MessageStatusKey } from './message-templates';

// The customer message for an order's current status, built from the
// organization's template. Every placeholder is filled here from real order
// data except {link}, which stays in the text because only the client knows the
// public origin it will be opened from; `linkPath` is what it should point at.

export interface OrderMessage {
  statusKey: MessageStatusKey;
  enabled: boolean;
  /** Text with every placeholder filled except {link}. Empty when the template is disabled. */
  text: string;
  /** Public page for the link: the order slip, or the invoice once delivered. */
  linkPath: string | null;
  /** Public PDF to attach, when the template asks for one and it exists. */
  pdfPath: string | null;
  pdfName: string | null;
  attachment: MessageAttachment;
}

const KEY_BY_STATUS = { PENDING: 'PENDING', IN_PROGRESS: 'IN_PROGRESS', READY: 'READY', DELIVERED: 'DELIVERED' } as const;

const rupees = (paise: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: paise % 100 ? 2 : 0, minimumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100);
const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export async function buildOrderMessage(storeId: string, orderCode: string): Promise<OrderMessage> {
  const orderNumber = parseOrderCode(orderCode);
  if (orderNumber === null) throw new Error('Order not found.');
  const order = await prisma.order.findUnique({
    where: { storeId_orderNumber: { storeId, orderNumber } },
    include: { lines: true, payments: { orderBy: { paidAt: 'asc' } }, store: true, outlet: true },
  });
  if (!order || order.legacyCancelled) throw new Error('Order not found.');
  const statusKey = KEY_BY_STATUS[order.status];
  const templates = await listOrganizationMessageTemplates(storeId);
  const template = templates.find(item => item.statusKey === statusKey);
  // Imported history is never messaged: the customer was served long ago.
  if (!template || !template.enabled || order.isImported) {
    return { statusKey, enabled: false, text: '', linkPath: null, pdfPath: null, pdfName: null, attachment: 'NONE' };
  }

  const total = order.lines.reduce((sum, line) => sum + line.amount, 0);
  const paid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const code = toOrderCode(order.orderNumber);

  // The invoice only exists for a delivered, fully paid order. Delivered messages
  // link to it (creating it on first use); every earlier status links to the slip.
  let invoice: { invoiceNumber: string; accessToken: string } | null = null;
  if (statusKey === 'DELIVERED' && paid >= total) {
    invoice = await getOrCreateOrderInvoice(storeId, orderCode);
  }
  const slip = invoice ? null : await getOrCreateOrderSlip(storeId, orderCode);

  const methods = [...new Set(order.payments.map(payment => payment.method))];
  const values: Record<string, string> = {
    customer: order.customerName.trim() || 'there',
    store: order.store.name,
    outlet: order.outlet?.displayName ?? order.store.name,
    orderNo: code,
    total: rupees(total),
    due: rupees(Math.max(total - paid, 0)),
    date: shortDate(formatCalendarDate(order.orderDate)),
    dueDate: shortDate(formatCalendarDate(order.dueDate)),
    method: methods.length === 0 ? '-' : methods.length === 1 ? methods[0] : 'multiple methods',
    invoiceNo: invoice?.invoiceNumber ?? '',
  };
  const text = template.body.replace(/\{([^{}]+)\}/g, (match, name: string) => (name === 'link' ? match : name in values ? values[name] : match));

  const linkPath = invoice ? `/i/${invoice.accessToken}/view` : `/o/${slip!.accessToken}/view`;
  let attachment = template.attachment;
  let pdfPath: string | null = null;
  let pdfName: string | null = null;
  if (attachment === 'INVOICE_PDF') {
    // A template that asks for the invoice before one exists falls back to the slip.
    if (invoice) { pdfPath = `/i/${invoice.accessToken}`; pdfName = invoice.invoiceNumber; }
    else attachment = 'ORDER_SLIP_PDF';
  }
  if (attachment === 'ORDER_SLIP_PDF') {
    const target = slip ?? (await getOrCreateOrderSlip(storeId, orderCode));
    pdfPath = `/o/${target.accessToken}`;
    pdfName = `Order ${code}`;
  }
  return { statusKey, enabled: true, text, linkPath, pdfPath, pdfName, attachment };
}
