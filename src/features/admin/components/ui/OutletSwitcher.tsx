'use client';

import React from 'react';
import { useDropdownMenu } from './Dropdown';

export interface OutletOption {
  id: string;
  name: string;
  code?: string;
}

export interface OutletSwitcherProps {
  outlets: OutletOption[];
  selectedOutletId?: string | null; // null or 'ALL' represents all outlets
  onSelect: (outletId: string | null) => void;
  showAllOption?: boolean;
  allOptionLabel?: string;
  className?: string;
}

export function OutletSwitcher({
  outlets,
  selectedOutletId,
  onSelect,
  showAllOption = true,
  allOptionLabel = 'All outlets',
  className = '',
}: OutletSwitcherProps) {
  const { open, setOpen, close, menuId, wrapRef, triggerRef, menuRef, onKeyDown, onBlur } =
    useDropdownMenu();

  const isAllSelected = selectedOutletId === null || selectedOutletId === 'ALL';
  const activeOutlet = outlets.find((o) => o.id === selectedOutletId);

  const displayLabel = isAllSelected
    ? allOptionLabel
    : activeOutlet?.name || outlets[0]?.name || 'Select outlet';

  return (
    <div
      ref={wrapRef}
      className={`dropdown-wrap ${className}`.trim()}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <button
        ref={triggerRef}
        type="button"
        className="switcher-trigger"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Outlet: ${displayLabel}`}
        title={displayLabel}
      >
        <span aria-hidden="true">📍</span>
        <span className="switcher-value">{displayLabel}</span>
        <svg className="switcher-caret" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>

      {open && (
        <div ref={menuRef} id={menuId} className="switcher-menu" role="listbox" aria-label="Outlets">
          {showAllOption && (
            <button
              type="button"
              className={`switcher-option ${isAllSelected ? 'active' : ''}`.trim()}
              onClick={() => {
                onSelect(null);
                close(true);
              }}
              role="option"
              aria-selected={isAllSelected}
              data-dropdown-item
            >
              <span>{allOptionLabel}</span>
              {isAllSelected && <span aria-hidden="true">✓</span>}
            </button>
          )}

          {outlets.map((outlet) => {
            const isActive = !isAllSelected && selectedOutletId === outlet.id;
            return (
              <button
                key={outlet.id}
                type="button"
                className={`switcher-option ${isActive ? 'active' : ''}`.trim()}
                onClick={() => {
                  onSelect(outlet.id);
                  close(true);
                }}
                role="option"
                aria-selected={isActive}
                data-dropdown-item
              >
                <span>{outlet.name}</span>
                {isActive && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default OutletSwitcher;
