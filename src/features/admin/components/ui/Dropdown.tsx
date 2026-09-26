'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useId,
  useCallback,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type FocusEvent as ReactFocusEvent,
} from 'react';

export interface DropdownOption {
  value: string;
  label: string;
}

/** Fired on window when any workspace dropdown opens, so the others close. */
const OPEN_EVENT = 'ad-dropdown-open';
/** Page side gutter the popup must stay inside (matches the workspace's 16px mobile gutter). */
const VIEWPORT_GUTTER = 16;
const ITEM_SELECTOR = '[data-dropdown-item]';

function menuItems(menu: HTMLElement | null) {
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) : [];
}

/**
 * Shared open/close, positioning and keyboard behaviour for the workspace's
 * popup pickers (`MultiSelectDropdown`, `SingleSelectDropdown`, `OutletSwitcher`).
 *
 * - one popup open at a time; pointer-down outside or tabbing away closes it
 * - Escape closes and returns focus to the trigger (without closing an enclosing dialog)
 * - ArrowUp/ArrowDown/Home/End move between `[data-dropdown-item]` elements
 * - the popup is kept inside the viewport: right-aligned to the trigger when
 *   left-aligned would overflow, then clamped to the page gutter
 */
export function useDropdownMenu() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const menuId = `${id}-menu`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    const onOtherOpened = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener(OPEN_EVENT, onOtherOpened);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOtherOpened);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, id]);

  // Position inside the viewport, then move focus into the popup.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const wrap = wrapRef.current;
    if (!open || !menu || !wrap) return;
    menu.style.left = '0px';
    menu.style.right = 'auto';
    const anchor = wrap.getBoundingClientRect();
    const width = menu.getBoundingClientRect().width;
    const viewport = document.documentElement.clientWidth;
    const maxLeft = viewport - VIEWPORT_GUTTER - width;
    let left = anchor.left;
    if (left > maxLeft) left = anchor.right - width;
    left = Math.max(VIEWPORT_GUTTER, Math.min(left, maxLeft));
    menu.style.left = `${Math.round(left - anchor.left)}px`;
    // Inside a scrolling dialog body, bring the whole popup (incl. its footer) into view.
    menu.scrollIntoView({ block: 'nearest' });

    const items = menuItems(menu);
    const initial =
      items.find((el) => el.getAttribute('aria-selected') === 'true') ?? items[0];
    initial?.focus({ preventScroll: true });
  }, [open]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (!open) {
      if (e.target === triggerRef.current && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      // Keep an enclosing dialog open: only the popup closes.
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = menuItems(menuRef.current);
    if (!items.length) return;
    e.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next = 0;
    if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
    else if (e.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1;
    items[next].focus();
  };

  // Tabbing out closes the popup; Tab itself is never trapped.
  const onBlur = (e: ReactFocusEvent<HTMLElement>) => {
    const next = e.relatedTarget as Node | null;
    if (open && next && wrapRef.current && !wrapRef.current.contains(next)) setOpen(false);
  };

  return { open, setOpen, close, menuId, wrapRef, triggerRef, menuRef, onKeyDown, onBlur };
}

function Caret() {
  return <svg className="switcher-caret" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>;
}

export interface MultiSelectDropdownProps {
  label: string;
  icon?: ReactNode;
  options: DropdownOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  allLabel?: string;
  className?: string;
  /** Trigger text when nothing is selected. Defaults to "Select <label>". */
  emptyLabel?: string;
  /** Disable Apply while nothing is ticked (for fields that need at least one value). */
  requireSelection?: boolean;
}

export function MultiSelectDropdown({
  label,
  icon = '◫',
  options,
  selected,
  onChange,
  allLabel = 'All outlets',
  className = '',
  emptyLabel,
  requireSelection = false,
}: MultiSelectDropdownProps) {
  const { open, setOpen, close, menuId, wrapRef, triggerRef, menuRef, onKeyDown, onBlur } =
    useDropdownMenu();
  const [draft, setDraft] = useState<string[]>(selected);
  const allRef = useRef<HTMLInputElement>(null);

  const draftCount = options.filter((o) => draft.includes(o.value)).length;
  const allSelected = options.length > 0 && draftCount === options.length;
  const someSelected = draftCount > 0 && !allSelected;

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someSelected;
  }, [someSelected, open]);

  const toggleOpen = () => {
    if (!open) setDraft(selected);
    setOpen(!open);
  };

  // Ticking "All" selects every option; unticking it (or pressing Clear) empties
  // the draft. Nothing is committed until Apply.
  const toggleAll = () => setDraft(allSelected ? [] : options.map((o) => o.value));

  const toggleOption = (val: string) =>
    setDraft(draft.includes(val) ? draft.filter((v) => v !== val) : [...draft, val]);

  const handleApply = () => {
    onChange(options.filter((o) => draft.includes(o.value)).map((o) => o.value));
    close(true);
  };

  const handleClear = () => {
    setDraft([]);
    onChange([]);
    close(true);
  };

  // Enter toggles a checkbox instead of submitting an enclosing form.
  const enterToggles = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.click();
    }
  };

  const selectedOptions = options.filter((o) => selected.includes(o.value));
  const summary =
    selectedOptions.length === 0
      ? emptyLabel ?? `Select ${label.toLowerCase()}`
      : selectedOptions.length === options.length
        ? allLabel
        : selectedOptions.length === 1
          ? selectedOptions[0].label
          : `${selectedOptions.length} ${label.toLowerCase()}`;

  const applyBlocked = requireSelection && draftCount === 0;

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
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${label}: ${summary}`}
        title={summary}
      >
        {icon && <span aria-hidden="true">{icon}</span>}
        <span className="switcher-value">{summary}</span>
        <Caret />
      </button>

      {open && (
        <div ref={menuRef} id={menuId} className="dropdown-menu" role="dialog" aria-label={label}>
          {options.length > 0 && (
            <>
              <label className="dropdown-check-row dropdown-check-all">
                <input
                  ref={allRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  onKeyDown={enterToggles}
                  data-dropdown-item
                />
                <span>{allLabel}</span>
              </label>
              <div className="dropdown-sep" role="separator" />
            </>
          )}

          {options.map((opt) => (
            <label key={opt.value} className="dropdown-check-row">
              <input
                type="checkbox"
                checked={draft.includes(opt.value)}
                onChange={() => toggleOption(opt.value)}
                onKeyDown={enterToggles}
                data-dropdown-item
              />
              <span>{opt.label}</span>
            </label>
          ))}

          {options.length === 0 && <p className="dropdown-empty">Nothing to choose from.</p>}

          {applyBlocked && (
            <p className="dropdown-hint" role="status">
              Select at least one.
            </p>
          )}

          <div className="dropdown-foot">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClear}
              disabled={draftCount === 0}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleApply}
              disabled={applyBlocked}
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
  /** Accessible name of the field (e.g. "Applies to"); announced before the current value. */
  ariaLabel?: string;
}

export function SingleSelectDropdown({
  label,
  icon,
  options,
  value,
  onChange,
  className = '',
  ariaLabel,
}: SingleSelectDropdownProps) {
  const { open, setOpen, close, menuId, wrapRef, triggerRef, menuRef, onKeyDown, onBlur } =
    useDropdownMenu();

  const selectedOpt = options.find((o) => o.value === value);
  const displayText = selectedOpt?.label || label || 'Select';
  const name = ariaLabel ?? (selectedOpt ? label : undefined);

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
        aria-label={name ? `${name}: ${displayText}` : undefined}
        title={displayText}
      >
        {icon && <span aria-hidden="true">{icon}</span>}
        <span className="switcher-value">{displayText}</span>
        <Caret />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="dropdown-menu"
          role="listbox"
          aria-label={ariaLabel ?? label}
        >
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`dropdown-radio-row ${isActive ? 'active' : ''}`.trim()}
                onClick={() => {
                  onChange(opt.value);
                  close(true);
                }}
                role="option"
                aria-selected={isActive}
                data-dropdown-item
              >
                <span>{opt.label}</span>
                {isActive && <span className="dropdown-check" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
