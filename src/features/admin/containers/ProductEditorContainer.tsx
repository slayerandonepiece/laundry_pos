'use client';
import { useState } from 'react';
import type { Product } from '../admin.types';
import { Dialog, Badge, Toggle } from '@/features/admin/components/ui';
export default function ProductEditorContainer({
  product,
  error: saveError,
  onClose,
  onSave
}: {
  product?: Product;
  error?: string;
  onClose: () => void;
  onSave: (p: Product) => Promise<void>;
}) {
  const [kind, setKind] = useState(product?.type || 'item');
  const [slabs, setSlabs] = useState<{limit: number; price: number}[]>(
    product?.type === 'weight' ? product.slabs : [{ limit: 0, price: 0 }, { limit: 0, price: 0 }]
  );
  const [extra, setExtra] = useState(product?.type === 'weight' ? product.extra : 0);
  const [unit, setUnit] = useState(product?.type === 'item' ? product.price : 0);
  const [error, setError] = useState('');
  const [active, setActive] = useState(product?.active ?? true);
  const [name, setName] = useState(product?.name || '');
  const [category, setCategory] = useState(product?.category || 'Laundry');
  const [saving, setSaving] = useState(false);

  const pricing = kind === 'weight' ? { type: 'weight' as const, slabs, extra } : { type: 'item' as const, price: unit };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter a service name.');
    if (kind === 'weight' && (slabs.length === 0 || slabs.some((s, i) => s.limit <= (slabs[i - 1]?.limit || 0) || s.price <= 0))) {
      return setError('Slab limits must increase and prices must be positive.');
    }
    setSaving(true);
    onSave({
      id: product?.id || crypto.randomUUID(),
      name: name.trim(),
      category,
      active,
      ...pricing
    } as Product).catch(() => {}).finally(() => setSaving(false));
  };

  return (
    <Dialog
      isOpen={true}
      onClose={onClose}
      title={product ? 'Edit service' : 'Add service'}
      warnOnChanges={true}
      foot={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="product-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : (product ? 'Save changes' : 'Add service')}</button>
        </>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div className="field">
          <label htmlFor="prod-name">Service name</label>
          <input
            id="prod-name"
            name="name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Wash & Fold"
            required
          />
        </div>

        <div className="row" style={{ gap: '12px', alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="prod-category">Category</label>
            <select id="prod-category" name="category" value={category} onChange={e => setCategory(e.target.value)}>
              {['Laundry', 'Dry cleaning', 'Ironing', 'Home fabrics', 'Add-on'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="prod-charging">Charging type</label>
            <select id="prod-charging" value={kind} onChange={e => setKind(e.target.value as 'item' | 'weight')}>
              <option value="item">Per item</option>
              <option value="weight">By weight (slabs)</option>
            </select>
          </div>
        </div>

        {kind === 'item' ? (
          <div className="field">
            <label htmlFor="prod-price">Price per piece (₹)</label>
            <input
              id="prod-price"
              type="number"
              min=".01"
              step=".01"
              placeholder="e.g. 50"
              required
              value={unit ? unit / 100 : ''}
              onChange={e => setUnit(Math.round(Number(e.target.value) * 100))}
            />
          </div>
        ) : (
          <div className="field">
            <label id="slabs-heading">Pricing slabs <span style={{ fontWeight: 400, color: 'var(--muted)' }}>Add or remove a price break</span></label>
            <div className="row" style={{ gap: '8px', marginBottom: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>
              <span style={{ flex: 1 }}>Up to (kg)</span>
              <span style={{ flex: 1 }}>Price (₹)</span>
              <span style={{ width: '40px', flexShrink: 0 }}></span>
            </div>
            {slabs.map((s, i) => (
              <div className="row" key={i} style={{ gap: '8px', marginBottom: '8px' }}>
                <input
                  type="number"
                  step=".01"
                  min=".01"
                  aria-label={`Slab ${i + 1} weight limit (kg)`}
                  placeholder={`e.g. ${4 + i * 2}`}
                  value={s.limit || ''}
                  required
                  onChange={e => setSlabs(slabs.map((v, j) => j === i ? { ...v, limit: Number(e.target.value) } : v))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min=".01"
                  step=".01"
                  aria-label={`Slab ${i + 1} price (₹)`}
                  placeholder={`e.g. ${250 + i * 100}`}
                  value={s.price ? s.price / 100 : ''}
                  required
                  onChange={e => setSlabs(slabs.map((v, j) => j === i ? { ...v, price: Math.round(Number(e.target.value) * 100) } : v))}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="dialog-close"
                  data-dirty
                  aria-label={`Remove slab ${i + 1}`}
                  onClick={() => setSlabs(slabs.filter((_, j) => j !== i))}
                  style={{ width: '40px', height: '40px', flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-secondary"
              style={{ alignSelf: 'flex-start', marginTop: '4px' }}
              data-dirty
              onClick={() => setSlabs([...slabs, { limit: (slabs.at(-1)?.limit || 0) + 2, price: (slabs.at(-1)?.price || 0) + 10000 }])}
            >
              ＋ Add price slab
            </button>

            <div className="field" style={{ marginTop: '12px' }}>
              <label htmlFor="prod-extra">Extra price per kg after final slab (₹)</label>
              <input
                id="prod-extra"
                type="number"
                min=".01"
                step=".01"
                placeholder="e.g. 50"
                value={extra ? extra / 100 : ''}
                required
                onChange={e => setExtra(Math.round(Number(e.target.value) * 100))}
              />
            </div>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <label htmlFor="prod-active" style={{ fontSize: '13px', cursor: 'pointer' }}>Active — visible to all outlets</label>
          <div className="row" style={{ gap: '12px' }}>
            <Badge tone={active ? 'on' : 'off'}>{active ? 'On' : 'Off'}</Badge>
            <Toggle id="prod-active" checked={active} onChange={setActive} aria-label="Active" />
          </div>
        </div>

        {(error || saveError) && (
          <p className="field-error" role="alert">
            {error || saveError}
          </p>
        )}
      </form>
    </Dialog>
  );
}
