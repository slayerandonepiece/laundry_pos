'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Order } from '../admin.types';
import { rangeFor } from '../admin.data';
import { SALES_PAGE_SIZES, SALES_PERIOD_COOKIE, encodeSalesPeriod, salesHref, type SalesPeriod, type SalesQuery } from '../sales-query';
import OrderTable from './OrderTable';
import { DateFilter } from './Primitives';
import { TableLoading } from './WorkspaceLoading';
import Pager from '@/features/super-admin/components/Pager';
import { SingleSelectDropdown } from './ui';

interface Props {
  orders: Order[]; query: SalesQuery; total: number;
  /** True when the store (or the employee's outlet) has any order, regardless of the dates and filters. */
  hasOrders: boolean;
  employee: boolean; readOnly: boolean;
  onSelect: (order: Order) => void;
  outlets?: { id: string; name: string }[];
}

/** Sales history: filters live in the URL and each change loads one page from the server. */
export default function Sales({ orders, query, total, hasOrders, employee, readOnly, onSelect, outlets }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The filter bar shows the requested values straight away, while the page loads.
  const [draft, setDraft] = useState(query);
  const [typedQ, setTypedQ] = useState<string | null>(null);
  const [seenHref, setSeenHref] = useState(() => salesHref(query));
  const href = salesHref(query);
  if (href !== seenHref) {
    // A navigation landed (filters, back/forward or a refresh): follow the URL, keeping unsent typing.
    setSeenHref(href);
    setDraft({ ...query, q: typedQ ?? query.q });
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(next: SalesQuery, replace = false) {
    setDraft(next);
    startTransition(() => {
      if (replace) router.replace(salesHref(next), { scroll: false });
      else router.push(salesHref(next), { scroll: false });
    });
  }
  const update = (patch: Partial<SalesQuery>) => navigate({ ...draft, ...patch, page: 1 });
  function remember(period: SalesPeriod, from: string, to: string) {
    // Read by the server page when a link names no period (see SALES_PERIOD_COOKIE).
    document.cookie = `${SALES_PERIOD_COOKIE}=${encodeSalesPeriod(period, from, to)}; path=/admin/sales; samesite=lax`;
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function onSearch(value: string) {
    setDraft(current => ({ ...current, q: value }));
    setTypedQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setTypedQ(null);
      navigate({ ...draft, q: value, page: 1 }, true);
    }, 300);
  }
  function onPeriod(value: string) {
    const period = value as SalesPeriod;
    // Custom dates wait for Apply: choosing the option alone must not load anything.
    if (period === 'custom') { setDraft(current => ({ ...current, period })); return; }
    const range = rangeFor(period);
    remember(period, range.from, range.to);
    update({ period, ...range, due: '' });
  }
  function onRange(range: { from: string; to: string }) {
    if (!range.from || !range.to || range.from > range.to) return;
    remember('custom', range.from, range.to);
    update({ period: 'custom', ...range, due: '' });
  }
  const filtered = Boolean(draft.q.trim()) || Boolean(draft.work) || Boolean(draft.pay) || Boolean(draft.due);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; setTypedQ(null); update({ q: '', work: '', pay: '', due: '' }); };

  // Orders exist but none fall in the selected dates or match the filters: say so instead of "No orders yet".
  const emptyText = !hasOrders ? undefined
    : query.q || query.work || query.pay ? 'No orders match this search. Try another filter.'
    : query.due === 'today' ? 'No open orders are due today.'
    : query.due === 'late' ? 'No open orders are past their delivery date.'
    : query.due === 'attention' ? 'No open orders are due today or overdue.'
    : 'No orders in the selected dates. Choose another period to see more orders.';
  const toggles: [SalesQuery['due'], string][] = [['today', 'Due today'], ['late', 'Late']];
  if (draft.due === 'attention') toggles.push(['attention', 'Due & overdue']);

  return <div className="ad-sales">
    <div className="ad-sales-head">
      <div>
        <h1>Sales</h1>
        <p>Browse sales history and open individual orders.</p>
      </div>
      <div className="ad-sales-head-actions">
        <DateFilter period={draft.period} range={{ from: draft.from, to: draft.to }} onPeriod={onPeriod} onRange={onRange} manual/>
        {!readOnly && <Link href="/admin/orders" className="ad-button">＋ New order</Link>}
      </div>
    </div>
    <div className="ad-sales-filters" role="search">
      <input type="search" value={draft.q} onChange={event => onSearch(event.target.value)} placeholder="Search order, customer or phone…" aria-label="Search sales"/>
      <SingleSelectDropdown ariaLabel="Filter work status" value={draft.work || 'All'} onChange={value => update({ work: value === 'All' ? '' : value as SalesQuery['work'] })} options={['All', 'Pending', 'In Progress', 'Ready', 'Delivered'].map(value => ({ value, label: value === 'All' ? 'All work statuses' : value }))}/>
      <SingleSelectDropdown ariaLabel="Filter payment status" value={draft.pay || 'All'} onChange={value => update({ pay: value === 'All' ? '' : value as SalesQuery['pay'] })} options={['All', 'Unpaid', 'Part-paid', 'Paid'].map(value => ({ value, label: value === 'All' ? 'All payment statuses' : value }))}/>
      <div className="ad-sales-toggles" aria-label="Delivery filter">
        {toggles.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={draft.due === value} onClick={() => update({ due: draft.due === value ? '' : value })}>{label}</button>
        ))}
      </div>
      {filtered && <button type="button" className="ad-text-link" onClick={clear}>Clear</button>}
    </div>
    <div className="ad-sales-register" aria-busy={pending}>
      {pending ? <TableLoading bare cols={outlets?.length ? 7 : 6} rows={Math.min(draft.size, 8)}/> : <>
        <OrderTable
          orders={orders}
          paginate={false}
          onSelect={onSelect}
          isFiltered={hasOrders}
          emptyText={emptyText}
          firstUseTitle="No orders yet"
          firstUseDescription="Orders you create in Orders will appear here."
          firstUseAction={readOnly ? undefined : <Link href="/admin/orders" className="btn btn-primary">{employee ? 'Go to counter →' : '＋ Create a new sale'}</Link>}
          onClearFilters={filtered ? clear : undefined}
          outlets={outlets}
        />
        {total > 0 && <Pager page={query.page} pageSize={query.size} total={total} sizes={SALES_PAGE_SIZES} busy={pending}
          onPage={page => navigate({ ...draft, page })} onSize={size => navigate({ ...draft, size, page: 1 })}/>}
      </>}
    </div>
  </div>;
}
