'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from './Dialog';
import { money } from '@/features/admin/admin.data';
import Icon from './Icon';
import PlanEditor from './PlanEditor';

const EXAMPLES = [
  { name: 'Standard', description: 'What most new stores pay', deposit: 1000000, fee: 500000 },
  { name: 'No-deposit — extra branch', description: "For a returning owner's 2nd store", deposit: 0, fee: 500000 },
];

export default function PlansEmptyState() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return <>
    <div className="card"><div className="empty">
      <span className="ic l"><Icon name="card" size="l" /></span>
      <h3>No plans yet</h3>
      <p>
        Every store today has its own deposit and fee typed in during onboarding. Create a plan to reuse
        the same terms next time — or keep setting terms per store, that still works too.
      </p>
      <button type="button" className="btn" onClick={() => setOpen(true)}><Icon name="plus" size="s" />Create your first plan</button>
    </div></div>

    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head"><h3>A plan usually looks like</h3></div>
      <div className="card-body" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {EXAMPLES.map(ex => (
          <div key={ex.name} className="chip" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
            <strong>{ex.name}</strong>
            <span className="muted" style={{ fontSize: 12 }}>{ex.description}</span>
            <span className="num">{money(ex.deposit)} + {money(ex.fee)}/yr</span>
          </div>
        ))}
      </div>
    </div>

    {open && (
      <Dialog title="Create plan" description="Set reusable subscription terms for stores." onClose={() => setOpen(false)} warnOnChanges>
        <PlanEditor onSaved={() => { setOpen(false); router.refresh(); }} />
      </Dialog>
    )}
  </>;
}
