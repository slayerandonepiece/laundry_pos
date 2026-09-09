'use client';
import { money } from '@/features/admin/admin.data';
import type { SubscriptionPlanListItem } from '../types';

// Visual selectable-card plan picker (design canvas's radio-card pattern,
// already defined in super-admin.css but unused until now) — used by both
// ChangePlanDialog (P8) and OnboardingWizard's plan step (P9).
export default function PlanPickerCards({ plans, value, onChange, currentPlanId }: {
  plans: SubscriptionPlanListItem[];
  value: string;
  onChange: (planId: string) => void;
  currentPlanId?: string;
}) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {plans.map(plan => (
      <label key={plan.id} className={'radio-card' + (value === plan.id ? ' on' : '')}>
        <input type="radio" name="plan-picker" checked={value === plan.id} onChange={() => onChange(plan.id)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <span className="radio" aria-hidden="true" />
        <div>
          <b>{plan.name} {plan.id === currentPlanId && <span className="chip" style={{ marginLeft: 6 }}>Current</span>}</b>
          <small>{plan.notes || 'Reusable pricing template'}</small>
          <small>{plan.depositWaivedByDefault ? 'Deposit waived' : money(plan.depositAmount)} + {money(plan.annualFeeAmount)}/yr</small>
        </div>
      </label>
    ))}
  </div>;
}
