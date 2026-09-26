'use client';

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
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
  const [confirmClose, setConfirmClose] = useState(false);
  const isDirty = useRef(false);
  const scrimRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const requestClose = React.useCallback(() => {
    if (warnOnChanges && isDirty.current) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [warnOnChanges, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const previousActive = document.activeElement as HTMLElement | null;
    const unlockScroll = lockBodyScroll();

    // Focus the first form field inside the dialog, or first focusable element, or the dialog itself
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const autoFocused = dialogRef.current.querySelector<HTMLElement>('[autofocus]');
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
            aria-labelledby="dialog-title"
            tabIndex={-1}
            className={`dialog ${wide ? 'wide' : ''} ${className}`.trim()}
            onChangeCapture={() => {
              isDirty.current = true;
            }}
          >
            <div className="dialog-head">
              <h2 id="dialog-title" style={{ fontSize: '16px' }}>
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
