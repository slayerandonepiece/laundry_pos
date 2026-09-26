import type { Product } from '../admin.types';
import { money } from '../admin.data';
import { Badge, Pill, ErrorBanner, EmptyState, Card, CardHeading } from '@/features/admin/components/ui';

export type CatalogueView = 'grid' | 'list';

interface Props {
  products: Product[];
  search: string;
  view: CatalogueView;
  readOnly?: boolean;
  onView: (view: CatalogueView) => void;
  onSearch: (search: string) => void;
  onEdit: (product: Product) => void;
  onNew: () => void;
}

const needsUnit = (product: Product) => ['comfort', 'dettol'].includes(product.id);

function Pricing({ product }: { product: Product }) {
  return product.type === 'item' ? (
    <p><strong>{money(product.price)}</strong> {needsUnit(product) ? '· unit to be confirmed' : '/ piece'}</p>
  ) : (
    <div className="ad-slab-preview">
      {product.slabs.map(slab => (
        <span key={slab.limit}>Up to {slab.limit} kg <strong>{money(slab.price)}</strong></span>
      ))}
      <span>Extra kg <strong>{money(product.extra)}</strong></span>
    </div>
  );
}

export default function Catalogue({
  products,
  search,
  view,
  readOnly = false,
  onView,
  onSearch,
  onEdit,
  onNew
}: Props) {
  const isFiltered = search.trim().length > 0;
  const hasUnitToConfirm = products.some(product => !product.active && needsUnit(product));

  return (
    <div className="ad-catalogue soa">
      <ErrorBanner variant="info">
        Services are organization-wide — any change applies at every outlet.
      </ErrorBanner>

      <Card className="mt-4">
        <CardHeading 
          title={`Service catalogue (${products.length})`}
          subtitle={readOnly ? 'Service prices for new orders. Contact the owner for changes.' : 'Manage services and their pricing.'}
          action={!readOnly && <button type="button" className="ad-button" onClick={onNew}>＋ Add service</button>}
        />
        
        <div className="ad-toolbar ad-catalogue-toolbar" style={{ display: 'flex', gap: '12px', alignItems: 'center', margin: '16px 0' }}>
          <input 
            type="search"
            aria-label="Search products" 
            placeholder="Search by service or category…" 
            value={search} 
            onChange={event => onSearch(event.target.value)}
            style={{ flex: 1, maxWidth: '300px' }}
          />
          <div role="group" aria-label="Product view" style={{ display: 'flex', gap: '4px' }}>
            {(['grid', 'list'] as const).map(mode => (
              <Pill key={mode} active={view === mode} onClick={() => onView(mode)}>
                {mode === 'grid' ? 'Grid' : 'List'}
              </Pill>
            ))}
          </div>
        </div>

        {products.length === 0 ? (
          <EmptyState 
            isFiltered={isFiltered}
            firstUseTitle="No services yet"
            firstUseDescription="Add your first service to start taking orders."
            firstUseAction={!readOnly ? <button type="button" className="ad-button" onClick={onNew}>＋ Add service</button> : undefined}
            filteredTitle="No matching services"
            filteredDescription="Try adjusting your search terms to find what you are looking for."
          />
        ) : view === 'list' ? (
          <div className="ad-table-wrap" tabIndex={0} role="region" aria-label="Service catalogue table">
            <table className="ad-table ad-product-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Service</th>
                  <th>Category</th>
                  <th>Pricing</th>
                  <th>Status</th>
                  {!readOnly && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {products.map(product => (
                  <tr key={product.id}>
                    <td>{product.id}</td>
                    <td><strong>{product.name}</strong></td>
                    <td>{product.category}</td>
                    <td><Pricing product={product}/></td>
                    <td>
                      <Badge tone={product.active ? 'on' : needsUnit(product) ? 'warn' : 'off'}>
                        {product.active ? 'Active' : needsUnit(product) ? 'Confirm unit' : 'Inactive'}
                      </Badge>
                    </td>
                    {!readOnly && (
                      <td>
                        <button type="button" className="ad-order-link" aria-label={'Edit ' + product.name} onClick={() => onEdit(product)}>
                          Edit ↗
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ad-products" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {products.map(product => {
              const ProductCard = readOnly ? 'article' : 'button';
              return (
                <ProductCard 
                  className={'ad-product ' + (product.type === 'weight' ? 'weighted' : '') + (readOnly ? ' ad-product-readonly' : '')} 
                  key={product.id} 
                  onClick={readOnly ? undefined : () => onEdit(product)} 
                  aria-label={readOnly ? undefined : 'Edit ' + product.name}
                  style={{ textAlign: 'left', display: 'block', width: '100%' }}
                >
                  <div className="ad-product-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="ad-product-symbol" aria-hidden="true">{product.type === 'weight' ? '◎' : '◇'}</span>
                    <Badge tone={product.active ? 'on' : needsUnit(product) ? 'warn' : 'off'}>
                      {product.active ? 'Active' : needsUnit(product) ? 'Confirm unit' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="ad-product-title">
                    <small>{product.category} · {product.type === 'weight' ? 'By weight' : needsUnit(product) ? 'Unit to be confirmed' : 'Per item'}</small>
                    <h3>{product.name}</h3>
                  </div>
                  <div className="ad-product-pricing">
                    <Pricing product={product}/>
                  </div>
                  {!readOnly && <span className="ad-product-edit" style={{ display: 'inline-block', marginTop: '12px', color: '#0066cc' }}>Edit pricing ↗</span>}
                </ProductCard>
              );
            })}
          </div>
        )}
      </Card>
      {hasUnitToConfirm && <p className="ad-help" style={{ marginTop: '12px' }}>Comfort and Dettol need their charging unit confirmed before billing.</p>}
    </div>
  );
}
