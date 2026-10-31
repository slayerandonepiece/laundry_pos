'use server';

import { requireSuperAdmin } from '@/server/auth/session';
import { prisma } from '@/server/db';

export interface PaletteOrganization { id: string; name: string; orgCode: string }

/** Organizations matching the command palette query, by name or code. */
export async function searchPaletteOrganizationsAction(query: string): Promise<PaletteOrganization[]> {
  await requireSuperAdmin();
  const text = query.trim().slice(0, 80);
  if (text.length < 2) return [];
  const rows = await prisma.store.findMany({
    where: { deletedAt: null, OR: [{ name: { contains: text, mode: 'insensitive' } }, { orgCode: { contains: text } }] },
    orderBy: { name: 'asc' },
    take: 6,
    select: { id: true, name: true, orgCode: true },
  });
  return rows.map(row => ({ id: row.id, name: row.name, orgCode: String(row.orgCode) }));
}
