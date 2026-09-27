'use client';
import { useId } from 'react';
import { money } from '@/features/admin/admin.data';
import type { SubscriptionPlanListItem } from '../types';

export default function PlanPickerCards({ plans, value, onChange, currentPlanId }: {
  plans: SubscriptionPlanListItem[];
  value: string;
  onChange: (planId: string) => void;
  currentPlanId?: string;
}) {
  const radioName = useId();
  return (
    <ul className="plan-list">
      {plans.map(plan => (
        <li key={plan.id}>
          <label className={'plan-list-item' + (value === plan.id ? ' selected' : '')}>
            <input type="radio" name={radioName} value={plan.id} checked={value === plan.id} onChange={() => onChange(plan.id)} />
            <span className="plan-list-name">{plan.name}{plan.id === currentPlanId && <span className="chip">Current</span>}</span>
            <span className="plan-list-terms"><span className="plan-list-fee">{money(plan.annualFeeAmount)} / year</span><small>{plan.depositWaivedByDefault ? 'Deposit waived' : `Deposit ${money(plan.depositAmount)}`}</small></span>
          </label>
        </li>
      ))}
    </ul>
  );
}
