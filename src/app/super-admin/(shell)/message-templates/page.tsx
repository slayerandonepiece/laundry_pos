import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { listPlatformMessageTemplates } from '@/server/services/message-templates';
import PageHeading from '@/features/super-admin/components/PageHeading';
import PlatformMessageTemplatesView from '@/features/super-admin/components/PlatformMessageTemplatesView';

export default async function Page() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const templates = await listPlatformMessageTemplates();
  return <>
    <PageHeading icon="mail" title="Message templates" subtitle="Default wording copied to every new organization. Existing organizations keep their own copy." />
    <PlatformMessageTemplatesView templates={templates.map(template => ({ statusKey: template.statusKey, body: template.body, defaultEnabled: template.defaultEnabled, defaultAttachment: template.defaultAttachment }))} />
  </>;
}
