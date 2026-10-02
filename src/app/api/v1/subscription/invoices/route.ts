import { NextRequest } from 'next/server';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';
import { listStoreInvoices } from '@/server/services/stores';

export const runtime = 'nodejs';

// The owner's own platform billing history. Read-only and available while the
// store is locked or lapsed: paying is exactly when an owner needs the
// receipts. Internal fields (who recorded it, the free-text reference) stay
// out of the response.
export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER', { allowRestricted: true, allowLockedReadOnly: true });
    const invoices = await listStoreInvoices(session.storeId);
    return jsonResponse({
      invoices: invoices.map(invoice => ({
        invoiceSeq: invoice.invoiceSeq,
        number: formatInvoiceNumber(invoice.invoiceSeq),
        type: invoice.type,
        amount: invoice.amount,
        method: invoice.method ?? null,
        paidAt: invoice.paidAt,
        coversFrom: invoice.coversFrom ?? null,
        coversTo: invoice.coversTo ?? null,
      })),
    });
  });
}
