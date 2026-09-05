'use client';
import { useEffect, useMemo, useState } from 'react';
import { PriceCalculator } from '@/components/price_calculator';
import { siteConfig } from '@/config/site';
import { calculatorItems } from '@/data/pricing';
import { calculateEstimate, type Quantities } from '@/lib/pricing';

export default function PriceCalculatorContainer() {
  const [open, setOpen] = useState(false); const [weight, setWeight] = useState(0); const [quantities, setQuantities] = useState<Quantities>({});
  const estimate = useMemo(() => calculateEstimate(weight, calculatorItems, quantities), [weight, quantities]);
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false); document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [open]);
  const message = estimate.lines.length ? `Hi Express Laundry, please confirm this rate-card estimate: ${estimate.lines.join(', ')}. Estimated total ₹${estimate.total}. Please confirm final price, offer eligibility, timing and pickup/delivery availability.` : 'Hi Express Laundry, I would like help estimating my laundry order.';
  return <PriceCalculator open={open} weight={weight} items={calculatorItems} quantities={quantities} total={estimate.total} whatsappHref={`https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(message)}`} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} onClear={() => { setWeight(0); setQuantities({}); }} onWeightChange={value => setWeight(Math.min(50, Math.max(0, value || 0)))} onQuantityChange={(name, value) => setQuantities(current => ({ ...current, [name]: Math.min(99, Math.max(0, Math.floor(value || 0))) }))} />;
}
