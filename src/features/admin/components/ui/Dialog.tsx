'use client';

import React, { useEffect, useRef, useState, useId, type ReactNode } from 'react';
import { lockBodyScroll } from '../../admin.dialog';
import ConfirmationDialog from '../ConfirmationDialog';

export interface DialogProps {
  isOpen?: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  wide?: boolean;
  warnOnChanges?: boolean;
  className?: string;
}

const DialogContext = React.createContext<{ requestClose: () => void }>({ requestClose: () => {} });
export function useDialog() {
  return React.useContext(DialogContext);
}

export function Dialog({
  isOpen = true,
  onClose,
  title,
  children,
  foot,
  wide = false,
  warnOnChanges = false,
  className = '',
}: DialogProps) {
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const [confirmClose, setConfirmClose] = useState(false);
  const isDirty = useRef(false);
  const scrimRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const requestClose = React.useCallback(() => {
    if (warnOnChanges && isDirty.current) {
      setConfirmClose(true);
      return;
    }
    closeRef.current();
  }, [warnOnChanges]);

  useEffect(() => {
    if (!isOpen) return;

    const previousActive = document.activeElement as HTMLElement | null;
    const unlockScroll = lockBodyScroll();

    // Focus the first form field inside the dialog, or first focusable element, or the dialog itself
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const autoFocused = dialogRef.current.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
        const bodyInput = dialogRef.current.querySelector<HTMLElement>(
          '.dialog-body input:not([type="hidden"]):not([disabled]), .dialog-body select:not([disabled]), .dialog-body textarea:not([disabled])'
        );
        const focusable = dialogRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (autoFocused) {
          autoFocused.focus();
        } else if (bodyInput) {
          bodyInput.focus();
        } else if (focusable) {
          focusable.focus();
        } else {
          dialogRef.current.focus();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog || !dialog.contains(document.activeElement)) return;
      if (e.key === 'Tab') {
        const fields = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(el => el.getClientRects().length > 0);
        const target = e.shiftKey ? fields[fields.length - 1] : fields[0];
        const boundary = e.shiftKey ? fields[0] : fields[fields.length - 1];
        if (document.activeElement === boundary || fields.length === 0) {
          e.preventDefault();
          (target || dialog).focus();
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      unlockScroll();
      if (previousActive && typeof previousActive.focus === 'function' && previousActive.isConnected) {
        previousActive.focus();
      }
    };
  }, [isOpen, requestClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        ref={scrimRef}
        className="dialog-scrim"
        onClick={(e) => {
          if (e.target === scrimRef.current) {
            requestClose();
          }
        }}
        role="presentation"
      >
        <DialogContext.Provider value={{ requestClose }}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`dialog ${wide ? 'wide' : ''} ${className}`.trim()}
            onChangeCapture={() => {
              isDirty.current = true;
            }}
          >
            <div className="dialog-head">
              <h2 id={titleId} style={{ fontSize: '16px' }}>
                {title}
              </h2>
              <button
                type="button"
                className="dialog-close"
                aria-label="Close dialog"
                onClick={requestClose}
              >
                ✕
              </button>
            </div>

            <div className="dialog-body">{children}</div>

            {foot && <div className="dialog-foot">{foot}</div>}
          </div>
        </DialogContext.Provider>
      </div>

      {confirmClose && (
        <ConfirmationDialog
          title="Discard changes?"
          description="Your unsaved changes will be lost."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => {
            setConfirmClose(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

export default Dialog;
