'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import Icon from './Icon';
import LockStoreDialog from './LockStoreDialog';
import { dateLabel } from '@/features/admin/admin.data';
import type { StoreDetail } from '../types';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

export default function StoreDetailShell({ store, memberCount, children }: { store: StoreDetail; memberCount?: number; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/super-admin/stores/${store.id}`;
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const tabs: [string, string, number | undefined][] = [
    ['', 'Overview', undefined],
    ['/users', 'Users', memberCount],
    ['/subscription', 'Subscription', undefined],
    ['/activity', 'Activity', undefined],
  ];

  return <>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    <Link className="backlink" href="/super-admin/stores"><Icon name="arrowLeft" size="s" />Back to stores</Link>

    <div className="phead">
      <div className="phead-l">
        <span className="av sq" style={{ width: 46, height: 46, fontSize: 15 }}>{initials(store.name)}</span>
        <div>
          <h1>{store.name} <span className={'badge ' + (store.status === 'LOCKED' ? 'bad' : 'good')}>{store.status === 'LOCKED' ? 'Locked' : 'Active'}</span></h1>
          <p>Onboarded {dateLabel(store.onboardedAt)}{store.address ? ` · ${store.address}` : ''}</p>
        </div>
      </div>
      <div className="phead-r">
        <button type="button" className="btn outline" onClick={() => setLockDialogOpen(true)}>
          <Icon name="lock" size="s" />{store.status === 'LOCKED' ? 'Unlock access' : 'Lock access'}
        </button>
        <Link className="btn" href={`${base}/edit`}><Icon name="edit" size="s" />Edit store</Link>
      </div>
    </div>

    <div className="tabs">
      {tabs.map(([suffix, label, count]) => {
        const href = base + suffix;
        const active = pathname === href;
        return <Link key={href} href={href} className={'tab' + (active ? ' on' : '')} aria-current={active ? 'page' : undefined}>
          {label}{count !== undefined && <span className="pill">{count}</span>}
        </Link>;
      })}
    </div>

    {children}

    {lockDialogOpen && (
      <LockStoreDialog
        store={store}
        mode={store.status === 'LOCKED' ? 'unlock' : 'lock'}
        onCancel={() => setLockDialogOpen(false)}
        onDone={updated => { setLockDialogOpen(false); setNotice(updated.status === 'LOCKED' ? 'Store locked' : 'Store unlocked'); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
      />
    )}
  </>;
}
