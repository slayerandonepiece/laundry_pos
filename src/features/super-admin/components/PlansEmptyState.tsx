'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from './Dialog';
import { money } from '@/features/admin/admin.data';
import Icon from './Icon';
import PlanEditor from './PlanEditor';

const EXAMPLES = [
  { name: 'Standard', description: 'What most new organizations pay', deposit: 1000000, fee: 500000 },
  { name: 'No-deposit — extra branch', description: "For a returning owner's 2nd organization", deposit: 0, fee: 500000 },
];

export default function PlansEmptyState() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return <>
    <div className="card">
      <div className="empty">
        <div className="empty-icon-wrap" aria-hidden="true">
          <Icon name="card" size="l" />
        </div>
        <h3>No plans yet</h3>
        <p>
          Every organization today has its own deposit and fee typed in during onboarding. Create a plan to reuse
          the same terms next time — or keep setting terms per organization, that still works too.
        </p>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          <Icon name="plus" size="s" />Create your first plan
        </button>
      </div>
    </div>

    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-head"><h3>A plan usually looks like</h3></div>
      <div className="card-body">
        <div className="plan-preview-grid">
          {EXAMPLES.map(ex => (
            <div key={ex.name} className="plan-preview-card">
              <strong>{ex.name}</strong>
              <span className="desc">{ex.description}</span>
              <span className="pricing num">{money(ex.deposit)} deposit + {money(ex.fee)}/yr</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    {open && (
      <Dialog title="Create plan" description="Set reusable subscription terms for organizations." onClose={() => setOpen(false)} warnOnChanges>
        <PlanEditor onSaved={() => { setOpen(false); router.refresh(); }} />
      </Dialog>
    )}
  </>;
}
