'use client';
import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkspaceAnnouncement } from '@/lib/workspaceAnnouncements';
import { saveAnnouncementAction } from '../actions/announcements.actions';
import Dialog, { DialogFooter, useDialogClose } from './Dialog';
import Icon from './Icon';
import './announcements.css';

const blank = { message: '', audience: 'store' as WorkspaceAnnouncement['audience'], tone: 'info' as WorkspaceAnnouncement['tone'], storeIds: [] as string[], published: false, actionLabel: '', actionHref: '' };
function draftFrom(row: WorkspaceAnnouncement) { return { message: row.message, audience: row.audience, tone: row.tone, storeIds: row.storeIds, published: row.published, actionLabel: row.action?.label ?? '', actionHref: row.action?.href ?? '' }; }
export default function AnnouncementsEditor({ announcements, stores }: { announcements: WorkspaceAnnouncement[]; stores: { id: string; name: string }[] }) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [query, setQuery] = useState('');
  const [organizationQuery, setOrganizationQuery] = useState('');
  const [targetMode, setTargetMode] = useState<'all' | 'selected'>('all');
  const [editing, setEditing] = useState<WorkspaceAnnouncement | null>(null);
  const [draft, setDraft] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function edit(row?: WorkspaceAnnouncement) { setOrganizationQuery(''); setTargetMode(row?.storeIds.length ? 'selected' : 'all'); setEditing(row ?? null); setDraft(row ? draftFrom(row) : blank); setError(''); setNotice(''); setOpen(true); }
  async function persist(value = draft, row = editing) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await saveAnnouncementAction(value, row ? { id: row.id, revision: row.revision } : undefined);
      if (!result.ok) { setError(result.error); return; }
      setNotice(result.announcement.published ? 'Announcement published.' : row?.published ? 'Announcement unpublished.' : 'Announcement saved as draft.');
      setEditing(result.announcement); setDraft(draftFrom(result.announcement)); setOpen(false);
      window.dispatchEvent(new Event('workspace-announcements-changed'));
      router.refresh();
    } catch { setError('Could not save the announcement. Try again.'); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (draft.audience !== 'platform' && targetMode === 'selected' && !draft.storeIds.length) { setError('Select at least one organization, or choose all organizations.'); return; }
    void persist({ ...draft, published: submitter?.value === 'publish' });
  }
  const matchingOrganizations = stores.filter(store => store.name.toLowerCase().includes(organizationQuery.trim().toLowerCase()));
  const matching = announcements.filter(row => (filter === 'all' || row.published === (filter === 'published')) && row.message.toLowerCase().includes(query.trim().toLowerCase()));
  const published = announcements.filter(row => row.published).length;
  function audienceLabel(row: WorkspaceAnnouncement) {
    if (row.audience === 'platform') return 'Super Admin';
    if (!row.storeIds.length) return row.audience === 'all' ? 'Everyone' : 'All store workspaces';
    const names = row.storeIds.map(id => stores.find(store => store.id === id)?.name ?? 'Unavailable organization');
    return `${row.audience === 'all' ? 'Super Admin and ' : ''}${names.join(', ')}`;
  }
  return <div className="announcements-page">
    <div className="announcement-toolbar">
      <div className="announcement-tabs" aria-label="Announcement status">{(['all', 'published', 'draft'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All announcements' : value === 'published' ? 'Published' : 'Drafts'}<span>{value === 'all' ? announcements.length : value === 'published' ? published : announcements.length - published}</span></button>)}</div>
      <button className="btn" type="button" disabled={busy} onClick={() => edit()}><Icon name="plus" size="s" />New announcement</button>
    </div>
    {notice && <p className="notice good" role="status">{notice}</p>}
    {error && !open && <p className="notice danger" role="alert">{error}</p>}
    <section className="card announcement-register" aria-label="Announcements list">
      <div className="announcement-list-search"><input type="search" aria-label="Search announcements" placeholder="Search announcements…" value={query} onChange={event => setQuery(event.target.value)} /><span className="announcement-muted">{matching.length} {matching.length === 1 ? 'announcement' : 'announcements'}</span></div>
      {!matching.length ? <div className="announcement-empty"><Icon name="bell" /><h2>{announcements.length ? 'No matching announcements' : 'No announcements yet'}</h2><p>{announcements.length ? 'Try another search or status filter.' : 'Keep your stores informed about maintenance, updates and important notices.'}</p>{!announcements.length && <button type="button" className="btn outline" onClick={() => edit()}>Create announcement</button>}</div> : <div className="announcement-list">{matching.map(row => <article key={row.id} className="announcement-row"><div className="announcement-row-content"><div className="announcement-row-meta"><span className={`announcement-status ${row.published ? 'is-published' : ''}`}>{row.published ? 'Published' : 'Draft'}</span><span className="announcement-muted">{row.tone === 'warning' ? 'Maintenance / warning' : 'Information'}</span></div><p className="announcement-message">{row.message}</p><p className="announcement-audience"><Icon name="bell" size="s" />{audienceLabel(row)}</p>{row.action && <p className="announcement-muted">Link: {row.action.label}</p>}</div><div className="announcement-controls"><button type="button" className="btn outline" disabled={busy} onClick={() => edit(row)}>Edit</button><button type="button" className="btn outline" disabled={busy} onClick={() => void persist({ ...draftFrom(row), published: !row.published }, row)}>{row.published ? 'Unpublish' : 'Publish'}</button></div></article>)}</div>}
    </section>
    {open && <Dialog title={editing ? 'Edit announcement' : 'New announcement'} description="Show a dismissible notice at the top of selected workspaces." size="wide" onClose={() => { if (!busy) setOpen(false); }}>
      <form id={formId} onSubmit={submit} className="announcement-form">
        <div className="announcement-composer">
          <section className="announcement-compose-message" aria-label="Announcement content">
            <h3>Message & appearance</h3>
            <label>Message<textarea value={draft.message} maxLength={500} rows={5} required onChange={e => setDraft({ ...draft, message: e.target.value })} /></label>
            <label>Style<select value={draft.tone} onChange={e => setDraft({ ...draft, tone: e.target.value as typeof draft.tone })}><option value="info">Information</option><option value="warning">Maintenance / warning</option></select></label>
            <div className="announcement-fields"><label>Link label (optional)<input value={draft.actionLabel} maxLength={60} onChange={e => setDraft({ ...draft, actionLabel: e.target.value })} /></label><label>Link URL (optional)<input value={draft.actionHref} maxLength={500} placeholder="/admin/profile or https://…" onChange={e => setDraft({ ...draft, actionHref: e.target.value })} /></label></div>
            <div className="announcement-preview-wrap"><span className="announcement-muted">Banner preview</span><div className={`announcement-preview announcement-preview-${draft.tone}`} aria-label="Announcement preview"><span>{draft.message || 'Your message will appear here.'}</span><span>{draft.actionLabel} ×</span></div></div>
            <p className="announcement-muted">Users can dismiss a published banner for their session. Editing it makes it visible again.</p>
          </section>
          <section className="announcement-compose-audience" aria-label="Announcement recipients">
            <h3>Audience & organizations</h3>
            <label>Audience<select value={draft.audience} onChange={e => { setDraft({ ...draft, audience: e.target.value as typeof draft.audience, storeIds: [] }); setTargetMode('all'); setOrganizationQuery(''); }}><option value="store">Store workspaces</option><option value="platform">Super Admin</option><option value="all">Everyone</option></select></label>
            {draft.audience === 'platform' ? <p className="announcement-muted">Visible only in the Super Admin workspace.</p> : <fieldset className="announcement-targets"><legend>Organizations</legend>
              <div className="announcement-scope"><label><input type="radio" name={`${formId}-scope`} checked={targetMode === 'all'} onChange={() => { setTargetMode('all'); setDraft({ ...draft, storeIds: [] }); }} />All organizations</label><label><input type="radio" name={`${formId}-scope`} checked={targetMode === 'selected'} onChange={() => setTargetMode('selected')} />Selected organizations</label></div>
              {targetMode === 'all' ? <p className="announcement-muted">Shown to every organization, including organizations added later.</p> : <div className="announcement-picker">
                <input type="search" aria-label="Search organizations" placeholder="Search organizations…" value={organizationQuery} onChange={e => setOrganizationQuery(e.target.value)} />
                <div className="announcement-selection-summary"><span className="announcement-muted" role="status">{draft.storeIds.length} selected</span><button className="link-btn" type="button" disabled={!draft.storeIds.length} onClick={() => setDraft({ ...draft, storeIds: [] })}>Clear selection</button></div>
                <div className="announcement-organizations">{matchingOrganizations.length ? matchingOrganizations.map(store => <label key={store.id}><input type="checkbox" checked={draft.storeIds.includes(store.id)} disabled={!draft.storeIds.includes(store.id) && draft.storeIds.length >= 100} onChange={e => setDraft({ ...draft, storeIds: e.target.checked ? [...draft.storeIds, store.id] : draft.storeIds.filter(id => id !== store.id) })} /><span>{store.name}</span></label>) : <p className="announcement-muted">No matching organizations.</p>}</div>
                <p className="announcement-muted">Search and select up to 100 organizations. Selections are kept when you search.</p>
              </div>}
            </fieldset>}
            {draft.audience === 'all' && <p className="announcement-muted">Super Admin is also included.</p>}
          </section>
        </div>
        {error && <p className="notice danger" role="alert">{error}</p>}
        <AnnouncementFooter formId={formId} busy={busy} published={Boolean(editing?.published)} />
      </form>
    </Dialog>}
  </div>;
}

function AnnouncementFooter({ formId, busy, published }: { formId: string; busy: boolean; published: boolean }) {
  const close = useDialogClose();
  return <DialogFooter><button className="btn outline" type="button" disabled={busy} onClick={close}>Cancel</button>{!published && <button className="btn outline" type="submit" form={formId} value="draft" disabled={busy}>Save draft</button>}<button className="btn" type="submit" form={formId} value="publish" disabled={busy}>{busy ? 'Saving…' : published ? 'Save changes' : 'Publish announcement'}</button></DialogFooter>;
}
