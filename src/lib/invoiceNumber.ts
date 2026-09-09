// Shared display formatting for invoice sequence numbers. Deliberately has
// no 'server-only' guard (unlike src/server/**) so both server and client
// components can import it — e.g. a client-side invoice actions component
// building a title string.
//
// Matches the zero-padded `INV-000123` convention already used for
// subscription billing invoices (see SubscriptionsBillingTable.tsx). The two
// invoice systems are otherwise unrelated (see .agents/2026-09-brainstorm-plan.md
// Item 7) but share this one display format for consistency.
export function formatInvoiceNumber(invoiceSeq: number): string {
  return `INV-${String(invoiceSeq).padStart(6, '0')}`;
}
