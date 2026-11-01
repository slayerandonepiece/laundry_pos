'use client';
import { money } from '@/features/admin/admin.data';
import { discountedPaise } from '../utils';

// The one pattern for anything charged: a plan, then an optional discount percentage and an optional
// note. A 100% discount waives the charge. Used by onboarding, Add outlet and Record payment.
export default function PlanDiscountFields({ listAmount, discount, note, onDiscount, onNote, count = 1, noteLabel = 'Note (optional)' }: {
  listAmount: number;
  discount: string;
  note: string;
  onDiscount: (value: string) => void;
  onNote: (value: string) => void;
  count?: number;
  noteLabel?: string;
}) {
  const percent = Math.min(Math.max(Number(discount) || 0, 0), 100);
  const each = discountedPaise(listAmount, percent);
  return <>
    <div className="ad-form-grid">
      <label>Discount (%)<input type="number" min="0" max="100" step="1" value={discount} onChange={e => onDiscount(e.target.value)} /></label>
      <label>{noteLabel}<input value={note} onChange={e => onNote(e.target.value)} placeholder="e.g. Referral, founding customer" /></label>
    </div>
    {percent > 0 && <p className="ad-help">{percent}% off {money(listAmount)}{count > 1 ? ` × ${count}` : ''}: {money(each * count)} to collect{percent === 100 ? ' (waived)' : ''}.</p>}
  </>;
}
