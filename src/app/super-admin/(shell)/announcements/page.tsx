import { redirect } from 'next/navigation';
import { AuthError, requireSuperAdmin } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listAnnouncements } from '@/server/services/workspace-announcements';
import PageHeading from '@/features/super-admin/components/PageHeading';
import AnnouncementsEditor from '@/features/super-admin/components/AnnouncementsEditor';

export default async function Page() {
  try { await requireSuperAdmin(); } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  let data: { announcements: Awaited<ReturnType<typeof listAnnouncements>>; stores: { id: string; name: string }[] } | undefined;
  try {
    const [announcements, stores] = await Promise.all([
      listAnnouncements(),
      prisma.store.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    data = { announcements, stores };
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'P2021')) throw error;
  }
  return <><PageHeading icon="bell" title="Announcements" subtitle="Publish quiet, dismissible messages across your workspaces." />{data ? <AnnouncementsEditor announcements={data.announcements} stores={data.stores} /> : <section className="card" role="status"><h2>Announcement setup pending</h2><p>The announcement database migration has not been applied yet. Existing store data is unaffected. Publishing will be available after setup is complete.</p></section>}</>;
}
