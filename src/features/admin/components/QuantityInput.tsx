'use client';
import { useState } from 'react';

export default function QuantityInput({ quantity, weight, disabled, onChange }: { quantity: number; weight: boolean; disabled: boolean; onChange: (quantity: number) => void }) {
  const [value, setValue] = useState(String(quantity));
  return <input type="text" inputMode={weight ? 'decimal' : 'numeric'} pattern={weight ? '[0-9]+([.][0-9]{1,3})?' : '[0-9]+'} disabled={disabled} value={value} required onChange={event => {
    const next = event.target.value;
    if (!(weight ? /^\d*([.]\d{0,3})?$/ : /^\d*$/).test(next)) return;
    setValue(next); onChange(Number(next) || 0);
  }} />;
}
