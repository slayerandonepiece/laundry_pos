import React from 'react';
import { Card } from './ui';

export function TableLoading({
  hasStats = false,
  cols = 5,
  rows = 6,
  hasSearch = true,
}: {
  hasStats?: boolean;
  cols?: number;
  rows?: number;
  hasSearch?: boolean;
}) {
  return (
    <div className="workspace-loading" role="status" aria-label="Loading content" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="ad-page-heading" style={{ margin: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '240px' }}>
          <div className="shimmer line" style={{ height: '26px', width: '150px' }} />
          <div className="shimmer line" style={{ height: '14px', width: '220px' }} />
        </div>
      </div>

      {hasStats && (
        <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="shimmer tile" style={{ height: '74px' }} />
          ))}
        </div>
      )}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className="shimmer line" style={{ height: '18px', width: '180px' }} />
            <div className="shimmer line" style={{ height: '13px', width: '240px' }} />
          </div>
          <div className="shimmer" style={{ height: '36px', width: '110px', borderRadius: '8px' }} />
        </div>

        {hasSearch && (
          <div className="row" style={{ marginBottom: '8px' }}>
            <div className="shimmer" style={{ height: '36px', width: '280px', borderRadius: '8px' }} />
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="grid">
            <thead>
              <tr>
                {Array.from({ length: cols }, (_, i) => (
                  <th key={i}>
                    <div className="shimmer line" style={{ height: '12px', width: i === 0 ? '70px' : i === cols - 1 ? '40px' : '90px' }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} style={c === cols - 1 ? { textAlign: 'right' } : undefined}>
                      <div
                        className="shimmer line"
                        style={{
                          height: '14px',
                          width: c === 0 ? '75%' : c === cols - 1 ? '50px' : '65%',
                          display: c === cols - 1 ? 'inline-block' : 'block',
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function CardLoading() {
  return (
    <div className="workspace-loading workspace-card-loading" role="status" aria-label="Loading content" aria-busy="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="shimmer workspace-loading-card" aria-hidden="true" />
      ))}
    </div>
  );
}

export function ResponsiveListLoading({ hasStats = false, cols = 5, rows = 6 }: { hasStats?: boolean; cols?: number; rows?: number }) {
  return (
    <>
      <div className="workspace-loading-desktop"><TableLoading hasStats={hasStats} cols={cols} rows={rows} /></div>
      <div className="workspace-loading-mobile"><CardLoading /></div>
    </>
  );
}

export function ProfileLoading() {
  return (
    <div className="workspace-loading" role="status" aria-label="Loading profile" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="ad-page-heading" style={{ margin: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '240px' }}>
          <div className="shimmer line" style={{ height: '26px', width: '120px' }} />
          <div className="shimmer line" style={{ height: '14px', width: '200px' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="shimmer line" style={{ height: '18px', width: '140px' }} />
              <div className="shimmer" style={{ height: '32px', width: '60px', borderRadius: '6px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="shimmer line" style={{ height: '30px' }} />
              <div className="shimmer line" style={{ height: '30px' }} />
              <div className="shimmer line" style={{ height: '30px' }} />
            </div>
          </Card>
          <Card>
            <div className="shimmer line" style={{ height: '18px', width: '100px', marginBottom: '12px' }} />
            <div className="shimmer line" style={{ height: '24px', width: '60%' }} />
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <Card>
            <div className="shimmer line" style={{ height: '18px', width: '150px', marginBottom: '16px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="shimmer line" style={{ height: '36px' }} />
              <div className="shimmer line" style={{ height: '36px' }} />
            </div>
          </Card>
          <Card>
            <div className="shimmer line" style={{ height: '18px', width: '100px', marginBottom: '14px' }} />
            <div className="shimmer row" style={{ height: '80px' }} />
          </Card>
        </div>
      </div>
    </div>
  );
}

export function OutletDetailLoading() {
  return (
    <div className="workspace-loading" role="status" aria-label="Loading outlet" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="shimmer line" style={{ height: '14px', width: '120px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div className="shimmer" style={{ width: '46px', height: '46px', borderRadius: '12px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div className="shimmer line" style={{ height: '22px', width: '180px' }} />
          <div className="shimmer line" style={{ height: '13px', width: '140px' }} />
        </div>
      </div>

      <div className="ad-outlet-detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Card>
            <div className="shimmer line" style={{ height: '18px', width: '140px', marginBottom: '12px' }} />
            <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div className="shimmer tile" style={{ height: '70px' }} />
              <div className="shimmer tile" style={{ height: '70px' }} />
              <div className="shimmer tile" style={{ height: '70px' }} />
            </div>
          </Card>
          <Card>
            <div className="shimmer line" style={{ height: '18px', width: '160px', marginBottom: '12px' }} />
            <div className="shimmer" style={{ height: '170px' }} />
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Card>
            <div className="shimmer line" style={{ height: '18px', width: '120px', marginBottom: '12px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="shimmer line" style={{ height: '24px' }} />
              <div className="shimmer line" style={{ height: '24px' }} />
              <div className="shimmer line" style={{ height: '24px' }} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
