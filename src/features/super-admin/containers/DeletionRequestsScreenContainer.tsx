'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeading from '../components/PageHeading';
import Icon from '../components/Icon';
import ConfirmationDialog, { type Confirmation } from '@/features/admin/components/ConfirmationDialog';
import { restoreDeletionRequestAction, deleteRequestNowAction } from '../actions/deletion-requests.actions';
import { formatDisplayDate } from '../utils';
import type { DeletionRequestListItem } from '@/server/services/account-deletion';

type StatusFilter = 'all' | 'PENDING' | 'RESTORED' | 'COMPLETED';
type ScopeFilter = 'all' | 'ORGANIZATION' | 'SELF';

const statusTone = { PENDING: 'warm', RESTORED: 'good', COMPLETED: 'gray' } as const;
const statusLabel = { PENDING: 'Pending', RESTORED: 'Restored', COMPLETED: 'Completed' } as const;
const channelLabel = { MOBILE: 'Mobile app', WEB: 'Web', SUPPORT: 'Support' } as const;

export default function DeletionRequestsScreenContainer({ requests }: { requests: DeletionRequestListItem[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const counts = useMemo(() => ({
    all: requests.length,
    PENDING: requests.filter(r => r.status === 'PENDING').length,
    RESTORED: requests.filter(r => r.status === 'RESTORED').length,
    COMPLETED: requests.filter(r => r.status === 'COMPLETED').length,
  }), [requests]);

  const rows = requests.filter(r => (status === 'all' || r.status === status) && (scope === 'all' || r.scope === scope));

  function run(action: (id: string) => Promise<{ ok: boolean; error?: string }>, id: string, done: string) {
    setError('');
    action(id)
      .then(result => {
        if (!result.ok) { setError(result.error || 'Could not complete that action.'); return; }
        setNotice(done);
        router.refresh();
        setTimeout(() => setNotice(''), 4000);
      })
      .catch(() => setError('Could not complete that action.'));
  }

  const restore = (r: DeletionRequestListItem) => setConfirmation({
    title: 'Restore this request?',
    description: `${r.scope === 'ORGANIZATION' ? 'The organization is unlocked for its team and' : 'The employee can use their account again and'} the deletion is cancelled. Do this after confirming with the owner by phone.`,
    confirmLabel: 'Restore',
    onConfirm: () => run(restoreDeletionRequestAction, r.id, 'Request restored'),
  });
  const deleteNow = (r: DeletionRequestListItem) => setConfirmation({
    title: 'Delete now?',
    description: `${r.scope === 'ORGANIZATION' ? 'The organization, its orders, payments, services, expenses, outlets and every login that belongs only to it' : 'This employee login'} will be permanently deleted immediately. This cannot be undone and skips the grace period.`,
    confirmLabel: 'Delete permanently',
    onConfirm: () => run(deleteRequestNowAction, r.id, 'Deleted permanently'),
  });

  return <>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    <PageHeading icon="trash" title="Deletion requests" subtitle="Owners and employees who asked to delete their account. Restore on their behalf, or delete early." />
    {error && <p className="ad-error" role="alert">{error}</p>}

    <div className="filters">
      {([['all', 'All'], ['PENDING', 'Pending'], ['RESTORED', 'Restored'], ['COMPLETED', 'Completed']] as [StatusFilter, string][]).map(([value, label]) => (
        <button key={value} type="button" className={'fpill' + (status === value ? ' on' : '')} aria-pressed={status === value} onClick={() => setStatus(value)}>
          {label} {counts[value]}
        </button>
      ))}
      <span className="ftools">
        <select aria-label="Scope" value={scope} onChange={e => setScope(e.target.value as ScopeFilter)}>
          <option value="all">All scopes</option>
          <option value="ORGANIZATION">Organization</option>
          <option value="SELF">Employee</option>
        </select>
      </span>
    </div>

    {!rows.length ? (
      <div className="card"><div className="empty">
        <span className="ic l"><Icon name="trash" size="l" /></span>
        <h3>{requests.length ? 'No matches' : 'No deletion requests'}</h3>
        <p>{requests.length ? 'No requests match these filters.' : 'Requests made from the app or the web will appear here.'}</p>
      </div></div>
    ) : (
      <div className="tablecard">
        <table>
          <thead>
            <tr>
              <th>Status</th><th>Scope</th><th>Organization</th><th>Requested</th><th>Scheduled for</th><th>Days left</th><th>Via</th><th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td><span className={'badge ' + statusTone[r.status]}>{statusLabel[r.status]}</span></td>
                <td>{r.scope === 'ORGANIZATION' ? 'Organization' : 'Employee'}</td>
                <td>
                  {r.organizationName ?? '(deleted)'}
                  {r.isReviewDemo && <> <span className="chip">Review demo</span></>}
                </td>
                <td className="num">{formatDisplayDate(r.requestedAt)}</td>
                <td className="num">{formatDisplayDate(r.scheduledFor)}</td>
                <td className="num">{r.daysLeft ?? '—'}</td>
                <td>{channelLabel[r.requestedVia]}</td>
                <td>
                  <div className="rowacts">
                    {r.status === 'PENDING' && <>
                      <button type="button" className="btn outline sm" onClick={() => restore(r)}>Restore</button>
                      <button type="button" className="btn outline sm" disabled={r.isReviewDemo} title={r.isReviewDemo ? 'The review demo organization is protected' : undefined} onClick={() => deleteNow(r)}>Delete now</button>
                    </>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {confirmation && <ConfirmationDialog {...confirmation} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation.onConfirm; setConfirmation(null); action(); }} />}
  </>;
}
