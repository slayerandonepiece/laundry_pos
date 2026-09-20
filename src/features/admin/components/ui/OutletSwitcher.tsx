'use client';

import React, { useState, useRef, useEffect } from 'react';

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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const isAllSelected = selectedOutletId === null || selectedOutletId === 'ALL';
  const activeOutlet = outlets.find((o) => o.id === selectedOutletId);

  const displayLabel = isAllSelected
    ? allOptionLabel
    : activeOutlet?.name || outlets[0]?.name || 'Select outlet';

  return (
    <div ref={wrapRef} className={`dropdown-wrap ${className}`.trim()}>
      <button
        type="button"
        className="switcher-trigger"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>📍</span>
        <span>{displayLabel}</span>
        <span style={{ fontSize: '10px', marginLeft: '2px' }}>▾</span>
      </button>

      {open && (
        <div className="switcher-menu" role="listbox">
          {showAllOption && (
            <button
              type="button"
              className={`switcher-option ${isAllSelected ? 'active' : ''}`.trim()}
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              role="option"
              aria-selected={isAllSelected}
            >
              <span>{allOptionLabel}</span>
              {isAllSelected && <span>✓</span>}
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
                  setOpen(false);
                }}
                role="option"
                aria-selected={isActive}
              >
                <span>{outlet.name}</span>
                {isActive && <span>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default OutletSwitcher;
