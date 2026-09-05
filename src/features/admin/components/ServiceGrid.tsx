import type { Product } from '../admin.types';
import { money } from '../admin.data';
import { Empty } from './Primitives';

export default function ServiceGrid({ products, categories, query, category, onQuery, onCategory, onAdd }: {
  products: Product[]; categories: string[]; query: string; category: string;
  onQuery: (value: string) => void; onCategory: (value: string) => void; onAdd: (product: Product) => void;
}) {
  return <section className="ad-pos-catalogue" aria-label="Choose services">
    <div className="ad-pos-search"><h2>Choose services</h2><input aria-label="Search services" placeholder="Find a service…" value={query} onChange={e => onQuery(e.target.value)}/></div>
    <div className="ad-category-tabs" aria-label="Service categories">{['All', ...categories].map(value => <button key={value} aria-pressed={category === value} onClick={() => onCategory(value)}>{value}</button>)}</div>
    <div className="ad-pos-products">{products.map(product => <article className="ad-pos-product" key={product.id}>
      <span className="ad-pos-service-icon" aria-hidden="true">{product.type === 'weight' ? '◎' : '◇'}</span><small>{product.category}</small><h3>{product.name}</h3>
      {product.type === 'item' ? <p><strong>{money(product.price)}</strong> / piece</p> : <div className="ad-pos-slabs">{product.slabs.map(slab => <span key={slab.limit}>Up to {slab.limit} kg <strong>{money(slab.price)}</strong></span>)}<span>Extra / kg <strong>{money(product.extra)}</strong></span></div>}
      <button className="ad-button ad-secondary" aria-label={'Add ' + product.name} onClick={() => onAdd(product)}>＋ Add</button>
    </article>)}</div>{!products.length && <Empty text="No available services match. Try another search or category."/>}
  </section>;
}
