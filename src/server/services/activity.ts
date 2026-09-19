import 'server-only';
import { prisma } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';
import type { ActivityEntry, PlatformActivityEntry } from '@/features/super-admin/types';

interface RecordStoreActivityInput {
  storeId?: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  outletId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

/** Persist one Super Admin organization-management event for the Activity tab. */
export async function recordStoreActivity(input: RecordStoreActivityInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      storeId: input.storeId,
      outletId: input.outletId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeJson: input.before,
      afterJson: input.after,
    },
  });
}

/** Most recent AuditLog rows for a store's Activity tab, newest first. */
export async function listStoreActivity(storeId: string, limit = 50): Promise<ActivityEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { storeId },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(row => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actorName: row.actor?.name,
    outletId: row.outletId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    beforeJson: row.beforeJson ?? undefined,
    afterJson: row.afterJson ?? undefined,
  }));
}

/** Most recent AuditLog rows across all organizations for Platform Activity, newest first. */
export async function listPlatformActivity(limit = 100): Promise<PlatformActivityEntry[]> {
  const rows = await prisma.auditLog.findMany({
    include: {
      actor: { select: { name: true, username: true } },
      store: { select: { id: true, name: true } },
      outlet: { select: { id: true, displayName: true, outletCode: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(row => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actorName: row.actor?.name,
    actorUsername: row.actor?.username,
    storeId: row.storeId ?? undefined,
    storeName: row.store?.name ?? undefined,
    outletId: row.outletId ?? undefined,
    outletName: row.outlet?.displayName ?? undefined,
    outletCode: row.outlet?.outletCode ?? undefined,
    createdAt: row.createdAt.toISOString(),
    beforeJson: row.beforeJson ?? undefined,
    afterJson: row.afterJson ?? undefined,
  }));
}
