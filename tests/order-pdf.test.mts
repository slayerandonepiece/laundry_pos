import assert from 'node:assert/strict';
import { createElement } from 'react';
import { test } from 'node:test';
import { renderToBuffer } from '@react-pdf/renderer';
import { OrderSlipPdf } from '../src/features/admin/pdf/OrderSlipPdf';
import { OrderInvoicePdf } from '../src/features/admin/pdf/OrderInvoicePdf';
import type { OrderSlipData } from '../src/server/services/order-slips';
import type { OrderInvoiceData } from '../src/server/services/order-invoices';

// Renders the real PDF documents and reads the text back out of them. No database:
// the documents are pure functions of their data. (Runs in its own process because
// @react-pdf/renderer does not load under the react-server condition the DB suite uses.)

async function pdfText(buffer: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  let text = '';
  for (let page = 1; page <= doc.numPages; page += 1) {
    text += (await (await doc.getPage(page)).getTextContent()).items.map(item => ('str' in item ? item.str : '')).join(' ') + '\n';
  }
  return text.replace(/\s+/g, ' ');
}

const lines = [{ name: 'Wash & Fold', quantity: 3.5, unit: 'kg', amount: 21000 }, { name: 'Shirt iron', quantity: 6, unit: 'pcs', amount: 9000 }];
const slip: OrderSlipData = {
  accessToken: 'x'.repeat(43), orderCode: '1000004314', status: 'Ready', orderDate: '2026-08-14', dueDate: '2026-08-16',
  customerName: 'Ravi', phone: '9222222222', notes: 'Starch the collars', lines, total: 30000, paid: 10000, balance: 20000,
  store: { name: 'One Wash Laundry', address: '1 Test Road', phone: '9876500000' }, outlet: { name: 'Chinnapanahalli', phone: '9876511111' },
};
const invoice: OrderInvoiceData = {
  invoiceSeq: 7, invoiceNumber: 'IN001/27/0000632', accessToken: 'y'.repeat(43), generatedAt: '2026-08-16T10:00:00.000Z',
  orderCode: '1000004314', orderDate: '2026-08-14', dueDate: '2026-08-16', customerName: 'Ravi', phone: '9222222222', notes: '',
  lines, payments: [{ amount: 10000, method: 'Cash', date: '2026-08-14' }, { amount: 20000, method: 'UPI', date: '2026-08-16' }],
  total: 30000, paid: 30000, balance: 0, store: { name: 'One Wash Laundry', address: '1 Test Road', phone: '9876500000' },
};

test('the order slip renders as a PDF with the order, totals, amount due and no invoice number', async () => {
  const buffer = await renderToBuffer(createElement(OrderSlipPdf, { slip }) as never);
  assert.equal(Buffer.from(buffer).subarray(0, 5).toString(), '%PDF-');
  const text = await pdfText(buffer);
  for (const expected of ['1000004314', 'Ravi', '9222222222', 'Wash & Fold', 'Shirt iron', 'Rs. 300', 'Rs. 100', 'Amount due', 'Rs. 200', 'Starch the collars', 'One Wash Laundry', 'Chinnapanahalli', 'Ready', 'not an invoice']) {
    assert.ok(text.includes(expected), `slip should contain "${expected}": ${text}`);
  }
  assert.equal(text.includes('₹'), false, 'the rupee glyph is missing from the PDF font, so amounts use Rs.');
  assert.equal(/IN\d{3,5}\//.test(text), false, 'a slip carries no invoice number');
  assert.equal((await pdfText(await renderToBuffer(createElement(OrderSlipPdf, { slip: { ...slip, customerName: '', notes: '' } }) as never))).includes('Walk-in customer'), true);
});

test('the invoice renders its single-line number, both payments and a zero balance', async () => {
  const buffer = await renderToBuffer(createElement(OrderInvoicePdf, { invoice }) as never);
  assert.equal(Buffer.from(buffer).subarray(0, 5).toString(), '%PDF-');
  const text = await pdfText(buffer);
  for (const expected of ['IN001/27/0000632', '1000004314', 'Ravi', 'Rs. 300', 'Rs. 100', 'Rs. 200', 'Cash', 'UPI', 'Balance due', 'Rs. 0']) {
    assert.ok(text.includes(expected), `invoice should contain "${expected}": ${text}`);
  }
  assert.ok(text.includes('IN001/27/0000632'), 'the invoice number stays on one line');
});
