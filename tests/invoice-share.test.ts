import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWhatsAppInvoice, shareInvoice, sharePdfFile } from '../src/lib/invoiceShare';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
function restore() {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  globalThis.fetch = originalFetch;
}
function navigation(value: object) { Object.defineProperty(globalThis, 'navigator', { configurable: true, value }); }

test('native share gets a PDF file with the invoice filename', async () => {
  try {
    let shared: ShareData | undefined;
    navigation({ canShare: () => true, share: async (value: ShareData) => { shared = value; } });
    globalThis.fetch = async () => new Response('%PDF-sample', { headers: { 'content-type': 'application/pdf' } });
    assert.equal(await sharePdfFile('/invoice', 'INV-000123'), true);
    assert.equal(shared?.files?.[0].name, 'INV-000123.pdf');
    assert.equal(shared?.files?.[0].type, 'application/pdf');
  } finally { restore(); }
});
test('an HTML auth error is never shared as a PDF', async () => {
  try {
    navigation({ canShare: () => true, share: async () => assert.fail('must not share HTML') });
    globalThis.fetch = async () => new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } });
    await assert.rejects(sharePdfFile('/invoice', 'INV-000123'));
  } finally { restore(); }
});
test('cancelled native sharing does not copy or send a fallback', async () => {
  try {
    navigation({ canShare: () => true, share: async () => { throw new DOMException('Cancelled', 'AbortError'); }, clipboard: { writeText: async () => assert.fail('must not copy after cancellation') } });
    globalThis.fetch = async () => new Response('%PDF-sample', { headers: { 'content-type': 'application/pdf' } });
    assert.equal(await shareInvoice({ downloadUrl: '/invoice', publicUrl: 'https://example.test/i/token', title: 'INV-000123' }), 'cancelled');
  } finally { restore(); }
});
test('unsupported browser sharing copies the customer access URL', async () => {
  try {
    let copied = '';
    navigation({ clipboard: { writeText: async (text: string) => { copied = text; } } });
    assert.equal(await shareInvoice({ downloadUrl: '/invoice', publicUrl: 'https://example.test/i/token', title: 'INV-000123' }), 'copied');
    assert.equal(copied, 'https://example.test/i/token');
  } finally { restore(); }
});
test('WhatsApp fallback encodes the invoice number and authorized URL', async () => {
  try {
    navigation({});
    let opened = '';
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { open: (url: string) => { opened = url; } } });
    assert.equal(await shareInvoice({ downloadUrl: '/invoice', publicUrl: 'https://example.test/i/token', title: 'INV-000123', whatsApp: true }), 'shared');
    assert.equal(new URL(opened).searchParams.get('text'), 'INV-000123\nhttps://example.test/i/token');
  } finally { restore(); }
});

test('direct WhatsApp Web skips native sharing and encodes the token link', () => {
  try {
    navigation({ share: () => assert.fail('must not open native sharing') });
    let opened = '';
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { open: (url: string) => { opened = url; } } });
    openWhatsAppInvoice('https://example.test/i/opaque-token', 'INV-000123');
    assert.equal(new URL(opened).origin, 'https://web.whatsapp.com');
    assert.equal(new URL(opened).pathname, '/send');
    assert.equal(new URL(opened).searchParams.get('text'), 'INV-000123\nhttps://example.test/i/opaque-token');
  } finally { restore(); }
});
