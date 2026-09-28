import 'server-only';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { ValidationError } from '@/server/errors';
import type { WorkspaceAnnouncement } from '@/lib/workspaceAnnouncements';

function safeLink(href: string): boolean {
  if (href.startsWith('/') && !href.startsWith('//') && !href.includes('\\')) return true;
  try { const url = new URL(href); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
const schema = z.object({
  message: z.string().trim().min(1, 'Enter an announcement message.').max(500),
  audience: z.enum(['store', 'platform', 'all']),
  tone: z.enum(['info', 'warning']),
  storeIds: z.array(z.string().min(1)).max(100).default([]),
  published: z.boolean(),
  actionLabel: z.string().trim().max(60).default(''),
  actionHref: z.string().trim().max(500).default(''),
}).refine(v => Boolean(v.actionLabel) === Boolean(v.actionHref), 'Enter both a link label and URL, or leave both empty.')
  .refine(v => !v.actionHref || safeLink(v.actionHref), 'Use a local path or an HTTPS URL.')
  .refine(v => v.audience !== 'platform' || !v.storeIds.length, 'Organization targeting is only available for store audiences.');

type Row = Awaited<ReturnType<typeof prisma.workspaceAnnouncement.findMany>>[number];
function dto(row: Row): WorkspaceAnnouncement {
  return { id: row.id, revision: row.revision, message: row.message, audience: row.audience as WorkspaceAnnouncement['audience'], tone: row.tone as WorkspaceAnnouncement['tone'], storeIds: row.storeIds, published: row.published,
    ...(row.actionHref && row.actionLabel ? { action: { href: row.actionHref, label: row.actionLabel } } : {}) };
}
export async function listAnnouncements(): Promise<WorkspaceAnnouncement[]> {
  return (await prisma.workspaceAnnouncement.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })).map(dto);
}
export async function publishedAnnouncements(audience: 'store' | 'platform', storeId?: string): Promise<WorkspaceAnnouncement[]> {
  const rows = await prisma.workspaceAnnouncement.findMany({ where: { published: true, audience: { in: [audience, 'all'] },
    ...(audience === 'store' ? { OR: [{ storeIds: { isEmpty: true } }, { storeIds: { has: storeId ?? '' } }] } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  // Clients need only rendered content, never other organizations' targeting IDs.
  return rows.map(row => ({ ...dto(row), storeIds: [] }));
}
export async function saveAnnouncement(actorId: string, input: unknown, existing?: { id: string; revision: number }) {
  const admin = await prisma.user.findFirst({ where: { id: actorId, active: true, isSuperAdmin: true }, select: { id: true } });
  if (!admin) throw new ValidationError('Super Admin access required.');
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const value = parsed.data;
  const storeIds = [...new Set(value.storeIds)];
  if (storeIds.length && await prisma.store.count({ where: { id: { in: storeIds }, deletedAt: null } }) !== storeIds.length) throw new ValidationError('One or more organizations are no longer available.');
  const data = { ...value, storeIds, actionHref: value.actionHref || null, actionLabel: value.actionLabel || null };
  return prisma.$transaction(async tx => {
    let row;
    if (existing) {
      const result = await tx.workspaceAnnouncement.updateMany({ where: { id: existing.id, revision: existing.revision }, data: { ...data, revision: { increment: 1 } } });
      if (!result.count) throw new ValidationError('This announcement changed. Reload before editing it.');
      row = await tx.workspaceAnnouncement.findUniqueOrThrow({ where: { id: existing.id } });
    } else row = await tx.workspaceAnnouncement.create({ data });
    await tx.auditLog.create({ data: { actorId, entityType: 'WorkspaceAnnouncement', entityId: row.id, action: existing ? 'UPDATE_ANNOUNCEMENT' : 'CREATE_ANNOUNCEMENT', afterJson: { message: row.message, published: row.published, audience: row.audience, storeIds, revision: row.revision } } });
    return dto(row);
  });
}
