import { NextRequest } from 'next/server';
import { listOrganizationPaymentMethods } from '@/server/services/platform-payment-methods';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

// Organization-level methods only. An outlet-owned order is validated against
// an enabled OrganizationPaymentMethod (resolveActivePaymentMethod with
// allowLegacy: false), so returning the legacy per-store list here handed
// clients options the checkout would then reject. The workspace made the same
// switch; this keeps the mobile app on the identical set.
export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    // Same defensive read the orders route uses: nextUrl is absent when a
    // plain Request reaches the handler (integration tests do this).
    const searchParams = req.nextUrl?.searchParams ?? new URL(req.url).searchParams;
    const includeDisabled = searchParams.get('all') === 'true';
    const methods = await listOrganizationPaymentMethods(session.storeId);
    return jsonResponse(includeDisabled ? methods : methods.filter(method => method.enabled));
  }, { request: req, cacheTtlSeconds: 30 });
}

// The global catalogue is Super Admin territory; an owner only enables or
// disables what already exists in it. Creating a store-local method here would
// produce an option no outlet order could ever be paid with.
export async function POST() {
  return handleApiRoute(async () =>
    jsonResponse(
      {
        error:
          'Payment methods are managed in the platform catalogue. Enable an existing method with PATCH /api/v1/payment-methods/{id} instead.',
      },
      410,
    ),
  );
}
