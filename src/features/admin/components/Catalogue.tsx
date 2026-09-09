import type { Product } from '../admin.types';
import { money } from '../admin.data';
import { Badge, Button, Empty } from './Primitives';
export type CatalogueView = 'grid' | 'list';
interface Props { products: Product[]; search: string; view: CatalogueView; readOnly?: boolean; onView: (view: CatalogueView) => void; onSearch: (search: string) => void; onEdit: (product: Product) => void; onNew: () => void }
const needsUnit = (product: Product) => ['comfort', 'dettol'].includes(product.id);
function Pricing({ product }: { product: Product }) {
  return product.type === 'item' ? <p><strong>{money(product.price)}</strong> {needsUnit(product) ? '· unit to be confirmed' : '/ piece'}</p> : <div className="ad-slab-preview">{product.slabs.map(slab => <span key={slab.limit}>Up to {slab.limit} kg <strong>{money(slab.price)}</strong></span>)}<span>Extra kg <strong>{money(product.extra)}</strong></span></div>;
}
export default function Catalogue({ products, search, view, readOnly = false, onView, onSearch, onEdit, onNew }: Props) {
  const ProductCard = readOnly ? 'article' : 'button';
  const hasUnitToConfirm = products.some(product => !product.active && needsUnit(product));
  return <section className="ad-card ad-catalogue">
    <div className="ad-card-heading"><div><h2>Service catalogue <span className="ad-count">{products.length}</span></h2><p>{readOnly ? 'Service prices for new orders. Contact the owner for changes.' : 'Manage services and their pricing.'}</p></div>{!readOnly && <Button onClick={onNew}>＋ Add product</Button>}</div>
    <div className="ad-toolbar ad-catalogue-toolbar"><input aria-label="Search products" placeholder="Search by service or category…" value={search} onChange={event => onSearch(event.target.value)}/><div className="ad-view-switch" role="group" aria-label="Product view">{(['grid', 'list'] as const).map(mode => <button key={mode} aria-pressed={view === mode} onClick={() => onView(mode)}><span aria-hidden="true">{mode === 'grid' ? '▦' : '☷'}</span> {mode === 'grid' ? 'Grid' : 'List'}</button>)}</div></div>
    {view === 'list' ? <div className="ad-table-wrap" tabIndex={0} role="region" aria-label="Service catalogue table"><table className="ad-table ad-product-table"><thead><tr><th>ID</th><th>Service</th><th>Category</th><th>Pricing</th><th>Status</th>{!readOnly && <th>Action</th>}</tr></thead><tbody>{products.map(product => <tr key={product.id}><td>{product.id}</td><td><strong>{product.name}</strong></td><td>{product.category}</td><td><Pricing product={product}/></td><td><Badge>{product.active ? 'Active' : needsUnit(product) ? 'Confirm unit' : 'Archived'}</Badge></td>{!readOnly && <td><button className="ad-order-link" aria-label={'Edit ' + product.name} onClick={() => onEdit(product)}>Edit ↗</button></td>}</tr>)}</tbody></table></div> : <div className="ad-products">{products.map(product => <ProductCard className={'ad-product ' + (product.type === 'weight' ? 'weighted' : '') + (readOnly ? ' ad-product-readonly' : '')} key={product.id} onClick={readOnly ? undefined : () => onEdit(product)} aria-label={readOnly ? undefined : 'Edit ' + product.name}>
      <div className="ad-product-top"><span className="ad-product-symbol" aria-hidden="true">{product.type === 'weight' ? '◎' : '◇'}</span><Badge>{product.active ? 'Active' : needsUnit(product) ? 'Confirm unit' : 'Archived'}</Badge></div>
      <div className="ad-product-title"><small>{product.category} · {product.type === 'weight' ? 'By weight' : needsUnit(product) ? 'Unit to be confirmed' : 'Per item'}</small><h3>{product.name}</h3></div>
      <div className="ad-product-pricing"><Pricing product={product}/></div>{!readOnly && <span className="ad-product-edit">Edit pricing ↗</span>}
    </ProductCard>)}</div>}
    {!products.length && <Empty text={search ? 'No services match this search.' : readOnly ? 'No services available yet. Ask the owner to add one.' : 'Add your first service to start taking orders.'}/>}
    {hasUnitToConfirm && <p className="ad-help">Comfort and Dettol need their charging unit confirmed before billing.</p>}
  </section>;
}
