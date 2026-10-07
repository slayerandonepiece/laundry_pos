'use client';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import ConfirmationDialog from '@/features/admin/components/ConfirmationDialog';
import { money } from '@/features/admin/admin.data';
import Icon from './Icon';
import {
  fetchImportContextAction,
  importOrdersAction,
  lookupImportCustomerNamesAction,
  previewOrderImportAction,
  searchImportOrganizationsAction,
  type ImportOrganization,
  undoImportBatchAction,
  type ImportContext,
} from '../actions/order-import.actions';
import type { ImportRowError, OrderImportPreview } from '@/server/services/order-import';
import { normalizePhone } from '@/lib/contactValidation';

interface Row { id: number; phone: string; name: string; service: string; qty: string; price: string; method: string }
type Field = ImportRowError['field'];

const MAX_ROWS = 300;
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const isBlank = (row: Row) => !row.phone.trim() && !row.name.trim() && !row.service && !row.qty.trim() && !row.price.trim();
const key = (row: number, field: Field) => `${row}:${field}`;
let rowCounter = 1;
const blankRows = () => Array.from({ length: 8 }, () => blankRow());
const blankRow = (): Row => ({ id: rowCounter++, phone: '', name: '', service: '', qty: '', price: '', method: '' });

export default function OrderImportGrid() {
  const [storeId, setStoreId] = useState('');
  const [context, setContext] = useState<ImportContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [outletId, setOutletId] = useState('');
  const [date, setDate] = useState('');
  const [method, setMethod] = useState('');
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<ImportOrganization[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => blankRows());
  const [known, setKnown] = useState<Record<string, string>>({});
  const looked = useRef(new Set<string>());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<OrderImportPreview | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const importKey = useRef(crypto.randomUUID());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const typeOf = (service: string) => context?.services.find(item => item.name === service)?.type;
  const clear = () => { setPreview(null); setMessage(null); setGlobalErrors([]); };

  async function loadContext(id: string) {
    setLoading(true);
    clear();
    try {
      const next = await fetchImportContextAction(id);
      setContext(next);
      setOutletId(next.outlets.length === 1 ? next.outlets[0].id : '');
      const only = next.methods.length === 1 ? next.methods[0].name : '';
      setMethod(only);
      setRows(current => current.map(row => ({
        ...row,
        service: next.services.some(item => item.name === row.service) ? row.service : '',
        method: only,
      })));
      looked.current = new Set();
      setKnown({});
    } catch { setMessage({ tone: 'bad', text: 'Could not load this organization. Try again.' }); setContext(null); }
    finally { setLoading(false); }
  }

  async function search(text = query, autoPick = true) {
    setSearching(true); setMessage(null);
    try {
      const found = await searchImportOrganizationsAction(text.trim());
      if (autoPick && text.trim() && found.length === 1) await chooseOrganization(found[0]);
      else setMatches(found);
    } catch { setMessage({ tone: 'bad', text: 'Could not search. Try again.' }); }
    finally { setSearching(false); }
  }

  function typeOrganization(text: string) {
    if (storeId) resetOrganization();
    setQuery(text);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void search(text, false), 250);
  }

  async function chooseOrganization(org: ImportOrganization) {
    setMatches(null);
    setStoreId(org.id);
    setQuery(`${org.orgCode} · ${org.name}`);
    setErrors({});
    await loadContext(org.id);
  }

  function resetOrganization() {
    setMethod(''); setStoreId(''); setContext(null); setQuery(''); setMatches(null); setOutletId(''); setErrors({}); clear();
  }

  // A blank name keeps what the customer already has: suggest the name typed on another row for the
  // same number, otherwise the most recent name on file. A typed name is never replaced.
  const suggestions = useMemo(() => {
    const result = new Map<string, string>();
    for (const row of rows) {
      const phone = normalizePhone(row.phone);
      if (phone && row.name.trim() && !result.has(phone)) result.set(phone, row.name.trim());
    }
    for (const [phone, name] of Object.entries(known)) if (!result.has(phone)) result.set(phone, name);
    return result;
  }, [rows, known]);

  async function lookup(rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    if (!storeId || phone.length < 8 || looked.current.has(phone)) return;
    looked.current.add(phone);
    try {
      const names = await lookupImportCustomerNamesAction(storeId, [phone]);
      if (names[phone]) setKnown(current => ({ ...current, [phone]: names[phone] }));
    } catch { looked.current.delete(phone); }
  }

  function patch(id: number, change: Partial<Row>) {
    setRows(current => current.map(row => (row.id === id ? { ...row, ...change } : row)));
    setErrors(current => {
      const next = { ...current };
      const index = rows.findIndex(row => row.id === id) + 1;
      for (const field of Object.keys(change)) {
        delete next[key(index, field === 'qty' ? 'quantity' : field === 'method' ? 'payment' : (field as Field))];
        if (field === 'service') delete next[key(index, 'quantity')];
      }
      return next;
    });
    clear();
  }

  function remove(id: number) {
    setRows(current => (current.length > 1 ? current.filter(row => row.id !== id) : blankRows()));
    setErrors({});
    clear();
  }

  // Excel columns: customer, name, service, type, qty, price. Five columns skip the type and
  // four skip the name too. Anything else is ignored rather than guessed at.
  function rowFromCells(cells: string[]): Row | null {
    const at = (index: number) => cells[index] ?? '';
    if (cells.length < 4) return null;
    const [phone, name, service, quantity, price] =
      cells.length >= 6 ? [at(0), at(1), at(2), at(4), at(5)]
      : cells.length === 5 ? [at(0), at(1), at(2), at(3), at(4)]
      : [at(0), '', at(1), at(2), at(3)];
    const match = context?.services.find(item => item.name.toLowerCase() === service.toLowerCase());
    return { id: rowCounter++, phone, name, service: match?.name ?? '', qty: quantity, price, method: defaultMethod() };
  }

  function paste(event: React.ClipboardEvent) {
    const text = event.clipboardData.getData('text');
    if (!text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault();
    const made = text.split(/\r?\n/).filter(line => line.trim()).map(line => rowFromCells(line.split('\t').map(cell => cell.trim()))).filter((row): row is Row => row !== null);
    if (!made.length) { setMessage({ tone: 'bad', text: 'Paste rows with at least customer, service, quantity and price columns.' }); return; }
    setRows(current => [...current.filter(row => !isBlank(row)), ...made].slice(0, MAX_ROWS));
    setErrors({});
    clear();
    for (const row of made) void lookup(row.phone);
  }

  // New and pasted rows start with the sheet's payment method; each row can still change its own.
  const defaultMethod = () => method;

  const payload = () => ({
    storeId, outletId, date,
    rows: rows.filter(row => !isBlank(row)).map(row => ({ phone: row.phone, name: row.name, service: row.service, quantity: row.qty, price: row.price, paymentMethod: row.method })),
  });

  // Rows sent to the server skip blank lines, so map its row numbers back onto the visible grid.
  function applyPreview(result: OrderImportPreview) {
    const visible = rows.map((row, index) => ({ row, index: index + 1 })).filter(item => !isBlank(item.row));
    const next: Record<string, string> = {};
    const general: string[] = [];
    for (const error of result.errors) {
      if (error.row === 0) { general.push(error.message); continue; }
      const target = visible[error.row - 1];
      if (target) next[key(target.index, error.field)] = error.message;
    }
    setErrors(next);
    setGlobalErrors(general);
    setPreview(result);
    return result;
  }

  async function check(): Promise<OrderImportPreview | null> {
    if (!storeId) { setMessage({ tone: 'bad', text: 'Choose an organization first.' }); return null; }
    setBusy(true); setMessage(null);
    try { return applyPreview(await previewOrderImportAction(payload())); }
    catch { setMessage({ tone: 'bad', text: 'Could not check the sheet. Try again.' }); return null; }
    finally { setBusy(false); }
  }

  async function validate() {
    const result = await check();
    if (result?.ok) setMessage({ tone: 'ok', text: `All rows are valid: ${result.orderCount} order${result.orderCount === 1 ? '' : 's'}, ${money(result.totalAmount)} collected.` });
    else if (result) setMessage({ tone: 'bad', text: `Fix ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'} before saving.` });
  }

  async function beforeImport() {
    const result = await check();
    if (result?.ok) setConfirmImport(true);
    else if (result) setMessage({ tone: 'bad', text: `Fix ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'} before saving.` });
  }

  async function runImport() {
    setConfirmImport(false);
    setBusy(true);
    try {
      const result = await importOrdersAction(payload(), importKey.current);
      if (!result.ok) { setMessage({ tone: 'bad', text: result.error }); return; }
      setMessage({ tone: 'ok', text: `Saved ${result.batch.orderCount} order${result.batch.orderCount === 1 ? '' : 's'} (${money(result.batch.totalAmount)}).` });
      importKey.current = crypto.randomUUID();
      setRows(blankRows()); setErrors({}); setPreview(null);
      await loadContext(storeId).catch(() => undefined);
      setMessage({ tone: 'ok', text: `Saved ${result.batch.orderCount} order${result.batch.orderCount === 1 ? '' : 's'} (${money(result.batch.totalAmount)}).` });
    } catch { setMessage({ tone: 'bad', text: 'Saving did not finish. Check the saved batches below before trying again.' }); }
    finally { setBusy(false); }
  }

  async function runUndo(batchId: string) {
    setUndoing(null);
    setBusy(true);
    try {
      const result = await undoImportBatchAction(storeId, batchId);
      if (!result.ok) { setMessage({ tone: 'bad', text: result.error }); return; }
      await loadContext(storeId).catch(() => undefined);
      setMessage({ tone: 'ok', text: 'Batch undone. Its orders and totals were removed.' });
    } catch { setMessage({ tone: 'bad', text: 'Could not undo the batch. Try again.' }); }
    finally { setBusy(false); }
  }

  const filled = rows.filter(row => !isBlank(row));
  const totalPaise = filled.reduce((sum, row) => sum + Math.round((Number(row.price) || 0) * 100), 0);
  const cellClass = (index: number, field: Field) => (errors[key(index, field)] ? 'imp-bad' : undefined);
  const ready = storeId && context && !loading;

  return <div className="imp">
    <div className="card imp-gap imp-bar">
      <div className="imp-global">
        <div className="field imp-org"><label htmlFor="imp-org">Organization</label>
          <div className="imp-search">
            <input id="imp-org" role="combobox" aria-expanded={!!matches} aria-controls="imp-orgs" aria-autocomplete="list" value={query} placeholder="Search or select organization" autoComplete="off" disabled={busy || loading}
              onFocus={() => { if (!storeId && !matches) void search(query, false); }}
              onChange={event => typeOrganization(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void search(); } else if (event.key === 'Escape') setMatches(null); }} />
            <button type="button" className="imp-chev" tabIndex={-1} aria-label={searching || loading ? 'Loading' : 'Show organizations'} disabled={busy || loading} onClick={() => (matches ? setMatches(null) : void search(storeId ? '' : query, false))}>{searching || loading ? <span className="imp-spin" aria-hidden="true" /> : <Icon name="chevronDown" size="s" />}</button>
            {(matches || searching) && <ul id="imp-orgs" className="imp-matches" role="listbox" aria-label="Organizations">
              {!matches ? <li className="imp-none">Searching…</li> : matches.length ? matches.map(org => <li key={org.id}><button type="button" role="option" aria-selected={org.id === storeId} onClick={() => void chooseOrganization(org)}><b>{org.orgCode}</b> {org.name}</button></li>) : <li className="imp-none">No organization matches &ldquo;{query.trim()}&rdquo;.</li>}
            </ul>}
          </div></div>
        <div className={'field' + (loading ? ' sk' : '')}><label htmlFor="imp-outlet">Outlet</label>
          <select id="imp-outlet" value={outletId} onChange={event => { setOutletId(event.target.value); clear(); }} disabled={!ready || busy}>
            <option value="">{loading ? 'Loading outlets…' : ready ? 'Select outlet' : ''}</option>
            {context?.outlets.map(outlet => <option key={outlet.id} value={outlet.id}>{outlet.name}{outlet.status === 'ACTIVE' ? '' : ` (${outlet.status.toLowerCase()})`}</option>)}
          </select></div>
        <div className={'field' + (loading ? ' sk' : '')}><label htmlFor="imp-date">Order date</label>
          <input id="imp-date" type="date" value={date} max={istToday()} onChange={event => { setDate(event.target.value); clear(); }} disabled={!ready || busy} /></div>
        <div className={'field' + (loading ? ' sk' : '')}><label htmlFor="imp-method">Payment method</label>
          <select id="imp-method" value={method} disabled={!ready || busy} onChange={event => { const chosen = event.target.value; setMethod(chosen); setRows(current => current.map(row => ({ ...row, method: chosen }))); clear(); }}>
            <option value="">{loading ? 'Loading methods…' : ready ? 'Select method' : ''}</option>
            {context?.methods.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select></div>
        <Button type="button" disabled={busy || searching || loading || !!storeId} onClick={() => void search()}>{loading ? 'Loading…' : searching ? 'Searching…' : 'Search'}</Button>
      </div>
      {(globalErrors.length > 0 || (storeId && context && !context.methods.length)) && <div style={{ margin: '8px 0 0' }}>
        {storeId && context && !context.methods.length && <p className="ad-help" style={{ margin: 0 }}>This organization has no payment method enabled for collecting after the order. Enable one in its Payments tab first.</p>}
        {globalErrors.map(text => <p key={text} className="ad-error" role="alert" style={{ margin: 0 }}>{text}</p>)}
      </div>}
    </div>

    <div className={'card imp-sheet' + (loading ? ' is-loading' : '')} aria-busy={loading}>
      {loading && <div className="imp-progress" role="status" aria-label="Loading organization" />}
      <div className="imp-sheet-head">
        <div><h2>Records</h2><p>Type or paste rows from Excel. Rows with the same customer number become one order.</p></div>
        <div className="imp-actions">
          <Button secondary type="button" disabled={!ready || busy || !filled.length} onClick={() => void validate()}>Validate</Button>
          <Button type="button" disabled={!ready || busy || !filled.length || !context?.methods.length} onClick={() => void beforeImport()}>{busy ? 'Saving…' : filled.length ? `Save ${preview ? preview.orderCount : new Set(filled.map(row => normalizePhone(row.phone)).filter(Boolean)).size} order${preview ? preview.orderCount : new Set(filled.map(row => normalizePhone(row.phone)).filter(Boolean)).size === 1 ? '' : 's'}` : 'Save'}</Button>
        </div>
      </div>
      <div className="imp-toolbar">
        <div className="imp-sum" aria-live="polite">
          <span><b className="num">{filled.length}</b> rows</span>
          <span><b className="num">{preview ? preview.orderCount : new Set(filled.map(row => normalizePhone(row.phone)).filter(Boolean)).size}</b> orders</span>
          <span><b className="num">{money(preview ? preview.totalAmount : totalPaise)}</b> collected</span>
          {Object.keys(errors).length > 0 && <span className="imp-sum-bad"><b className="num">{Object.keys(errors).length}</b> to fix</span>}
        </div>
        <span className="imp-hint"><i>Italic names</i> already exist for that number. Type over one to change it.</span>
      </div>
      {Object.keys(errors).length > 0 && <ul className="imp-errors" role="alert">{Object.entries(errors).slice(0, 6).map(([cell, text]) => <li key={cell}>Row {cell.split(':')[0]}: {text}</li>)}{Object.keys(errors).length > 6 && <li>and {Object.keys(errors).length - 6} more</li>}</ul>}
      {message && <p className={(message.tone === 'ok' ? 'ad-help' : 'ad-error') + ' imp-pad'} role="status">{message.tone === 'ok' ? '✓ ' : ''}{message.text}</p>}
      <div className="imp-scroll" onPaste={paste}>
        <table className="imp-grid">
          <colgroup><col style={{ width: 40 }} /><col style={{ width: 150 }} /><col /><col style={{ width: 210 }} /><col style={{ width: 84 }} /><col style={{ width: 84 }} /><col style={{ width: 120 }} /><col style={{ width: 150 }} /><col style={{ width: 40 }} /></colgroup>
          <thead><tr><th className="c">#</th><th>Customer number</th><th>Name <span className="imp-opt">optional</span></th><th>Service</th><th>Type</th><th className="r">Qty</th><th className="r">Price (₹)</th><th>Payment</th><th /></tr></thead>
          <tbody>
            {rows.map((row, i) => {
              const index = i + 1;
              const phone = normalizePhone(row.phone);
              const suggestion = !row.name.trim() ? suggestions.get(phone) : undefined;
              const type = typeOf(row.service);
              return <tr key={row.id}>
                <td className="imp-idx">{index}</td>
                <td className={cellClass(index, 'phone')} title={errors[key(index, 'phone')]}><input inputMode="tel" placeholder={i === 0 ? '9886012345' : ''} aria-label={`Customer number, row ${index}`} value={row.phone} disabled={!ready || busy} onChange={event => patch(row.id, { phone: event.target.value })} onBlur={() => void lookup(row.phone)} /></td>
                <td className={cellClass(index, 'name')} title={errors[key(index, 'name')]}><input aria-label={`Name, row ${index}`} className={suggestion ? 'imp-auto' : undefined} value={row.name || suggestion || ''} disabled={!ready || busy} onChange={event => patch(row.id, { name: event.target.value })} /></td>
                <td className={cellClass(index, 'service')} title={errors[key(index, 'service')]}>
                  <select aria-label={`Service, row ${index}`} value={row.service} disabled={!ready || busy} onChange={event => patch(row.id, { service: event.target.value })}>
                    <option value="">{ready ? 'Select service' : ''}</option>
                    {context?.services.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
                  </select></td>
                <td className="imp-ro">{type ? <span className="imp-type">{type === 'WEIGHT' ? 'Weight' : 'Item'}</span> : null}</td>
                <td className={cellClass(index, 'quantity') + ' r'} title={errors[key(index, 'quantity')]}><input inputMode="decimal" aria-label={`Quantity, row ${index}`} value={row.qty} disabled={!ready || busy} onChange={event => patch(row.id, { qty: event.target.value })} /></td>
                <td className={cellClass(index, 'price') + ' r'} title={errors[key(index, 'price')]}><input inputMode="decimal" aria-label={`Price charged, row ${index}`} value={row.price} disabled={!ready || busy} onChange={event => patch(row.id, { price: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && i === rows.length - 1 && rows.length < MAX_ROWS) setRows(current => [...current, { ...blankRow(), method: defaultMethod() }]); }} /></td>
                <td className={cellClass(index, 'payment')} title={errors[key(index, 'payment')]}>
                  <select aria-label={`Payment method, row ${index}`} value={row.method} disabled={!ready || busy} onChange={event => patch(row.id, { method: event.target.value })}>
                    <option value="">{ready ? 'Select' : ''}</option>
                    {context?.methods.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                  </select></td>
                <td className="imp-x"><button type="button" aria-label={`Delete row ${index}`} disabled={busy || isBlank(row)} onClick={() => remove(row.id)}>✕</button></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="imp-add" disabled={busy || rows.length >= MAX_ROWS} onClick={() => setRows(current => [...current, { ...blankRow(), method: defaultMethod() }])}>+ Add row</button>
    </div>

    {context && <div className="card">
      <div className="card-head"><h2>Saved batches</h2></div>
      <div className="card-body">
        {!context.batches.length ? <p className="ad-help" style={{ margin: 0 }}>Nothing has been saved for this organization yet.</p> : <div className="tablecard"><table>
          <thead><tr><th>Saved</th><th>Outlet</th><th>Order date</th><th>Orders</th><th>Total</th><th>Status</th><th /></tr></thead>
          <tbody>{context.batches.map(batch => <tr key={batch.id}>
            <td>{new Date(batch.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}<div className="ad-help" style={{ margin: 0 }}>{batch.createdBy}</div></td>
            <td>{batch.outletName}</td><td>{batch.businessDate}</td><td>{batch.orderCount}</td><td>{money(batch.totalAmount)}</td>
            <td><span className={'badge ' + (batch.status === 'IMPORTED' ? 'good' : 'gray')}>{batch.status === 'IMPORTED' ? 'Saved' : 'Undone'}</span></td>
            <td>{batch.canUndo && <Button secondary type="button" disabled={busy} onClick={() => setUndoing(batch.id)}>Undo</Button>}</td>
          </tr>)}</tbody>
        </table></div>}
      </div>
    </div>}

    {confirmImport && preview && <ConfirmationDialog title="Save these records?" confirmLabel="Save"
      description={`${preview.orderCount} order${preview.orderCount === 1 ? '' : 's'} from ${preview.rowCount} row${preview.rowCount === 1 ? '' : 's'} on ${date}, ${money(preview.totalAmount)} collected${[...new Set(rows.filter(row => !isBlank(row)).map(row => row.method))].length ? ` by ${[...new Set(rows.filter(row => !isBlank(row)).map(row => row.method))].join(', ')}` : ''}. Each is marked Delivered and paid. You can undo the whole import afterwards unless an order is changed.`}
      onCancel={() => setConfirmImport(false)} onConfirm={() => void runImport()} />}
    {undoing && <ConfirmationDialog title="Undo this batch?" confirmLabel="Undo batch"
      description="The orders from this import are removed and the daily totals they added are reversed. This is refused if any of them has been changed since."
      onCancel={() => setUndoing(null)} onConfirm={() => void runUndo(undoing)} />}
  </div>;
}
