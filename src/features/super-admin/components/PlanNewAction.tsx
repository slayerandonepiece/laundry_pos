'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from './Dialog';
import Icon from './Icon';
import PlanEditor from './PlanEditor';

export default function PlanNewAction() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return <>
    <button type="button" className="btn" onClick={() => setOpen(true)}><Icon name="plus" size="s" />New plan</button>
    {open && (
      <Dialog title="Create plan" description="Set reusable subscription terms for organizations." onClose={() => setOpen(false)} warnOnChanges>
        <PlanEditor onSaved={() => { setOpen(false); router.refresh(); }} />
      </Dialog>
    )}
  </>;
}
