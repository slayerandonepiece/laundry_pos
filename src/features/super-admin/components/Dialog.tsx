'use client';

import { createContext, useContext, useEffect, useId, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ConfirmationDialog from '@/features/admin/components/ConfirmationDialog';
import { lockBodyScroll } from '@/features/admin/admin.dialog';
import Icon from './Icon';

const DialogCloseContext = createContext<(() => void) | undefined>(undefined);
export const useDialogClose = () => useContext(DialogCloseContext);

const DialogFooterSlotContext = createContext<HTMLDivElement | null>(null);

/**
 * Reusable DialogFooter component.
 * Render this inside any Dialog child to place static/sticky action buttons
 * in the pinned footer bar at the bottom of the dialog.
 */
export function DialogFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  const slot = useContext(DialogFooterSlotContext);
  if (!slot) return null;
  return createPortal(
    <div className={`dialog-foot-inner ${className}`} style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 10, justifyContent: 'flex-end' }}>
      {children}
    </div>,
    slot
  );
}

export default function Dialog({
  title,
  description,
  children,
  onClose,
  warnOnChanges = true,
  size = 'default',
  headerActions,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  warnOnChanges?: boolean;
  size?: 'default' | 'wide' | 'narrow' | 'xl';
  headerActions?: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const footerRef = useCallback((node: HTMLDivElement | null) => {
    setFooterSlot(node);
  }, []);

  function requestClose() {
    if (warnOnChanges && dirty.current) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const unlock = lockBodyScroll();
    element?.showModal();

    return () => {
      element?.close();
      unlock();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return <>
    <div className="scrim" aria-hidden="true" />
    <dialog
      ref={ref}
      className={`dialog${size === 'default' ? '' : ` ${size}`}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onChangeCapture={() => { dirty.current = true; }}
      onClick={event => {
        if ((event.target as HTMLElement).closest('[data-dirty]')) dirty.current = true;
        if (event.target === event.currentTarget) requestClose();
      }}
      onCancel={event => {
        event.preventDefault();
        requestClose();
      }}
    >
      <div className="dialog-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        {headerActions && <div className="dialog-head-actions">{headerActions}</div>}
        <button type="button" className="dialog-close-btn" title="Close" aria-label="Close dialog" onClick={requestClose}>
          <Icon name="close" size="s" />
        </button>
      </div>
      <div className="dialog-body">
        <DialogCloseContext.Provider value={requestClose}>
          <DialogFooterSlotContext.Provider value={footerSlot}>
            {children}
          </DialogFooterSlotContext.Provider>
        </DialogCloseContext.Provider>
      </div>
      <div ref={footerRef} className="dialog-foot">
        {footer}
      </div>
    </dialog>
    {confirmClose && (
      <ConfirmationDialog
        title="Discard changes?"
        description="Your unsaved changes will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => { setConfirmClose(false); onClose(); }}
      />
    )}
  </>;
}
