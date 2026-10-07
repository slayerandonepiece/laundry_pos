'use client';

import { useCallback, useEffect, useLayoutEffect } from 'react';
import { useDropdownMenu } from './Dropdown';

export interface RowAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * Compact "⋯" overflow menu for a table row or card. Reuses the workspace
 * dropdown behaviour (Escape, outside click, arrow keys, tab-away closes). The
 * popup is fixed-positioned so a horizontally scrolling table cannot clip it.
 */
export function RowActionsMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const { open, setOpen, close, menuId, wrapRef, triggerRef, menuRef, onKeyDown, onBlur } = useDropdownMenu();

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = menu;
    const below = window.innerHeight - rect.bottom;
    const top = below < height + 8 && rect.top > height + 8 ? rect.top - height - 4 : rect.bottom + 4;
    const left = Math.max(16, Math.min(rect.right - width, document.documentElement.clientWidth - 16 - width));
    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
  }, [triggerRef, menuRef]);

  // Runs after the shared hook's own positioning, replacing it with viewport coordinates.
  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  return (
    <div ref={wrapRef} className="dropdown-wrap row-actions" onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className="row-actions-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div ref={menuRef} id={menuId} className="dropdown-menu row-actions-menu" role="menu" aria-label={label}>
          {actions.map(action => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={`dropdown-radio-row${action.danger ? ' danger' : ''}`}
              disabled={action.disabled}
              data-dropdown-item={action.disabled ? undefined : ''}
              onClick={() => { close(true); action.onSelect(); }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default RowActionsMenu;
