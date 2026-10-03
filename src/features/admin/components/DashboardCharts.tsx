'use client';
import { useState, useId, useEffect, useRef } from 'react';
import { money } from '../admin.data';
import type { TrendPoint, CashPoint, Breakdown } from '../admin.analytics';

const axisMoney = (value: number) => '₹' + new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value / 100);
function Axis({ maximum }: { maximum: number }) {
  return <div className="ad-plot-axis" aria-hidden="true">{[1, .75, .5, .25, 0].map(tick => <span key={tick}>{axisMoney(maximum * tick)}</span>)}</div>;
}
export function SalesChart({ points, previousPoints = [] }: { points: TrendPoint[]; previousPoints?: TrendPoint[] }) {
  const [selected, setSelected] = useState<number | null>(null), id = useId();
  const plot = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(1180);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setPlotWidth(entry.contentRect.width < 600 ? entry.contentRect.width * 190 / 150 : 1180));
    if (plot.current) observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);
  const maximum = Math.max(...[...points, ...previousPoints].map(point => point.amount), 10000);
  const hasData = [...points, ...previousPoints].some(point => point.amount > 0);
  const x = (index: number, count: number) => count <= 1 ? plotWidth / 2 : 10 + index / (count - 1) * (plotWidth - 75);
  const y = (amount: number) => 155 - amount / maximum * 135;
  const line = (series: TrendPoint[]) => series.map((point, index) => `${index ? 'L' : 'M'}${x(index, series.length)},${y(point.amount)}`).join(' ');
  const picked = selected === null ? undefined : points[selected];
  const shortLabel = (label: string) => label.replace(/,? \d{4}/g, '');
  return <>
    <div className="dashboard-plot" ref={plot}>
      <svg viewBox={`0 0 ${plotWidth} 190`} role="img" aria-label="Sales trend, this period compared with the previous period">
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand)" stopOpacity=".2"/><stop offset="100%" stopColor="var(--brand)" stopOpacity="0"/></linearGradient></defs>
        {[20, 65, 110, 155].map(value => <line key={value} x1="10" y1={value} x2={plotWidth - 10} y2={value} stroke="#e9ebef" strokeWidth="1" strokeDasharray="3 3"/>)}
        {hasData && [1, 2 / 3, 1 / 3].map((value, index) => <text key={value} x={plotWidth - 10} y={24 + index * 45} textAnchor="end" fontSize="11.5" fill="#475569" fontWeight="600" fontFamily="var(--font-mono)">{axisMoney(maximum * value)}</text>)}
        {previousPoints.length > 0 && <path d={line(previousPoints)} fill="none" stroke="#c3d6f9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
        {points.length > 0 && <>
          <path d={`${line(points)} L${x(points.length - 1, points.length)},155 L${x(0, points.length)},155 Z`} fill={`url(#${id})`}/>
          <path d={line(points)} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx={x(points.length - 1, points.length)} cy={y(points[points.length - 1].amount)} r="4.5" fill="var(--brand)"/>
        </>}
        {points.map((point, index) => <circle key={point.label} className="dashboard-chart-point" cx={x(index, points.length)} cy={y(point.amount)} r="10" fill="transparent" tabIndex={0} role="button"
          aria-label={`${point.label}: ${money(point.amount)}`} onFocus={() => setSelected(index)} onBlur={() => setSelected(null)} onMouseEnter={() => setSelected(index)} onMouseLeave={() => setSelected(null)} onClick={() => setSelected(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(index); } }}><title>{`${point.label}: ${money(point.amount)}`}</title></circle>)}
        {points.length > 0 && [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((value, index, array) => array.indexOf(value) === index).map(index => <text key={index} x={index === 0 ? 10 : index === points.length - 1 ? plotWidth - 10 : plotWidth / 2} y="175" textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} fontSize="11.5" fill="#475569" fontWeight="500" fontFamily="var(--font-body)">{shortLabel(points[index].label)}</text>)}
      </svg>
      {picked && <output className="dashboard-chart-readout">{picked.label} · {money(picked.amount)}</output>}
      {!points.some(point => point.amount > 0) && <p className="dashboard-chart-empty">No booked sales in this period.</p>}
    </div>
    <div className="row dashboard-chart-legend"><span><i/>This period</span><span><i/>Previous period</span></div>
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

export function EarningsDonut({ income, expenses }: { income: number; expenses: number }) {
  const total = income + expenses;
  const incPct = total > 0 ? (income / total) * 100 : 0;
  const expPct = total > 0 ? (expenses / total) * 100 : 0;

  const circumference = 439.8; // 2 * pi * 70

  // Calculate dasharrays
  const incDash = (incPct / 100) * circumference;
  const expDash = (expPct / 100) * circumference;

  // Offset for expenses to start after income
  const expOffset = -incDash;

  return (
    <div className="row" style={{ gap: '18px', alignItems: 'center' }}>
      <svg viewBox="0 0 200 200" style={{ width: '110px', height: '110px', flexShrink: 0 }} role="img" aria-label="Combined earnings vs expenses this month, donut chart">
        <circle transform="rotate(-90 100 100)" cx="100" cy="100" r="70" fill="none" stroke="#edf1f6" strokeWidth="22" />
        {total > 0 && (
          <>
            {income > 0 && <circle transform="rotate(-90 100 100)" cx="100" cy="100" r="70" fill="none" stroke="#0758d6" strokeWidth="22" strokeLinecap="round" strokeDasharray={`${incDash} ${circumference}`} strokeDashoffset="0"></circle>}
            {expenses > 0 && <circle transform="rotate(-90 100 100)" cx="100" cy="100" r="70" fill="none" stroke="#a8c7f8" strokeWidth="22" strokeLinecap="round" strokeDasharray={`${expDash} ${circumference}`} strokeDashoffset={expOffset}></circle>}
          </>
        )}
        <text x="100" y="96" textAnchor="middle" fontSize="16" fontWeight="700" fill="#102039" fontFamily="IBM Plex Mono, monospace">{money(total)}</text>
        <text x="100" y="116" textAnchor="middle" fontSize="9.5" fill="#5b6879" fontFamily="DM Sans, sans-serif">Total this month</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span className="row" style={{ gap: '7px', fontSize: '12.5px', justifyContent: 'space-between' }}>
          <span className="row" style={{ gap: '7px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#0758d6', display: 'inline-block' }}></span>Collected</span>
          <strong className="mono">{money(income)} &middot; {Math.round(incPct)}%</strong>
        </span>
        <span className="row" style={{ gap: '7px', fontSize: '12.5px', justifyContent: 'space-between' }}>
          <span className="row" style={{ gap: '7px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#a8c7f8', display: 'inline-block' }}></span>Expenses</span>
          <strong className="mono">{money(expenses)} &middot; {Math.round(expPct)}%</strong>
        </span>
      </div>
    </div>
  );
}
