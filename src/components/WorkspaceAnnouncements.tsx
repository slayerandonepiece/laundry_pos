'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getWorkspaceAnnouncementsAction } from '@/features/super-admin/actions/announcements.actions';
import type { WorkspaceAnnouncement } from '@/lib/workspaceAnnouncements';
import WorkspaceNotice from './WorkspaceNotice';

export default function WorkspaceAnnouncements({ audience, contextKey = '' }: { audience: 'store' | 'platform'; contextKey?: string }) {
  const pathname = usePathname();
  const context = `${audience}:${contextKey}`;
  const [result, setResult] = useState<{ scope: string; context: string; announcements: WorkspaceAnnouncement[] }>({ scope: '', context: '', announcements: [] });
  useEffect(() => {
    let cancelled = false;
    let request = 0;
    const refresh = () => { const current = ++request; void getWorkspaceAnnouncementsAction().then(value => { if (!cancelled && current === request) setResult({ ...value, context }); }).catch(() => { if (!cancelled && current === request) setResult({ scope: '', context, announcements: [] }); }); };
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('workspace-announcements-changed', refresh);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('workspace-announcements-changed', refresh); };
  }, [pathname, context]);
  return (result.context === context ? result.announcements : []).map(notice => <WorkspaceNotice key={`${result.scope}:${notice.id}:${notice.revision}`} dismissKey={`${result.scope}:${notice.id}:${notice.revision}`} label="Announcement" tone={notice.tone} action={notice.action} dismissible>{notice.message}</WorkspaceNotice>);
}
