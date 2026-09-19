'use client';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

export interface RowMenuItem {
  label: string;
  icon: IconName;
  onClick: () => void;
  danger?: boolean;
}

// Rendered via a portal to document.body so the popup can't be clipped by an
// ancestor table's overflow:hidden/overflow-x:auto (e.g. a horizontally
// scrolling table on mobile), and positioned from the trigger's own
// bounding rect since it's no longer a normal-flow descendant of it.
export default function RowMenu({ items, trigger }: { items: RowMenuItem[]; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuEl = menuRef.current;
    const menuHeight = menuEl ? menuEl.offsetHeight : (items.length * 38 + 16);
    const menuWidth = menuEl ? menuEl.offsetWidth : 190;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpwards = spaceBelow < menuHeight + 12 && spaceAbove > menuHeight;

    const top = openUpwards
      ? Math.max(8, rect.top - menuHeight - 4)
      : Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 4);

    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));

    setPosition({ top, left });
  }, [items.length]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    // Portal target must still be inside the ".soa" scoping wrapper — its
    // CSS (.soa .menu {...}) is a descendant selector, and document.body
    // sits outside that wrapper, so portaling straight to body would drop
    // all of this component's styling (and fall back to an unrelated
    // global .menu rule from the marketing site's leftover CSS).
    setPortalTarget(triggerRef.current?.closest('.soa') ?? document.body);
  }, [open, reposition]);

  const menuCallbackRef = useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node;
    if (node) {
      reposition();
    }
  }, [reposition]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  return <>
    <button ref={triggerRef} type="button" className="icon-btn" aria-label="Row actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      {trigger ?? <Icon name="moreVertical" />}
    </button>
    {open && position && portalTarget && createPortal(
      <div ref={menuCallbackRef} className="menu" style={{ top: position.top, left: position.left }} role="menu">
        {items.map(item => (
          <button key={item.label} type="button" className={item.danger ? 'danger' : ''} role="menuitem" onClick={() => { setOpen(false); item.onClick(); }}>
            <Icon name={item.icon} />{item.label}
          </button>
        ))}
      </div>,
      portalTarget,
    )}
  </>;
}
