'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/features/admin/components/Primitives';
import MessageWorkspace, { type MessageDraft } from './MessageWorkspace';
import { savePlatformMessageAction } from '../actions/org-settings.actions';
import { messageProblem, type MessageAttachmentValue, type MessageStatus } from '../messageTemplates';

interface Row { statusKey: MessageStatus; body: string; defaultEnabled: boolean; defaultAttachment: MessageAttachmentValue }

const toDraft = (row: Row): MessageDraft => ({ statusKey: row.statusKey, body: row.body, enabled: row.defaultEnabled, attachment: row.defaultAttachment });

export default function PlatformMessageTemplatesView({ templates }: { templates: Row[] }) {
  const router = useRouter();
  const [saved, setSaved] = useState<MessageDraft[]>(() => templates.map(toDraft));
  const [drafts, setDrafts] = useState<MessageDraft[]>(() => templates.map(toDraft));
  const [selected, setSelected] = useState<MessageStatus>(() => templates.find(row => row.statusKey === 'READY')?.statusKey ?? templates[0]?.statusKey);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  if (!templates.length) return <div className="card"><div className="empty"><h3>No default templates</h3><p>Run the platform seed to create the default templates.</p></div></div>;

  const current = drafts.find(draft => draft.statusKey === selected) ?? drafts[0];
  const original = saved.find(draft => draft.statusKey === current.statusKey)!;
  const dirty = JSON.stringify(current) !== JSON.stringify(original);
  const patch = (change: Partial<MessageDraft>) => { setDrafts(list => list.map(draft => (draft.statusKey === current.statusKey ? { ...draft, ...change } : draft))); setError(''); setNotice(''); };

  function save() {
    const problem = messageProblem(current.statusKey, current.body);
    if (problem) return setError(problem);
    setBusy(true);
    savePlatformMessageAction(current.statusKey, { body: current.body, defaultEnabled: current.enabled, defaultAttachment: current.attachment })
      .then(result => {
        setBusy(false);
        if (!result.ok) { setError(result.error || 'Could not save this template. Try again.'); return; }
        setSaved(list => list.map(draft => (draft.statusKey === current.statusKey ? current : draft)));
        setNotice('Saved');
        router.refresh();
      })
      .catch(() => { setBusy(false); setError('Could not save this template. Try again.'); });
  }

  return <MessageWorkspace
    drafts={drafts}
    current={current}
    onSelect={status => { setSelected(status); setError(''); setNotice(''); }}
    onPatch={patch}
    enabledNote={current.enabled ? 'Copied to new organizations as On.' : 'Copied to new organizations as Off.'}
    subtitle="Default wording copied to every new organization. Existing organizations keep their own copy."
    headerAside={<span className="mt-hint">On for new organizations</span>}
    message={<>{error && <p className="ad-error" role="alert">{error}</p>}{notice && <p className="ad-help" role="status">✓ {notice}</p>}</>}
    footer={<>
      <Button secondary type="button" disabled={!dirty || busy} onClick={() => { setDrafts(list => list.map(draft => (draft.statusKey === current.statusKey ? original : draft))); setError(''); }}>Reset to saved</Button>
      <Button type="button" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save template'}</Button>
    </>}
  />;
}
