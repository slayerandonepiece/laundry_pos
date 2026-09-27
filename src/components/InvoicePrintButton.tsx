'use client';

export default function InvoicePrintButton() {
  return <button type="button" className="ad-button ad-secondary" onClick={() => window.print()}>Print</button>;
}
