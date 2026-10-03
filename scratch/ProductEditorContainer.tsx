'use client';
import { useState } from 'react';
import type { Product, WeightProduct } from '../admin.types';
import { money, price } from '../admin.data';
import { Dialog, Badge, Toggle } from '@/features/admin/components/ui';

export default function ProductEditorContainer({ 
  product, 
  error: saveError, 
  onSave 
}: { 
  product?: Product; 
  error?: string; 
  onSave: (p: Product) => void 
}) {
  const [kind, setKind] = useState(product?.type || 'item');
  const [slabs, setSlabs] = useState<{limit: number; price: number}[]>(
    product?.type === 'weight' ? product.slabs : [{ limit: 4, price: 27900 }, { limit: 6, price: 37900 }]
  );
  const [extra, setExtra] = useState(product?.type === 'weight' ? product.extra : 4900);
  const [unit, setUnit] = useState(product?.type === 'item' ? product.price : 0);
  const [weight, setWeight] = useState(product?.type === 'weight' ? 6.5 : 1);
  const [error, setError] = useState('');
  const [active, setActive] = useState(product?.active ?? true);
  const [name, setName] = useState(product?.name || '');
  const [category, setCategory] = useState(product?.category || 'Laundry');

  const pricing = kind === 'weight' ? { type: 'weight' as const, slabs, extra } : { type: 'item' as const, price: unit };
  const preview = { id: '', name: name || 'Preview', active, category, ...pricing } as Product;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter a service name.');
    if (kind === 'weight' && (slabs.length === 0 || slabs.some((s, i) => s.limit <= (slabs[i - 1]?.limit || 0) || s.price <= 0))) {
      return setError('Slab limits must increase and prices must be positive.');
    }
    onSave({ 
      id: product?.id || crypto.randomUUID(), 
      name: name.trim(), 
      category, 
      active, 
      ...pricing 
    } as Product);
  };

  return (
    <Dialog 
      isOpen={true} 
      onClose={() => {}} // Controlled by AdminScreenContainer panel closing
      title={product ? 'Edit service' : 'Add service'} 
      warnOnChanges={true}
    >
      <form id="product-form" className="ad-form soa" onSubmit={handleSubmit}>
        <label>
          Service name
          <input 
            name="name" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="e.g. Wash & Fold"
            required
          />
        </label>

        <div className="ad-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <label>
            Category
            <select name="category" value={category} onChange={e => setCategory(e.target.value)}>
              {['Laundry', 'Dry cleaning', 'Ironing', 'Home fabrics', 'Add-on'].map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Charging type
            <select value={kind} onChange={e => { 
              const next = e.target.value as 'item' | 'weight'; 
              setKind(next); 
              setWeight(next === 'item' ? 1 : 6.5); 
            }}>
              <option value="item">Per item</option>
              <option value="weight">By weight</option>
            </select>
          </label>
        </div>

        {kind === 'item' ? (
          <label>
            Price per piece (₹)
            <input 
              type="number" 
              min=".01" 
              step=".01" 
              required 
              value={unit ? unit / 100 : ''} 
              onChange={e => setUnit(Math.round(Number(e.target.value) * 100))}
            />
          </label>
        ) : (
          <>
            <div style={{ marginTop: '16px' }}>
              <h3 style={{ fontSize: '14px', marginBottom: '4px' }}>Pricing slabs</h3>
              <p className="ad-help" style={{ marginBottom: '12px' }}>Each price is the total for that weight band, not a rate per kilogram.</p>
              
              {slabs.map((s, i) => (
                <div className="ad-slab-row" key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label>
                      <span style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
                        Over {slabs[i - 1]?.limit || 0} kg up to
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="number" 
                          step=".01" 
                          min=".01" 
                          value={s.limit || ''} 
                          required 
                          onChange={e => setSlabs(slabs.map((v, j) => j === i ? { ...v, limit: Number(e.target.value) } : v))}
                          style={{ width: '100px' }}
                        />
                        <span>kg</span>
                      </div>
                    </label>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>
                      <span style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Price (₹)</span>
                      <input 
                        type="number" 
                        min=".01" 
                        step=".01" 
                        value={s.price ? s.price / 100 : ''} 
                        required 
                        onChange={e => setSlabs(slabs.map((v, j) => j === i ? { ...v, price: Math.round(Number(e.target.value) * 100) } : v))}
                      />
                    </label>
                  </div>
                  <button 
                    type="button" 
                    className="ad-icon-button" 
                    data-dirty 
                    aria-label="Remove slab" 
                    onClick={() => setSlabs(slabs.filter((_, j) => j !== i))}
                    style={{ padding: '8px', cursor: 'pointer', background: 'none', border: 'none', fontSize: '18px' }}
                  >
                    ×
                  </button>
                </div>
              ))}
              
              <button 
                type="button" 
                className="ad-button" 
                style={{ background: 'transparent', color: '#0066cc', border: '1px solid #0066cc', padding: '6px 12px', fontSize: '13px' }}
                data-dirty 
                onClick={() => setSlabs([...slabs, { limit: (slabs.at(-1)?.limit || 0) + 2, price: (slabs.at(-1)?.price || 0) + 10000 }])}
              >
                ＋ Add price slab
              </button>

              <div style={{ marginTop: '16px' }}>
                <label>
                  <span style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Additional price per kg after final slab (₹)</span>
                  <input 
                    type="number" 
                    min=".01" 
                    step=".01" 
                    value={extra ? extra / 100 : ''} 
                    required 
                    onChange={e => setExtra(Math.round(Number(e.target.value) * 100))}
                  />
                </label>
              </div>
            </div>
          </>
        )}
        
        <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #eee' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '14px' }}>Status</h3>
            <p className="ad-help">Active services are visible to all outlets.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Badge tone={active ? 'on' : 'off'}>{active ? 'Active' : 'Inactive'}</Badge>
            <Toggle checked={active} onChange={setActive} aria-label="Service active status" />
          </div>
        </div>

        {(error || saveError) && (
          <p className="ad-error" role="alert" style={{ color: '#cc0000', marginTop: '16px' }}>
            {error || saveError}
          </p>
        )}

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" form="product-form" className="ad-button" style={{ background: '#0066cc', color: 'white', padding: '8px 16px', borderRadius: '4px', border: 'none' }}>
            Save service
          </button>
        </div>
      </form>
    </Dialog>
  );
}
