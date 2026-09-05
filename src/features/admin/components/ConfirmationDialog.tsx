'use client';
import { useEffect, useId, useRef } from 'react';
import { lockBodyScroll } from '../admin.dialog';

export interface Confirmation { title: string; description: string; confirmLabel: string; onConfirm: () => void; cancelLabel?: string }
export default function ConfirmationDialog({ title, description, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel }: Confirmation & { onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null), id = useId();
  useEffect(() => {
    const dialog = ref.current!, previous = document.activeElement as HTMLElement, unlock = lockBodyScroll();
    dialog.showModal(); cancel.current?.focus();
    return () => { dialog.close(); unlock(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="ad-root ad-confirm-dialog" aria-labelledby={id} aria-describedby={id + '-description'} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={id}>{title}</h2><p id={id + '-description'}>{description}</p>
    <div className="ad-confirm-actions"><button ref={cancel} className="ad-button ad-secondary" onClick={onCancel}>{cancelLabel}</button><button className="ad-button" onClick={onConfirm}>{confirmLabel}</button></div>
  </dialog>;
}
