'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import UsersList from '../components/UsersList';
import ResetPasswordDialog from '../components/ResetPasswordDialog';
import DeactivateUserDialog from '../components/DeactivateUserDialog';
import type { PlatformUserListItem } from '../types';

export default function UsersScreenContainer({ users }: { users: PlatformUserListItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [resetting, setResetting] = useState<PlatformUserListItem | null>(null);
  const [deactivating, setDeactivating] = useState<PlatformUserListItem | null>(null);
  const [notice, setNotice] = useState('');

  return <>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    <UsersList users={users} search={search} onSearch={setSearch} onReset={setResetting} onDeactivate={setDeactivating} />
    {resetting && (
      <ResetPasswordDialog
        userId={resetting.id}
        userName={resetting.name}
        onCancel={() => setResetting(null)}
        onDone={() => { setResetting(null); setNotice('Password reset'); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
      />
    )}
    {deactivating && (
      <DeactivateUserDialog
        user={deactivating}
        onCancel={() => setDeactivating(null)}
        onDone={updated => { setDeactivating(null); setNotice(updated.active ? `${updated.name} reactivated` : `${updated.name} deactivated`); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
      />
    )}
  </>;
}
