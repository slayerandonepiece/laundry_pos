import React, { type ReactNode } from 'react';

/* --- Shimmers --- */

export function ShimmerRow({ count = 1, className = '' }: { count?: number; className?: string }) {
  if (count <= 1) {
    return <div className={`shimmer row ${className}`.trim()} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`shimmer row ${className}`.trim()} />
      ))}
    </div>
  );
}

export function ShimmerLine({ className = '' }: { className?: string }) {
  return <div className={`shimmer line ${className}`.trim()} />;
}

export function ShimmerTile({ className = '' }: { className?: string }) {
  return <div className={`shimmer tile ${className}`.trim()} />;
}

/* --- Empty State --- */

export interface EmptyStateProps {
  isFiltered?: boolean;
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;

  // Specific copy overrides for first-use vs filtered-empty
  firstUseTitle?: string;
  firstUseDescription?: string;
  firstUseAction?: ReactNode;

  filteredTitle?: string;
  filteredDescription?: string;
  filteredAction?: ReactNode;

  className?: string;
}

export function EmptyState({
  isFiltered = false,
  icon = '◇',
  title,
  description,
  action,
  firstUseTitle = 'Nothing here yet',
  firstUseDescription = 'Get started by creating your first entry.',
  firstUseAction,
  filteredTitle = 'No matching records',
  filteredDescription = 'Try adjusting your filters or search terms to find what you are looking for.',
  filteredAction,
  className = '',
}: EmptyStateProps) {
  const resolvedTitle = isFiltered ? (filteredTitle || title) : (firstUseTitle || title);
  const resolvedDesc = isFiltered ? (filteredDescription || description) : (firstUseDescription || description);
  const resolvedAction = isFiltered ? (filteredAction !== undefined ? filteredAction : action) : (firstUseAction !== undefined ? firstUseAction : action);

  return (
    <div className={`empty-state ${className}`.trim()}>
      <span className="icon">{icon}</span>
      {resolvedTitle && <h3>{resolvedTitle}</h3>}
      {resolvedDesc && <p>{resolvedDesc}</p>}
      {resolvedAction && <div style={{ marginTop: '4px' }}>{resolvedAction}</div>}
    </div>
  );
}

/* --- Error & Info Banner --- */

export interface ErrorBannerProps {
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  variant?: 'error' | 'info';
  className?: string;
  children?: ReactNode;
}

export function ErrorBanner({
  message,
  onRetry,
  retryLabel = 'Retry',
  variant = 'error',
  className = '',
  children,
}: ErrorBannerProps) {
  const isInfo = variant === 'info';

  return (
    <div className={`error-banner ${isInfo ? 'info' : ''} ${className}`.trim()} role={isInfo ? 'status' : 'alert'}>
      <span>
        {isInfo ? 'ℹ ' : '⚠ '}
        {message || children || "Couldn't load this data. Check your connection and try again."}
      </span>
      {onRetry && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onRetry}
          style={{ fontSize: '12px', padding: '6px 12px' }}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/* --- Sentinel (Infinite scroll loader) --- */

export interface SentinelProps {
  loading?: boolean;
  label?: string;
  className?: string;
}

export function Sentinel({ loading = true, label = 'Loading more…', className = '' }: SentinelProps) {
  return (
    <div className={`sentinel ${className}`.trim()} aria-live="polite">
      {loading && <span className="spinner" />}
      <span>{label}</span>
    </div>
  );
}
