'use client';
import { useEffect, useState } from 'react';
import type { WorkStatus } from '../admin.types';
import { Button } from './Primitives';
import { getOrderMessageAction } from '../actions/orders.actions';
import { shareOrderMessage } from '@/lib/invoiceShare';

/** Shares the customer message for the order's current status: its template text and the public order link (no file is attached). */
export default function OrderMessageShare({ orderCode, status }: { orderCode: string; status: WorkStatus }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Notes are shown as a toast so they never stretch the dialog header.
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(timer);
  }, [note]);

  async function share() {
    if (busy) return;
    setBusy(true); setNote(null);
    try {
      const message = await getOrderMessageAction(orderCode);
      if (!message.enabled) { setNote({ kind: 'info', text: `Messages are turned off for ${status.toLowerCase()} orders.` }); return; }
      const link = message.linkPath ? window.location.origin + message.linkPath : '';
      // The template's {link} is replaced; a template without it still gets the link appended.
      const text = !link ? message.text : message.text.includes('{link}') ? message.text.replace('{link}', link) : `${message.text}\n${link}`;
      shareOrderMessage(text);
      setNote({ kind: 'success', text: 'Opening WhatsApp with the order link.' });
    } catch { setNote({ kind: 'error', text: 'Could not prepare the message. Try again.' }); }
    finally { setBusy(false); }
  }

  return <span className="ad-order-share">
    <Button secondary type="button" disabled={busy} onClick={() => void share()}>{busy ? 'Preparing…' : 'Share update'}</Button>
    {note && <div className={`ad-toast ad-toast-light ad-toast-${note.kind}`} role={note.kind === 'error' ? 'alert' : 'status'}><span className="ad-toast-icon" aria-hidden="true">{note.kind === 'success' ? '✓' : note.kind === 'error' ? '!' : 'i'}</span><span>{note.text}</span><button type="button" aria-label="Dismiss message" onClick={() => setNote(null)}>×</button></div>}
  </span>;
}
