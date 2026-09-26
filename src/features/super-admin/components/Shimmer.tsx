'use client';

import type { CSSProperties } from 'react';

export function ShimmerBlock({
  width = '100%',
  height = 18,
  borderRadius = 6,
  style,
  className = '',
}: {
  width?: string | number;
  height?: string | number;
  borderRadius?: number | string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`shimmer ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`stats cols-${count === 5 ? '5' : count === 3 ? '3' : '4'}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div className="stat" key={i} style={{ minHeight: 92 }}>
          <div className="stat-top">
            <ShimmerBlock width={110} height={14} />
            <ShimmerBlock width={24} height={24} borderRadius={12} />
          </div>
          <ShimmerBlock width={140} height={28} style={{ margin: '8px 0 6px' }} />
          <ShimmerBlock width={160} height={12} />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="tablecard">
      <div style={{ overflowX: 'auto', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          {Array.from({ length: cols }).map((_, i) => (
            <ShimmerBlock key={i} width={i === 0 ? '25%' : '15%'} height={14} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '14px 0',
              borderTop: '1px solid var(--line)',
            }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <ShimmerBlock
                key={c}
                width={c === 0 ? '25%' : '15%'}
                height={16}
                borderRadius={4}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TimelineSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="card">
      <div className="card-body" style={{ padding: '20px 24px' }}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'flex-start',
              padding: '16px 0',
              borderBottom: i < count - 1 ? '1px solid var(--line)' : 'none',
            }}
          >
            <ShimmerBlock width={32} height={32} borderRadius={16} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ShimmerBlock width="60%" height={16} />
              <ShimmerBlock width="35%" height={12} />
            </div>
            <ShimmerBlock width={80} height={12} style={{ flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TabContentSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'toastsb .15s ease-out' }}>
      <div className="card">
        <div className="card-head">
          <ShimmerBlock width={180} height={18} />
        </div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <ShimmerBlock height={40} />
          <ShimmerBlock height={40} />
          <ShimmerBlock height={40} />
          <ShimmerBlock height={40} />
        </div>
      </div>
      <TableSkeleton rows={4} cols={5} />
    </div>
  );
}
