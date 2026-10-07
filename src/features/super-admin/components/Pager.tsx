'use client';

const SIZES = [10, 25, 50];

function pagesAround(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) { set.add(2); set.add(3); set.add(4); }
  if (page >= pages - 2) { set.add(pages - 1); set.add(pages - 2); set.add(pages - 3); }
  const sorted = [...set].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((n, i) => { if (i && n - sorted[i - 1] > 1) out.push('…'); out.push(n); });
  return out;
}

/** Table footer: range summary, rows per page and numbered page buttons. */
export default function Pager({ page, pageSize, total, busy, onPage, onSize, sizes = SIZES }: {
  page: number; pageSize: number; total: number; busy?: boolean; onPage: (page: number) => void; onSize: (size: number) => void; sizes?: readonly number[];
}) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  return <nav className="pager" aria-label="Pagination">
    <span className="pager-range">{total ? <>Showing <b className="num">{from}–{to}</b> of <b className="num">{total}</b></> : 'No results'}</span>
    <label className="pager-size">Rows per page
      <select value={pageSize} disabled={busy} onChange={event => onSize(Number(event.target.value))} aria-label="Rows per page">
        {sizes.map(size => <option key={size} value={size}>{size}</option>)}
      </select></label>
    <div className="pager-pages">
      <button type="button" disabled={busy || page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
      {pagesAround(page, pages).map((entry, index) => entry === '…'
        ? <span key={`gap-${index}`} className="pager-gap" aria-hidden="true">…</span>
        : <button key={entry} type="button" className={entry === page ? 'on' : ''} aria-current={entry === page ? 'page' : undefined} disabled={busy} onClick={() => onPage(entry)}>{entry}</button>)}
      <button type="button" disabled={busy || page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
    </div>
  </nav>;
}
