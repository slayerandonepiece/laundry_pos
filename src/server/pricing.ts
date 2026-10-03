// Server-side mirror of src/features/admin/admin.data.ts's price() calculation,
// operating on live catalogue rows so order totals are never trusted from the
// client. Keep both in sync if slab/weight pricing rules change.

export interface PricingProduct {
  type: 'ITEM' | 'WEIGHT';
  price: number | null;
  extra: number | null;
  slabs: { limit: number; price: number }[]; // must be sorted ascending by limit
}

export function computeLineAmount(product: PricingProduct, quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (product.type === 'ITEM') return Math.round((product.price ?? 0) * quantity);
  const slab = product.slabs.find(s => quantity <= s.limit);
  if (slab) return slab.price;
  const last = product.slabs.at(-1);
  if (!last) return 0;
  return Math.round(last.price + (quantity - last.limit) * (product.extra ?? 0));
}
