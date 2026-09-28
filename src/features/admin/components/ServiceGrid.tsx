import type { Product } from '../admin.types';
import { money, price } from '../admin.data';
import { Empty } from './Primitives';

export default function ServiceGrid({ products, categories, query, category, quantities, onQuery, onCategory, onAdd, onIncrement, onDecrement, onRemove, onClear }: {
  products: Product[]; categories: string[]; query: string; category: string;
  quantities: Record<string, number>;
  onQuery: (value: string) => void; onCategory: (value: string) => void; onAdd: (product: Product) => void;
  onClear: () => void; onRemove: (product: Product) => void; onIncrement: (product: Product) => void; onDecrement: (product: Product) => void;
}) {
  return <section className="ad-pos-catalogue" aria-label="Choose services">
    <div className="ad-pos-search"><h2>Choose services</h2><button type="button" className="ad-text-link" onClick={onClear}>Clear</button><input aria-label="Search services" placeholder="Find a service…" value={query} onChange={e => onQuery(e.target.value)}/></div>
    <div className="ad-category-tabs" aria-label="Service categories">{['All', ...categories].map(value => <button key={value} aria-pressed={category === value} onClick={() => onCategory(value)}>{value}</button>)}</div>
    <div className="ad-pos-products">{products.map(product => { const selected = quantities[product.id] || 0; return <article className={'ad-pos-product ' + (selected ? 'selected' : '')} key={product.id}>
      <span className="ad-pos-service-icon" aria-hidden="true">{product.type === 'weight' ? '◎' : '◇'}</span><small>{product.category}</small><h3>{product.name}</h3>
      {product.type === 'item' ? <p><strong>{money(product.price)}</strong> / piece</p> : <div className="ad-pos-slabs">{product.slabs.map(slab => <span key={slab.limit}>Up to {slab.limit} kg <strong>{money(slab.price)}</strong></span>)}<span>Extra / kg <strong>{money(product.extra)}</strong></span></div>}
      {product.type === 'weight' ? <button className={'ad-button ' + (selected ? 'ad-selected-weight' : 'ad-secondary')} aria-label={(selected ? 'Edit weight for ' : 'Add ') + product.name} onClick={() => onAdd(product)}>{selected ? `${selected} kg · Edit weight` : '＋ Add'}</button> : selected ? <div className="ad-quantity-stepper" aria-label={product.name + ' quantity'}><button type="button" onClick={() => onDecrement(product)} aria-label={'Remove one ' + product.name}>−</button><strong aria-live="polite">{selected}</strong><button type="button" onClick={() => onIncrement(product)} aria-label={'Add one ' + product.name}>＋</button></div> : <button className="ad-button ad-secondary" aria-label={'Add ' + product.name} onClick={() => onAdd(product)}>＋ Add</button>}
      {selected > 0 && <div className="ad-service-selected-total"><strong>{money(price(product, selected))}</strong><button type="button" className="ad-text-link" aria-label={'Remove ' + product.name} onClick={() => onRemove(product)}>Remove</button></div>}
    </article>})}</div>{!products.length && <Empty text="No available services match. Try another search or category."/>}
  </section>;
}
