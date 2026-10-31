import { redirect } from 'next/navigation';
import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';
import { listOrganizationMessageTemplates } from '@/server/services/message-templates';

export default async function Page() {
  let templates: Awaited<ReturnType<typeof listOrganizationMessageTemplates>> = [];
  try {
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, undefined, undefined, { allowLockedReadOnly: true });
    if (session.storeRole !== 'OWNER') redirect('/admin/profile');
    templates = await listOrganizationMessageTemplates(session.storeId);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="profile" profileSection="messages" serverMessageTemplates={templates} />;
}
