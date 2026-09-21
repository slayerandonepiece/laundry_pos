import type { Product } from '../admin.types';
import { money } from '../admin.data';
import { Badge, ErrorBanner, EmptyState, Card, CardHeading } from '@/features/admin/components/ui';

interface Props {
  products: Product[];
  search: string;
  readOnly?: boolean;
  onSearch: (search: string) => void;
  onEdit: (product: Product) => void;
  onNew: () => void;
}

const needsUnit = (product: Product) => ['comfort', 'dettol'].includes(product.id);

function Pricing({ product }: { product: Product }) {
  if (needsUnit(product)) return <span>Confirm unit</span>;

  return product.type === 'item' ? (
    <span><span className="mono">{money(product.price)}</span> / piece</span>
  ) : (
    <span>
      {product.slabs.map((slab, i) => (
        <span key={slab.limit}>{i > 0 && ' · '}Up to {slab.limit}kg <span className="mono">{money(slab.price)}</span></span>
      ))}
      {' · extra '}<span className="mono">{money(product.extra)}/kg</span>
    </span>
  );
}

export default function Catalogue({
  products,
  search,
  readOnly = false,
  onSearch,
  onEdit,
  onNew
}: Props) {
  const isFiltered = search.trim().length > 0;
  const hasUnitToConfirm = products.some(product => !product.active && needsUnit(product));

  return (
    <div className="catalogue">
      <ErrorBanner variant="info">
        Services are organization-wide — any change applies at every outlet.
      </ErrorBanner>

      <Card>
        <CardHeading
          title={`Service catalogue (${products.length})`}
          subtitle={readOnly ? 'Service prices for new orders. Contact the owner for changes.' : 'Manage services and their pricing.'}
          action={!readOnly && <button type="button" className="btn btn-primary" onClick={onNew}>＋ Add service</button>}
        />

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <input
            type="search"
            className="search-input"
            aria-label="Search products"
            placeholder="Search by service or category…"
            value={search}
            onChange={event => onSearch(event.target.value)}
            style={{ minWidth: '280px' }}
          />
        </div>

        {products.length === 0 ? (
          <EmptyState
            isFiltered={isFiltered}
            firstUseTitle="No services yet"
            firstUseDescription="Add your first service to start taking orders."
            firstUseAction={!readOnly ? <button type="button" className="btn btn-primary" onClick={onNew}>＋ Add service</button> : undefined}
            filteredTitle="No matching services"
            filteredDescription="Try adjusting your search terms to find what you are looking for."
          />
        ) : (
          <>
            <div className="catalogue-table-wrap" tabIndex={0} role="region" aria-label="Service catalogue table">
              <table className="grid">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Service</th>
                    <th>Category</th>
                    <th>Pricing</th>
                    <th>Status</th>
                    {!readOnly && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.id}>
                      <td className="mono">{product.id}</td>
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
                          <button type="button" className="btn btn-secondary" aria-label={'Edit ' + product.name} onClick={() => onEdit(product)}>
                            Edit ↗
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="catalogue-cards">
              {products.map(product => {
                const ProductCard = readOnly ? 'article' : 'button';
                return (
                  <ProductCard
                    key={product.id}
                    className="catalogue-card"
                    onClick={readOnly ? undefined : () => onEdit(product)}
                    aria-label={readOnly ? undefined : 'Edit ' + product.name}
                  >
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{product.name}</strong>
                      <Badge tone={product.active ? 'on' : needsUnit(product) ? 'warn' : 'off'}>
                        {product.active ? 'Active' : needsUnit(product) ? 'Confirm unit' : 'Inactive'}
                      </Badge>
                    </div>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>{product.id} · {product.category}</span>
                    <Pricing product={product}/>
                    {!readOnly && <span className="catalogue-card-edit">Edit ↗</span>}
                  </ProductCard>
                );
              })}
            </div>
          </>
        )}
      </Card>
      {hasUnitToConfirm && (
        <p style={{ marginTop: '12px', fontSize: '11.5px', color: 'var(--muted)' }}>
          Comfort and Dettol need their charging unit confirmed before billing.
        </p>
      )}
    </div>
  );
}
