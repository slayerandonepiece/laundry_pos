'use client';

import type { ReactNode } from 'react';
import Icon from './Icon';

export interface FilterPill<T extends string = string> {
  value: T;
  label: string;
  /** Optional count shown after the label. */
  count?: number;
}

/**
 * Reusable filter bar used on list/table screens.
 * Renders filter pills on the left, a search input + optional extra tools on the right.
 */
export default function FilterBar<T extends string = string>({
  pills,
  active,
  onSelect,
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  searchLabel = 'Search',
  tools,
}: {
  pills: FilterPill<T>[];
  active: T;
  onSelect: (value: T) => void;
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  /** Extra controls rendered to the right of the search box (e.g. Export button). */
  tools?: ReactNode;
}) {
  return (
    <div className="filters">
      {pills.map(({ value, label, count }) => (
        <button
          key={value}
          type="button"
          className={'fpill' + (active === value ? ' on' : '')}
          onClick={() => onSelect(value)}
          aria-pressed={active === value}
        >
          {label}{count !== undefined ? ` ${count}` : ''}
        </button>
      ))}
      <span className="ftools">
        <span className="fsearch">
          <Icon name="search" size="s" />
          <input
            aria-label={searchLabel}
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            style={{ border: 0, background: 'transparent', padding: 0, height: 'auto', color: 'var(--ink)' }}
          />
        </span>
        {tools}
      </span>
    </div>
  );
}
