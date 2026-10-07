'use client';
import { useRef, useState } from 'react';
import { findCustomerNameByPhoneAction } from '../actions/orders.actions';
import { normalizePhone, isValidPhone } from '@/lib/contactValidation';
import Icon from '@/features/super-admin/components/Icon';

type Lookup = '' | 'searching' | 'found' | 'new' | 'failed';

// The customer strip at the top of the counter: phone first, looked up on
// Enter, blur or the search button; the name fills in for returning customers.
export default function CustomerBar({ phone, name, disabled, onChange }: {
  phone: string; name: string; disabled?: boolean;
  onChange: (patch: { phone?: string; name?: string }) => void;
}) {
  const request = useRef(0);
  const [lookup, setLookup] = useState<Lookup>('');
  const [error, setError] = useState('');
  async function search() {
    const normalized = normalizePhone(phone), current = ++request.current;
    if (!isValidPhone(normalized)) { setError('Enter a valid phone number (8–15 digits).'); return; }
    setError(''); setLookup('searching');
    try {
      const found = await findCustomerNameByPhoneAction(normalized);
      if (current !== request.current) return;
      onChange({ phone: normalized, name: found ?? name });
      setLookup(found ? 'found' : 'new');
    } catch { if (current === request.current) setLookup('failed'); }
  }
  return <section className="ad-ctr-customer" aria-label="Customer">
    <label className="ad-ctr-phone"><span className="ad-sr-only">Customer phone</span>
      <Icon name="phone" size="s" />
      <input type="tel" inputMode="tel" autoComplete="off" placeholder="Customer phone" value={phone} disabled={disabled}
        onChange={e => { request.current++; setLookup(''); setError(''); onChange({ phone: e.target.value, name: '' }); }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }}
        onBlur={() => { if (!lookup && isValidPhone(normalizePhone(phone))) void search(); }}/>
      <button type="button" className="ad-ctr-search" aria-label="Search customer" disabled={disabled || lookup === 'searching'} onClick={() => void search()}><Icon name="search" size="s" /></button>
    </label>
    <label className="ad-ctr-name"><span className="ad-sr-only">Customer name</span>
      <input placeholder="Name (optional)" value={name} disabled={disabled} onChange={e => onChange({ name: e.target.value })}/>
    </label>
    <span className="ad-ctr-lookup" role="status" aria-live="polite">{phone && <>
      {lookup === 'searching' && <span className="ad-ctr-tag">Searching…</span>}
      {lookup === 'found' && <span className="ad-ctr-tag ok">Returning customer</span>}
      {lookup === 'new' && <span className="ad-ctr-tag">New customer</span>}
      {lookup === 'failed' && <span className="ad-ctr-tag warn">Couldn&apos;t search. Try again.</span>}
    </>}</span>
    {error && <p className="ad-error ad-ctr-customer-error" role="alert">{error}</p>}
  </section>;
}
