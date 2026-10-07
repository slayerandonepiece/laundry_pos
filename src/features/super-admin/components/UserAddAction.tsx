'use client';
import { useRouter } from 'next/navigation';
import Dialog from './Dialog';
import { useNewParamDialog } from '../useNewParamDialog';
import Icon from './Icon';
import UserAddDialog from './UserAddDialog';

export default function UserAddAction({ stores, variant = 'default' }: { stores: { id: string; name: string }[]; variant?: 'default' | 'block' }) {
  const router = useRouter();
  const [open, setOpen] = useNewParamDialog();

  return <>
    <button type="button" className={variant === 'block' ? 'btn outline block' : 'btn'} style={variant === 'block' ? { justifyContent: 'flex-start' } : undefined} onClick={() => setOpen(true)}><Icon name="plus" size="s" />Add user</button>
    {open && (
      <Dialog title="Add user" description="Create an account and optionally give it access to one organization." onClose={() => setOpen(false)} warnOnChanges>
        <UserAddDialog stores={stores} onSaved={() => { setOpen(false); router.refresh(); }} />
      </Dialog>
    )}
  </>;
}
