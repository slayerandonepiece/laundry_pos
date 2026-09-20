'use client';

import React, { useState, useRef, useEffect, type ReactNode } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
}

export interface MultiSelectDropdownProps {
  label: string;
  icon?: ReactNode;
  options: DropdownOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  allLabel?: string;
  className?: string;
}

export function MultiSelectDropdown({
  label,
  icon = '◫',
  options,
  selected,
  onChange,
  allLabel = 'All outlets',
  className = '',
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const wrapRef = useRef<HTMLDivElement>(null);

  const toggleOpen = () => {
    if (!open) {
      setDraft(selected);
    }
    setOpen((prev) => !prev);
  };

  // Click outside listener
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

  const allSelected = options.length > 0 && draft.length === options.length;

  const toggleAll = () => {
    if (allSelected) {
      setDraft([]);
    } else {
      setDraft(options.map((o) => o.value));
    }
  };

  const toggleOption = (val: string) => {
    if (draft.includes(val)) {
      setDraft(draft.filter((v) => v !== val));
    } else {
      setDraft([...draft, val]);
    }
  };

  const handleApply = () => {
    onChange(draft);
    setOpen(false);
  };

  const handleClear = () => {
    setDraft([]);
    onChange([]);
    setOpen(false);
  };

  const displayCountText = `${label} (${selected.length} of ${options.length})`;

  return (
    <div ref={wrapRef} className={`dropdown-wrap ${className}`.trim()}>
      <button
        type="button"
        className="switcher-trigger"
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {icon && <span>{icon}</span>}
        <span>{displayCountText}</span>
        <span style={{ fontSize: '10px', marginLeft: '2px' }}>▾</span>
      </button>

      {open && (
        <div className="dropdown-menu" role="listbox">
          <label className="dropdown-check-row">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
            />
            <span>{allLabel}</span>
          </label>
          <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />

          {options.map((opt) => {
            const isChecked = draft.includes(opt.value);
            return (
              <label key={opt.value} className="dropdown-check-row">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleOption(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            );
          })}

          <div className="dropdown-foot">
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 10px', fontSize: '12px' }}
              onClick={handleClear}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '6px 10px', fontSize: '12px' }}
              onClick={handleApply}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export interface SingleSelectDropdownProps {
  label?: string;
  icon?: ReactNode;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SingleSelectDropdown({
  label,
  icon,
  options,
  value,
  onChange,
  className = '',
}: SingleSelectDropdownProps) {
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

  const selectedOpt = options.find((o) => o.value === value);
  const displayText = selectedOpt?.label || label || 'Select';

  return (
    <div ref={wrapRef} className={`dropdown-wrap ${className}`.trim()}>
      <button
        type="button"
        className="switcher-trigger"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {icon && <span>{icon}</span>}
        <span>{displayText}</span>
        <span style={{ fontSize: '10px', marginLeft: '2px' }}>▾</span>
      </button>

      {open && (
        <div className="dropdown-menu" role="listbox">
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <div
                key={opt.value}
                className={`dropdown-radio-row ${isActive ? 'active' : ''}`.trim()}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                role="option"
                aria-selected={isActive}
              >
                <span>{opt.label}</span>
                {isActive && <span style={{ color: 'var(--brand-ink)', fontWeight: 700 }}>✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
