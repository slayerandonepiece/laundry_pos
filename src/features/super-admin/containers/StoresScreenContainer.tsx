'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from '../components/Dialog';
import StoresDirectory from '../components/StoresDirectory';
import StoreEditDialog from '../components/StoreEditDialog';
import LockStoreDialog from '../components/LockStoreDialog';
import DeleteStoreDialog from '../components/DeleteStoreDialog';
import type { StoreListItem } from '../types';

export default function StoresScreenContainer({ stores }: { stores: StoreListItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [editingStore, setEditingStore] = useState<StoreListItem | null>(null);
  const [lockingStore, setLockingStore] = useState<StoreListItem | null>(null);
  const [deletingStore, setDeletingStore] = useState<StoreListItem | null>(null);
  const [notice, setNotice] = useState('');

  return <>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    <StoresDirectory stores={stores} search={search} onSearch={setSearch} onEdit={setEditingStore} onLockToggle={setLockingStore} onDelete={setDeletingStore} />
    {editingStore && (
      <Dialog title="Edit store" description="Changes apply immediately and are recorded for this store." onClose={() => setEditingStore(null)} warnOnChanges>
        <StoreEditDialog store={editingStore} onSaved={store => { setEditingStore(null); setNotice(`${store.name} updated`); router.refresh(); setTimeout(() => setNotice(''), 4000); }} />
      </Dialog>
    )}
    {lockingStore && (
      <LockStoreDialog
        store={lockingStore}
        mode={lockingStore.status === 'LOCKED' ? 'unlock' : 'lock'}
        onCancel={() => setLockingStore(null)}
        onDone={store => { setLockingStore(null); setNotice(`${store.name} ${store.status === 'LOCKED' ? 'locked' : 'unlocked'}`); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
      />
    )}
    {deletingStore && (
      <DeleteStoreDialog
        store={deletingStore}
        onCancel={() => setDeletingStore(null)}
        onDone={() => { setNotice(`${deletingStore.name} deleted`); setDeletingStore(null); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
      />
    )}
  </>;
}
