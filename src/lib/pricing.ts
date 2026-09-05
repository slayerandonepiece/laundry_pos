import type { PriceItem } from '@/data/pricing';

export type Quantities = Record<string, number>;
export const formatMoney = (amount: number) => `₹${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
export const laundryRate = (weight: number) => weight <= 0 ? 0 : weight <= 4 ? 279 : weight <= 6 ? 379 : 379 + (weight - 6) * 49;
export function calculateEstimate(weight: number, items: PriceItem[], quantities: Quantities) {
  const laundry = laundryRate(weight);
  const lines = weight > 0 ? [`Wash, Dry & Fold · ${weight} kg — ${formatMoney(laundry)}`] : [];
  const total = items.reduce((sum, item) => {
    const quantity = quantities[item.name] ?? 0;
    if (quantity) lines.push(`${item.name} × ${quantity} — ${formatMoney(quantity * item.rate)}`);
    return sum + quantity * item.rate;
  }, laundry);
  return { total, lines };
}
