'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import Icon from './Icon';
import LockStoreDialog from './LockStoreDialog';
import AddOutletDialog from './AddOutletDialog';
import Dialog from './Dialog';
import { TabContentSkeleton } from './Shimmer';
import { dateLabel } from '@/features/admin/admin.data';
import type { StoreDetail } from '../types';
import { initials } from '../utils';

interface LifecycleBadge {
  label: string;
  badgeClass: 'good' | 'warm' | 'bad' | 'info' | 'gray';
}

type TabKey = 'overview' | 'outlets' | 'users' | 'subscription' | 'payments' | 'messages' | 'activity';

export default function StoreDetailShell({
  store,
  lifecycleBadge,
  memberCount,
  activeTabKey,
  onTabSelect,
  children,
}: {
  store: StoreDetail;
  lifecycleBadge: LifecycleBadge;
  memberCount?: number;
  activeTabKey?: TabKey;
  onTabSelect?: (tab: TabKey) => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/super-admin/stores/${store.id}`;
  const [addOutletOpen, setAddOutletOpen] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [overrideStore, setOverrideStore] = useState<StoreDetail | null>(null);
  const [overrideBadge, setOverrideBadge] = useState<LifecycleBadge | null>(null);
  const [isPending, startTransition] = useTransition();
  const [navigatingHref, setNavigatingHref] = useState<string | null>(null);

  const displayStore = overrideStore && overrideStore.id === store.id ? overrideStore : store;
  const displayBadge = overrideBadge && overrideStore?.id === store.id ? overrideBadge : lifecycleBadge;

  const tabs: [TabKey, string, string, number | undefined][] = [
    ['overview', '', 'Overview', undefined],
    ['outlets', '/outlets', 'Outlets', displayStore.outletCount],
    ['users', '/users', 'People', memberCount],
    ['subscription', '/subscription', 'Subscription', undefined],
    ['payments', '/payments', 'Payments', undefined],
    ['messages', '/messages', 'Messages', undefined],
    ['activity', '/activity', 'Activity', undefined],
  ];

  return <>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    <Link className="backlink" href="/super-admin/stores"><Icon name="arrowLeft" size="s" />Back to organizations</Link>

    <div className="phead">
      <div className="phead-l">
        <span className="av sq" style={{ width: 46, height: 46, fontSize: 15 }}>{initials(displayStore.name)}</span>
        <div>
          <h1>{displayStore.name} <span className={'badge ' + displayBadge.badgeClass}>{displayBadge.label}</span></h1>
          <p>Onboarded {dateLabel(displayStore.onboardedAt)}{displayStore.address ? ` · ${displayStore.address}` : ''}</p>
        </div>
      </div>
      <div className="phead-r">
        <button type="button" className="btn outline" onClick={() => setAddOutletOpen(true)}>
          <Icon name="plus" size="s" />Add outlet
        </button>
        <button type="button" className="btn outline" onClick={() => onTabSelect ? onTabSelect('users') : router.push(`${base}/users`)}>
          <Icon name="users" size="s" />Employees
        </button>
        <button type="button" className="btn outline" onClick={() => setLockDialogOpen(true)}>
          <Icon name="lock" size="s" />{displayStore.status === 'LOCKED' ? 'Unlock access' : 'Lock access'}
        </button>
        <Link className="btn" href={`${base}/edit`}><Icon name="edit" size="s" />Edit organization</Link>
      </div>
    </div>

    <div className="tabs">
      {tabs.map(([key, suffix, label, count]) => {
        const href = base + suffix;
        const active = onTabSelect
          ? activeTabKey === key
          : (isPending && navigatingHref ? navigatingHref === href : pathname === href);
        return <Link
          key={href}
          href={href}
          prefetch={true}
          className={'tab' + (active ? ' on' : '')}
          aria-current={active ? 'page' : undefined}
          onClick={(e) => {
            if (onTabSelect) {
              e.preventDefault();
              onTabSelect(key);
              return;
            }
            if (href !== pathname) {
              setNavigatingHref(href);
              startTransition(() => {
                router.push(href);
              });
            }
          }}
        >
          {label}{count !== undefined && <span className="pill">{count}</span>}
        </Link>;
      })}
    </div>

    {onTabSelect ? children : (isPending ? <TabContentSkeleton /> : children)}

    {addOutletOpen && (
      <Dialog title="Add outlet" onClose={() => setAddOutletOpen(false)}>
        <AddOutletDialog storeId={store.id} onSaved={() => { setAddOutletOpen(false); router.refresh(); }} />
      </Dialog>
    )}

    {lockDialogOpen && (
      <LockStoreDialog
        store={displayStore}
        mode={displayStore.status === 'LOCKED' ? 'unlock' : 'lock'}
        onCancel={() => setLockDialogOpen(false)}
        onDone={updated => {
          setLockDialogOpen(false);
          setOverrideStore(updated as StoreDetail);
          setOverrideBadge(updated.status === 'LOCKED'
            ? { label: 'Locked', badgeClass: 'bad' }
            : updated.paymentState === 'unset'
              ? { label: 'Awaiting payment', badgeClass: 'warm' }
              : updated.paymentState === 'expiring'
                ? { label: 'Renewal due soon', badgeClass: 'warm' }
                : updated.paymentState === 'locked'
                  ? { label: 'Restricted', badgeClass: 'bad' }
                  : { label: 'Active', badgeClass: 'good' });
          setNotice(updated.status === 'LOCKED' ? 'Organization locked' : 'Organization unlocked');
          router.refresh();
          setTimeout(() => setNotice(''), 4000);
        }}
      />
    )}
  </>;
}
