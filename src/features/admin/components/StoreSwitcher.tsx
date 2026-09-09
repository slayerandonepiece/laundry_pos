'use client';
import { useEffect, useRef, useState } from 'react';
import type { StoreOption } from '@/server/auth/session';

// Header store selector (Item 2, .agents/2026-09-brainstorm-plan.md). Only
// ever rendered when the caller (AdminShell) has more than one store option —
// a single-store owner or any employee never sees this at all. A plain
// filter <input> over the option list, not a heavy combobox library — this
// app has at most a handful of stores per owner in practice, and the spec
// only asks for "searchable", not autocomplete/keyboard-nav semantics.
export default function StoreSwitcher({
  options,
  selectedStoreId,
  allStoresSelected,
  showAllStoresOption,
  onSelectStore,
  onSelectAllStores,
}: {
  options: StoreOption[];
  selectedStoreId?: string;
  allStoresSelected?: boolean;
  showAllStoresOption: boolean;
  onSelectStore: (storeId: string) => void;
  onSelectAllStores?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) { setOpen(false); setQuery(''); }
    }
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [open]);

  const currentLabel = allStoresSelected ? 'All stores' : options.find(option => option.storeId === selectedStoreId)?.storeName ?? 'Select store';
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery ? options.filter(option => option.storeName.toLowerCase().includes(normalizedQuery)) : options;

  return (
    <div className="ad-store-switcher" ref={rootRef}>
      <button type="button" className="ad-store-switcher-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <span aria-hidden="true">⇄</span>
        <span className="ad-store-switcher-label">{currentLabel}</span>
      </button>
      {open && (
        <div className="ad-store-switcher-menu" role="listbox">
          {options.length > 6 && (
            <input
              autoFocus
              className="ad-store-switcher-search"
              placeholder="Search stores…"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          )}
          {showAllStoresOption && (
            <button
              type="button"
              role="option"
              aria-selected={Boolean(allStoresSelected)}
              className={'ad-store-switcher-option' + (allStoresSelected ? ' active' : '')}
              onClick={() => { onSelectAllStores?.(); setOpen(false); setQuery(''); }}
            >
              All stores
            </button>
          )}
          {filtered.map(option => (
            <button
              key={option.storeId}
              type="button"
              role="option"
              aria-selected={!allStoresSelected && option.storeId === selectedStoreId}
              className={'ad-store-switcher-option' + (!allStoresSelected && option.storeId === selectedStoreId ? ' active' : '')}
              onClick={() => { onSelectStore(option.storeId); setOpen(false); setQuery(''); }}
            >
              {option.storeName}
            </button>
          ))}
          {filtered.length === 0 && <p className="ad-store-switcher-empty">No stores match.</p>}
        </div>
      )}
    </div>
  );
}
