'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/features/admin/components/Primitives';
import MessageWorkspace from './MessageWorkspace';
import { restoreOrganizationMessageAction, saveOrganizationMessagesAction } from '../actions/org-settings.actions';
import {
  MESSAGE_STATUS_ORDER,
  MESSAGE_STATUS_TITLES,
  messageProblem,
  type MessageAttachmentValue,
  type MessageStatus,
} from '../messageTemplates';
import type { OrganizationMessageTemplateDTO } from '@/server/services/message-templates';

interface Draft { statusKey: MessageStatus; body: string; enabled: boolean; attachment: MessageAttachmentValue }

const toDrafts = (templates: OrganizationMessageTemplateDTO[]): Draft[] => MESSAGE_STATUS_ORDER.flatMap(statusKey => {
  const template = templates.find(item => item.statusKey === statusKey);
  return template ? [{ statusKey, body: template.body, enabled: template.enabled, attachment: template.attachment }] : [];
});

export default function StoreMessagesTab({ storeId, templates, onSaved }: {
  storeId: string;
  templates: OrganizationMessageTemplateDTO[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>(() => toDrafts(templates));
  const [saved, setSaved] = useState<Draft[]>(() => toDrafts(templates));
  const [selected, setSelected] = useState<MessageStatus>('READY');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(drafts) !== JSON.stringify(saved);
  const current = drafts.find(draft => draft.statusKey === selected) ?? drafts[0];
  const defaults = templates.find(template => template.statusKey === current?.statusKey);

  if (!current) return <div className="card"><div className="empty"><h3>No message templates</h3><p>Platform default templates are not set up yet.</p></div></div>;

  const patch = (change: Partial<Draft>) => { setDrafts(list => list.map(draft => (draft.statusKey === current.statusKey ? { ...draft, ...change } : draft))); setError(''); setNotice(''); };

  function save() {
    const firstBad = drafts.find(draft => messageProblem(draft.statusKey, draft.body));
    if (firstBad) {
      setSelected(firstBad.statusKey);
      return setError(`${MESSAGE_STATUS_TITLES[firstBad.statusKey].title}: ${messageProblem(firstBad.statusKey, firstBad.body)}`);
    }
    setBusy(true);
    setError('');
    saveOrganizationMessagesAction(storeId, drafts)
      .then(result => {
        setBusy(false);
        if (!result.ok || !result.templates) { setError(result.error || 'Could not save messages. Try again.'); return; }
        const next = toDrafts(result.templates);
        setDrafts(next);
        setSaved(next);
        setNotice('Messages saved');
        onSaved();
        router.refresh();
      })
      .catch(() => { setBusy(false); setError('Could not save messages. Try again.'); });
  }

  function restore() {
    if (!defaults) return;
    setBusy(true);
    setError('');
    restoreOrganizationMessageAction(storeId, current.statusKey)
      .then(result => {
        setBusy(false);
        if (!result.ok) { setError(result.error || 'Could not restore the default. Try again.'); return; }
        const restored = { statusKey: current.statusKey, body: defaults.defaultBody, enabled: defaults.defaultEnabled, attachment: defaults.defaultAttachment };
        setDrafts(list => list.map(draft => (draft.statusKey === restored.statusKey ? restored : draft)));
        setSaved(list => list.map(draft => (draft.statusKey === restored.statusKey ? restored : draft)));
        setNotice('Default restored');
        onSaved();
        router.refresh();
      })
      .catch(() => { setBusy(false); setError('Could not restore the default. Try again.'); });
  }

  const atDefault = !defaults || (current.body === defaults.defaultBody && current.enabled === defaults.defaultEnabled && current.attachment === defaults.defaultAttachment);
  return <div>
    <p className="ad-help" style={{ margin: '0 0 10px' }}>Used when staff share an order status. Every outlet of this organization uses these. The owner can view them but not edit.</p>
    <MessageWorkspace
      drafts={drafts}
      current={current}
      onSelect={setSelected}
      onPatch={patch}
      enabledNote={current.enabled ? 'Staff are offered this message.' : 'No message is offered for this status.'}
      subtitle={`${MESSAGE_STATUS_TITLES[current.statusKey].when} · ${atDefault ? 'Using platform wording' : 'Edited for this organization'}`}
      headerAside={<span className={'badge ' + (dirty ? 'warm' : 'gray')}>{dirty ? 'Unsaved changes' : 'No changes'}</span>}
      message={<>{error && <p className="ad-error" role="alert">{error}</p>}{notice && <p className="ad-help" role="status">✓ {notice}</p>}</>}
      footer={<>
        <Button secondary type="button" disabled={busy || atDefault} onClick={restore}>Restore default</Button>
        <Button type="button" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save messages'}</Button>
      </>}
    />
  </div>;
}
