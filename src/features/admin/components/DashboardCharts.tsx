'use client';
import { useState, useId } from 'react';
import { money } from '../admin.data';
import type { TrendPoint, CashPoint, Breakdown } from '../admin.analytics';

const axisMoney = (value: number) => '₹' + new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value / 100);
function Axis({ maximum }: { maximum: number }) {
  return <div className="ad-plot-axis" aria-hidden="true">{[1, .75, .5, .25, 0].map(tick => <span key={tick}>{axisMoney(maximum * tick)}</span>)}</div>;
}
export function SalesChart({ points }: { points: TrendPoint[] }) {
  const [selected, setSelected] = useState<number | null>(null), id = useId();
  const maximum = Math.max(...points.map(point => point.amount), 10000), picked = selected === null ? undefined : points[selected];
  const x = (index: number) => points.length === 1 ? 50 : index / (points.length - 1) * 100;
  const y = (amount: number) => 100 - amount / maximum * 100;
  const line = points.map((point, index) => `${x(index)},${y(point.amount)}`).join(' ');
  return <>
    <div className="ad-chart-readout" aria-live="polite">{picked ? <>{picked.label}<strong>{money(picked.amount)}</strong></> : <span>Select a point for exact sales. Future dates excluded.</span>}</div>
    <div className="ad-plot"><Axis maximum={maximum}/><div className="ad-plot-surface">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#0758d6" stopOpacity=".23"/><stop offset="1" stopColor="#0758d6" stopOpacity=".02"/></linearGradient></defs>{points.length > 0 && <><polygon points={`${x(0)},100 ${line} ${x(points.length - 1)},100`} fill={`url(#${id})`}/><polyline points={line} fill="none" stroke="#0758d6" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/></>}</svg>
      {points.map((point, index) => <button key={point.label} className={'ad-plot-point ' + (selected === index ? 'selected' : '')} style={{ left: x(index) + '%', top: y(point.amount) + '%' }} aria-label={point.label + ': ' + money(point.amount)} onFocus={() => setSelected(index)} onMouseEnter={() => setSelected(index)} onClick={() => setSelected(index)}><i/></button>)}
    </div></div>
    <div className="ad-plot-labels ad-sales-labels">{points.map((point, index) => index === 0 || index === points.length - 1 || index === Math.floor((points.length - 1) / 2) ? <span key={point.label} style={{ left: x(index) + '%', transform: index === 0 ? 'none' : index === points.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{point.label.split('–')[0]}</span> : null)}</div>
    {!points.some(point => point.amount > 0) && <p className="ad-chart-empty">No booked sales in this period.</p>}
    <details className="ad-chart-values"><summary>View sales values</summary><table><caption>Booked sales by reporting interval</caption><thead><tr><th>Dates</th><th>Sales</th></tr></thead><tbody>{points.map(point => <tr key={point.label}><td>{point.label}</td><td>{money(point.amount)}</td></tr>)}</tbody></table></details>
  </>;
}
export function CashChart({ points }: { points: CashPoint[] }) {
  const [selected, setSelected] = useState<number | null>(null), maximum = Math.max(...points.flatMap(point => [point.income, point.expenses]), 10000), picked = selected === null ? undefined : points[selected];
  const columns = { gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0, 1fr))` };
  return <><div className="ad-chart-readout" aria-live="polite">{picked ? <span>{picked.label} · In {money(picked.income)} / Out {money(picked.expenses)}</span> : <span>Select bars for exact values</span>}</div><div className="ad-plot ad-cash-plot"><Axis maximum={maximum}/><div className="ad-cash-columns" style={columns}>{points.map((point, index) => <button key={point.label} aria-label={`${point.label}: collections ${money(point.income)}, paid expenses ${money(point.expenses)}`} onFocus={() => setSelected(index)} onMouseEnter={() => setSelected(index)} onClick={() => setSelected(index)}><span className="income" style={{ height: point.income / maximum * 100 + '%' }}/><span className="expenses" style={{ height: point.expenses / maximum * 100 + '%' }}/></button>)}</div></div><div className="ad-plot-labels ad-cash-labels" style={columns}>{points.map(point => <span key={point.label}>{point.label}</span>)}</div><details className="ad-chart-values"><summary>View cash flow values</summary><table><caption>Collections and paid expenses by payment date</caption><thead><tr><th>Dates</th><th>In</th><th>Out</th></tr></thead><tbody>{points.map(point => <tr key={point.label}><td>{point.label}</td><td>{money(point.income)}</td><td>{money(point.expenses)}</td></tr>)}</tbody></table></details></>;
}
const colors = ['#d1a650', '#0758d6', '#187b68'];
export function StatusChart({ entries }: { entries: Breakdown[] }) {
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const segments = entries.map((entry, index) => ({ ...entry, offset: entries.slice(0, index).reduce((sum, previous) => sum + previous.amount, 0) }));
  return <div className="ad-status-chart"><div className="ad-donut"><svg viewBox="0 0 120 120" role="img" aria-label={total ? entries.map(entry => `${entry.label}: ${entry.amount}`).join('; ') : 'No orders in this period'}><circle cx="60" cy="60" r="47" fill="none" stroke="#edf1f6" strokeWidth="15"/>{total > 0 && segments.map((entry, index) => <circle key={entry.label} cx="60" cy="60" r="47" fill="none" stroke={colors[index]} strokeWidth="15" pathLength="100" strokeDasharray={`${entry.amount / total * 100} ${100 - entry.amount / total * 100}`} strokeDashoffset={-entry.offset / total * 100} transform="rotate(-90 60 60)"/>)}</svg><div><strong>{total}</strong><span>orders</span></div></div><ul className="ad-chart-legend">{entries.map((entry, index) => <li key={entry.label}><span><i style={{ background: colors[index] }}/>{entry.label}</span><strong>{entry.amount}</strong></li>)}</ul></div>;
}
export function ServiceChart({ entries }: { entries: Breakdown[] }) {
  const maximum = Math.max(10000, Math.ceil(Math.max(...entries.map(entry => entry.amount), 0) / 10000) * 10000);
  return <div className="ad-service-bars" role="img" aria-label={'Sales by service in rupees. ' + entries.map(e => e.label + ': ' + money(e.amount)).join('; ')}>
    <div className="ad-service-axis" aria-hidden="true">{[0, .5, 1].map(tick => <span key={tick}>{axisMoney(maximum * tick)}</span>)}</div>
    {entries.map(entry => <div className="ad-service-bar-row" key={entry.label}><span>{entry.label}</span><div className="ad-service-bar-plot"><i style={{ width: entry.amount / maximum * 100 + '%' }}/></div><strong>{money(entry.amount)}</strong></div>)}
    {!entries.some(e => e.amount > 0) && <p className="ad-chart-empty">No service sales in the selected period.</p>}
  </div>;
}
