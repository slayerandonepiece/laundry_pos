// Client-safe mirror of the placeholder rules in src/server/services/message-templates.ts
// (that module is server-only). tests/message-templates.integration.test.ts keeps both lists identical.

export const MESSAGE_PLACEHOLDERS = ['customer', 'store', 'outlet', 'orderNo', 'total', 'due', 'date', 'dueDate', 'method', 'invoiceNo', 'link'] as const;

export const MESSAGE_STATUS_ORDER = ['PENDING', 'IN_PROGRESS', 'READY', 'DELIVERED'] as const;
export type MessageStatus = (typeof MESSAGE_STATUS_ORDER)[number];

export const MESSAGE_STATUS_TITLES: Record<MessageStatus, { title: string; when: string }> = {
  PENDING: { title: 'Order placed', when: 'When an order is punched' },
  IN_PROGRESS: { title: 'In progress', when: 'When work starts' },
  READY: { title: 'Ready', when: 'When the order is ready' },
  DELIVERED: { title: 'Delivered', when: 'When the order is delivered' },
};

export const MESSAGE_ATTACHMENT_LABELS = {
  NONE: 'None',
  ORDER_SLIP_PDF: 'Order slip PDF',
  INVOICE_PDF: 'Invoice PDF',
} as const;
export type MessageAttachmentValue = keyof typeof MESSAGE_ATTACHMENT_LABELS;

const SAMPLE: Record<(typeof MESSAGE_PLACEHOLDERS)[number], string> = {
  customer: 'Ravi', store: 'One Wash Laundry', outlet: 'Chinnapanahalli', orderNo: '1000004314', total: '420', due: '210',
  date: '14 Aug 2026', dueDate: '16 Aug 2026', method: 'UPI', invoiceNo: 'IN001/27/0000632', link: 'example.com/i/Xk2Q9',
};

export function fillSampleMessage(body: string): string {
  return body.replace(/\{([^{}]+)\}/g, (match, name: string) => (name in SAMPLE ? SAMPLE[name as keyof typeof SAMPLE] : match));
}

/** Mirrors validateMessageTemplate so the editor reports problems before saving. */
export function messageProblem(status: MessageStatus, body: string): string {
  const text = body.trim();
  if (!text) return 'Message text is required.';
  if (text.length > 1000) return 'Message text must be 1000 characters or fewer.';
  const names = [...text.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]);
  const unknown = [...new Set(names.filter(name => !(MESSAGE_PLACEHOLDERS as readonly string[]).includes(name)))];
  if (unknown.length) return `Unknown placeholder${unknown.length === 1 ? '' : 's'}: ${unknown.map(name => `{${name}}`).join(', ')}.`;
  if ((status === 'READY' || status === 'DELIVERED') && !names.includes('link')) return `${MESSAGE_STATUS_TITLES[status].title} messages must include {link}.`;
  return '';
}
