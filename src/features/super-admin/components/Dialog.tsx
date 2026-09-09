'use client';

import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ConfirmationDialog from '@/features/admin/components/ConfirmationDialog';
import { lockBodyScroll } from '@/features/admin/admin.dialog';

const DialogCloseContext = createContext<(() => void) | undefined>(undefined);

export const useDialogClose = () => useContext(DialogCloseContext);

export default function Dialog({
  title,
  description,
  children,
  onClose,
  warnOnChanges = true,
  size = 'default',
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  warnOnChanges?: boolean;
  size?: 'default' | 'wide' | 'narrow';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

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
        <button type="button" className="icon-btn plain" aria-label="Close dialog" onClick={requestClose}>×</button>
      </div>
      <div className="dialog-body pad-top">
        <DialogCloseContext.Provider value={requestClose}>{children}</DialogCloseContext.Provider>
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
