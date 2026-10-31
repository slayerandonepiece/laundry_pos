import type { Product } from '../admin.types';
import { money, price } from '../admin.data';
import { Empty } from './Primitives';

// Service tiles for the counter. Tapping a piece service adds one; a weight
// service asks for its kilograms. Selected tiles show their running amount.
export default function ServiceGrid({ products, categories, query, category, quantities, onQuery, onCategory, onAdd, onIncrement, onDecrement }: {
  products: Product[]; categories: string[]; query: string; category: string;
  quantities: Record<string, number>;
  onQuery: (value: string) => void; onCategory: (value: string) => void; onAdd: (product: Product) => void;
  onIncrement: (product: Product) => void; onDecrement: (product: Product) => void;
}) {
  return <section className="ad-ctr-services" aria-label="Choose services">
    <div className="ad-ctr-toolbar">
      <div className="ad-category-tabs" aria-label="Service categories">{['All', ...categories].map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => onCategory(value)}>{value}</button>)}</div>
      <input type="search" aria-label="Search services" placeholder="Find a service…" value={query} onChange={e => onQuery(e.target.value)}/>
    </div>
    <div className="ad-ctr-tiles">{products.map(product => {
      const selected = quantities[product.id] || 0, weight = product.type === 'weight';
      const rate = weight ? `from ${money(Math.min(...product.slabs.map(slab => slab.price)))} · by kg` : `${money(product.price)} / piece`;
      return <article className={'ad-ctr-tile' + (selected ? ' selected' : '')} key={product.id}>
        <button type="button" className="ad-ctr-tile-main" onClick={() => weight ? onAdd(product) : onIncrement(product)}
          aria-label={weight ? (selected ? 'Edit weight for ' : 'Add ') + product.name : 'Add one ' + product.name}>
          <small>{product.category}</small>
          <b>{product.name}</b>
          <span className="ad-ctr-rate">{rate}</span>
          {selected
            ? <strong className="ad-ctr-tile-amount">{weight ? `${selected} kg` : `× ${selected}`} · {money(price(product, selected))}</strong>
            : <span className="ad-ctr-tile-add">＋ Add</span>}
        </button>
        {selected > 0 && !weight && <div className="ad-ctr-stepper" aria-label={product.name + ' quantity'}>
          <button type="button" onClick={() => onDecrement(product)} aria-label={'Remove one ' + product.name}>−</button>
          <strong aria-live="polite">{selected}</strong>
          <button type="button" onClick={() => onIncrement(product)} aria-label={'Add one ' + product.name}>＋</button>
        </div>}
      </article>;
    })}</div>
    {!products.length && <Empty text="No available services match. Try another search or category."/>}
  </section>;
}
