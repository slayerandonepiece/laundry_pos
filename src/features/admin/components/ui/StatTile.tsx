import React, { type ReactNode } from 'react';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
}

export function StatTile({ label, value, detail, className = '' }: StatTileProps) {
  return (
    <div className={`stat-tile ${className}`.trim()}>
      <span className="label">{label}</span>
      <span className="value mono">{value}</span>
      {detail && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{detail}</div>}
    </div>
  );
}

export interface StatsRowProps {
  children: ReactNode;
  className?: string;
}

export function StatsRow({ children, className = '' }: StatsRowProps) {
  return <div className={`stats-row ${className}`.trim()}>{children}</div>;
}

export default StatTile;
