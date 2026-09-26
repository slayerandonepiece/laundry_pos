'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode, ButtonHTMLAttributes } from 'react';
import type { DateRange } from '../admin.types';
import ConfirmationDialog from './ConfirmationDialog';
import { lockBodyScroll } from '../admin.dialog';
const PanelCloseContext = createContext<(() => void) | undefined>(undefined);
export const usePanelClose = () => useContext(PanelCloseContext);
export function Button({ children, secondary, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) { return <button {...props} className={'ad-button ' + (secondary ? 'ad-secondary' : '')}>{children}</button>; }
export function Badge({ children }: { children: string }) { const tone = ['Paid', 'Completed', 'Delivered', 'Active'].includes(children) ? 'good' : ['Cancelled', 'Overdue'].includes(children) ? 'bad' : ['Unpaid', 'Part-paid'].includes(children) ? 'warm' : children === 'Pending' ? 'gray' : children === 'Ready' ? 'violet' : 'blue'; return <span className={'ad-badge ' + tone}>{children}</span>; }
export function Metric({ label, value, detail, primary }: { label: string; value: string; detail: string; primary?: boolean }) { return <article className={'ad-metric ' + (primary ? 'primary' : '')}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
export function Empty({ text = 'No matching records. Try another filter.' }: { text?: string }) { return <div className="ad-empty"><span aria-hidden="true">⬚</span><h3>Nothing here yet</h3><p>{text}</p></div>; }
function formatHumanDate(iso: string) {
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return iso;
  }
}

export function DateFilter({ period, range, onPeriod, onRange }: { period: string; range: DateRange; onPeriod: (s: string) => void; onRange: (r: DateRange) => void }) { return <div className={'ad-dates ' + (period === 'custom' ? 'ad-custom-dates' : '')}><select aria-label="Reporting period" value={period} onChange={e => onPeriod(e.target.value)}><option value="week">This week</option><option value="month">This month</option><option value="quarter">This quarter</option><option value="custom">Custom dates</option></select>{period === 'custom' ? <><label className="ad-date-bound">From<input type="date" value={range.from} max={range.to} onChange={e => onRange({ ...range, from: e.target.value })}/></label><label className="ad-date-bound">To<input type="date" value={range.to} min={range.from} onChange={e => onRange({ ...range, to: e.target.value })}/></label></> : <span>{formatHumanDate(range.from)} — {formatHumanDate(range.to)}</span>}</div>; }
export function Panel({ title, children, onClose, warnOnChanges = true, variant = 'default', headerContent }: { headerContent?: ReactNode; title: string; children: ReactNode; onClose: () => void; warnOnChanges?: boolean; variant?: 'default' | 'compact' | 'details' | 'modal' }) {
  const ref = useRef<HTMLDialogElement>(null); const dirty = useRef(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const requestClose = () => { if (warnOnChanges && dirty.current) { setConfirmClose(true); return; } onClose(); };
  useEffect(() => { const el = ref.current!, previous = document.activeElement as HTMLElement, unlock = lockBodyScroll(); el.showModal(); if (el.classList.contains('ad-dialog-details')) el.querySelector<HTMLElement>('header > .ad-icon-button')?.focus(); return () => { el.close(); unlock(); if (previous?.isConnected) previous.focus(); }; }, []);
  return <><dialog className={"ad-dialog ad-root ad-dialog-" + variant} aria-label={title} ref={ref} onChangeCapture={() => { dirty.current = true; }} onClick={e => { if ((e.target as HTMLElement).closest('[data-dirty]')) dirty.current = true; if (e.target === e.currentTarget) requestClose(); }} onCancel={e => { e.preventDefault(); requestClose(); }}><header>{headerContent || <div><h2>{title}</h2></div>}<button className="ad-icon-button" aria-label="Close panel" onClick={requestClose}>×</button></header><div className="ad-dialog-body"><PanelCloseContext.Provider value={requestClose}>{children}</PanelCloseContext.Provider></div></dialog>{confirmClose && <ConfirmationDialog title="Discard changes?" description="Your unsaved changes will be lost." confirmLabel="Discard changes" cancelLabel="Keep editing" onCancel={() => setConfirmClose(false)} onConfirm={() => { setConfirmClose(false); onClose(); }}/>}</>;
}
