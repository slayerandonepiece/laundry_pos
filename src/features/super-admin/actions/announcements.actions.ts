'use server';
import { revalidatePath } from 'next/cache';
import { getSession, requireSuperAdmin, resolveStoreSelection } from '@/server/auth/session';
import { publishedAnnouncements, saveAnnouncement } from '@/server/services/workspace-announcements';
import { ValidationError } from '@/server/errors';

export async function getWorkspaceAnnouncementsAction() {
  const user = await getSession();
  if (!user) return { scope: 'signed-out', announcements: [] };
  if (user.isSuperAdmin) return { scope: `${user.id}:platform`, announcements: await publishedAnnouncements('platform') };
  const selection = await resolveStoreSelection();
  if (!selection) return { scope: `${user.id}:none`, announcements: [] };
  return { scope: `${user.id}:${selection.storeId}`, announcements: await publishedAnnouncements('store', selection.storeId) };
}
export async function saveAnnouncementAction(input: unknown, existing?: { id: string; revision: number }) {
  const user = await requireSuperAdmin();
  try {
    const announcement = await saveAnnouncement(user.id, input, existing);
    revalidatePath('/super-admin/announcements');
    return { ok: true as const, announcement };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false as const, error: error.message };
    throw error;
  }
}
