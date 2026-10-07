import { NextRequest } from 'next/server';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';
import { listOrganizationMessageTemplates, MESSAGE_STATUS_LABELS } from '@/server/services/message-templates';

export const runtime = 'nodejs';

// Read-only for every member. An organization with no override reads the platform
// template live; updatedAt is then the platform row's, so it moves when Super Admin edits it.
export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, undefined, { allowRestricted: true });
    const rows = await listOrganizationMessageTemplates(session.storeId);
    return jsonResponse({
      templates: rows.map(row => ({
        statusKey: row.statusKey,
        label: MESSAGE_STATUS_LABELS[row.statusKey],
        enabled: row.enabled,
        attachment: row.attachment,
        body: row.body,
        updatedAt: row.updatedAt ?? row.defaultUpdatedAt,
      })),
    });
  });
}
