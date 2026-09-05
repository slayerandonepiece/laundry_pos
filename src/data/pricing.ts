export type PriceItem = { name: string; note: string; rate: number };
export const priceGroups: { title: string; items: PriceItem[] }[] = [
  { title: 'Garment care', items: [
    { name: 'Steam ironing', note: 'Per piece', rate: 11 }, { name: 'Shirt / T-shirt / Pant', note: 'Dry cleaning', rate: 59 },
    { name: 'Jacket', note: 'Dry cleaning', rate: 149 }, { name: 'Blazer', note: 'Dry cleaning', rate: 189 },
    { name: 'Saree', note: 'Dry cleaning · per piece', rate: 188 },
  ]},
  { title: 'Home fabrics', items: [
    { name: 'Blanket · Single', note: 'Each', rate: 229 }, { name: 'Blanket · Double', note: 'Each', rate: 279 },
    { name: 'Bed sheet · Single', note: 'Each', rate: 45 }, { name: 'Bed sheet · Double', note: 'Each', rate: 69 },
  ]},
  { title: 'Optional add-ons', items: [
    { name: 'Comfort add-on', note: 'Displayed rate', rate: 18 }, { name: 'Dettol add-on', note: 'Displayed rate', rate: 19 },
  ]},
];
export const calculatorItems = priceGroups.flatMap(group => group.items);
