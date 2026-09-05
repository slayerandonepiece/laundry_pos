'use client';
import { useState } from 'react';
import type { Product } from '../admin.types';
import { money, price } from '../admin.data';
import { Button } from './Primitives';

export default function QuantityForm({ product, quantity, existing, onConfirm, onCancel }: { product: Product; quantity?: number; existing: number; onConfirm: (quantity: number) => void; onCancel: () => void }) {
  const [input, setInput] = useState(quantity ? String(quantity) : '');
  const value = Number(input);
  const combined = quantity === undefined ? existing + value : value;
  const valid = Number.isFinite(value) && value > 0 && (product.type === 'weight' ? Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7 : Number.isInteger(value)) && Number.isSafeInteger(price(product, combined));
  return <form className="ad-form" onSubmit={e => { e.preventDefault(); if (valid) onConfirm(value); }}>
    <p>{product.type === 'weight' ? 'Enter the weight in kilograms.' : 'How many pieces?'}</p>
    <label>{product.type === 'weight' ? 'Weight (kg)' : 'Pieces'}<input autoFocus type="number" inputMode={product.type === 'weight' ? 'decimal' : 'numeric'} min={product.type === 'weight' ? '.001' : '1'} step={product.type === 'weight' ? '.001' : '1'} required value={input} onChange={e => setInput(e.target.value)} placeholder={product.type === 'weight' ? 'e.g. 4.125' : 'e.g. 2'}/></label>
    {product.type === 'weight' && <p className="ad-help">{product.slabs.map(s => `Up to ${s.limit} kg: ${money(s.price)}`).join(' · ')} · Extra {money(product.extra)}/kg</p>}
    {existing > 0 && quantity === undefined && <p>Already in order: {existing} {product.type === 'weight' ? 'kg' : 'pieces'}. This amount will be added.</p>}
    <div className="ad-pos-preview"><span>{existing > 0 && quantity === undefined ? 'Combined service total' : 'Service total'}</span><strong>{money(valid ? price(product, combined) : 0)}</strong></div>
    <div className="ad-confirm-actions"><Button secondary type="button" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={!valid}>{quantity === undefined ? 'Add to order' : 'Update item'}</Button></div>
  </form>;
}
