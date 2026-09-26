'use client';
import { money } from '@/features/admin/admin.data';
import type { SubscriptionPlanListItem } from '../types';

export default function PlanPickerCards({ plans, value, onChange, currentPlanId }: {
  plans: SubscriptionPlanListItem[];
  value: string;
  onChange: (planId: string) => void;
  currentPlanId?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {plans.map(plan => {
        const isSelected = value === plan.id;
        const isCurrent = plan.id === currentPlanId;
        return (
          <label
            key={plan.id}
            className={'plan-card-item' + (isSelected ? ' selected' : '')}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              padding: '14px 16px',
              border: isSelected ? '1.5px solid var(--brand)' : '1px solid var(--line-2)',
              borderRadius: 10,
              background: isSelected ? 'var(--brand-soft)' : '#fff',
              cursor: 'pointer',
              transition: 'all .15s ease',
              boxShadow: isSelected ? '0 0 0 1px var(--brand) inset' : 'none',
            }}
          >
            <input
              type="radio"
              name="plan-picker"
              checked={isSelected}
              onChange={() => onChange(plan.id)}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            />
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: isSelected ? '5px solid var(--brand)' : '1.5px solid var(--line)',
                background: '#fff',
                marginTop: 2,
                flexShrink: 0,
                transition: 'all .15s ease',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13.5, color: 'var(--ink)' }}>{plan.name}</strong>
                  {isCurrent && <span className="chip" style={{ fontSize: 11, padding: '1px 6px' }}>Current</span>}
                  {plan.depositWaivedByDefault && (
                    <span className="badge good" style={{ fontSize: 10.5, padding: '2px 7px' }}>
                      Deposit Waived
                    </span>
                  )}
                </div>
              </div>
              {plan.notes && (
                <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                  {plan.notes}
                </p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12.5, color: 'var(--ink-2)' }}>
                <span>
                  Deposit: <strong className="num" style={{ color: plan.depositWaivedByDefault ? '#059669' : 'var(--ink)' }}>
                    {plan.depositWaivedByDefault ? 'Waived (₹0)' : money(plan.depositAmount)}
                  </strong>
                </span>
                <span style={{ color: 'var(--line)' }}>•</span>
                <span>
                  Annual Fee: <strong className="num" style={{ color: 'var(--ink)' }}>{money(plan.annualFeeAmount)} / yr</strong>
                </span>
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
