'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import type { OutletDetail as OutletDetailType } from '@/features/super-admin/types';
import type { Order, Expense, Product, Employee } from '@/features/admin/admin.types';
import { useAdmin } from '@/features/admin/containers/AdminProvider';
import { AccessBlockedScreen, PaymentWarningBanner } from '@/features/admin/components/AccessNotices';
import { Card, CardHeading, StatTile, StatsRow, Badge, Pill, ErrorBanner } from '@/features/admin/components/ui';
import { SalesChart, EarningsDonut } from '@/features/admin/components/DashboardCharts';
import { dashboardData } from '@/features/admin/admin.analytics';
import { money, today } from '@/features/admin/admin.data';

export function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function OutletDetail({
  outlet,
  serverOrders = [],
  serverExpenses = [],
  serverProducts = [],
  serverEmployees = [],
}: {
  outlet: OutletDetailType;
  serverOrders?: Order[];
  serverExpenses?: Expense[];
  serverProducts?: Product[];
  serverEmployees?: Employee[];
}) {
  const { blockedReason, blockedPaidThroughDate, paymentWarning, user } = useAdmin();
  const isOwner = user?.role === 'owner';

  const current = today();
  const range14d = useMemo(() => {
    const from = new Date(Date.parse(current) - 13 * 86400000).toISOString().slice(0, 10);
    return { from, to: current };
  }, [current]);

  const d = useMemo(() => {
    return dashboardData(
      { orders: serverOrders, expenses: serverExpenses, products: serverProducts },
      range14d,
    );
  }, [serverOrders, serverExpenses, serverProducts, range14d]);

  const openOrdersCount = serverOrders.filter(
    order => !order.legacyCancelled && order.status !== 'Delivered' && (order.status as string) !== 'Completed'
  ).length;

  const itemsSoldToday = useMemo(() => {
    return serverOrders
      .filter(order => order.date === current && !order.legacyCancelled)
      .flatMap(order => order.lines)
      // Pieces only: kg lines are weights, not item counts.
      .filter(line => line.unit === 'pcs')
      .reduce((sum, line) => sum + (line.quantity || 0), 0);
  }, [serverOrders, current]);

  const todayOrders = useMemo(() => {
    return serverOrders.filter(o => o.date === current && !o.legacyCancelled);
  }, [serverOrders, current]);

  const statusCounts = useMemo(() => {
    const delivered = todayOrders.filter(o => o.status === 'Delivered').length;
    const ready = todayOrders.filter(o => o.status === 'Ready').length;
    const inProgress = todayOrders.filter(o => o.status === 'In Progress').length;
    const pending = todayOrders.filter(o => o.status === 'Pending').length;
    return { delivered, ready, inProgress, pending, total: todayOrders.length };
  }, [todayOrders]);

  if (blockedReason) {
    return (
      <div className="ad-screen-content">
        <AccessBlockedScreen reason={blockedReason} isOwner={isOwner} paidThroughDate={blockedPaidThroughDate} />
      </div>
    );
  }

  const isRelocated = outlet.status === 'RELOCATED';
  const isClosed = outlet.status === 'CLOSED';
  const statusTone = isClosed ? 'off' : isRelocated ? 'warn' : 'on';
  const statusLabel = outlet.status.charAt(0) + outlet.status.slice(1).toLowerCase();

  const circ = 439.8; // 2 * Math.PI * 70
  const dPct = statusCounts.total > 0 ? (statusCounts.delivered / statusCounts.total) * 100 : 0;
  const rPct = statusCounts.total > 0 ? (statusCounts.ready / statusCounts.total) * 100 : 0;
  const ipPct = statusCounts.total > 0 ? (statusCounts.inProgress / statusCounts.total) * 100 : 0;
  const pPct = statusCounts.total > 0 ? (statusCounts.pending / statusCounts.total) * 100 : 0;

  const dDash = (dPct / 100) * circ;
  const rDash = (rPct / 100) * circ;
  const ipDash = (ipPct / 100) * circ;
  const pDash = (pPct / 100) * circ;

  const rOffset = -dDash;
  const ipOffset = -(dDash + rDash);
  const pOffset = -(dDash + rDash + ipDash);

  return (
    <>
      {paymentWarning && <PaymentWarningBanner isOwner={isOwner} paidThroughDate={paymentWarning.paidThroughDate} />}
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <Link href="/admin/outlets" style={{ fontSize: '12.5px', color: 'var(--muted)', textDecoration: 'none' }}>
          ← Back to outlets
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ width: '46px', height: '46px', fontSize: '16px', borderRadius: '12px', background: 'var(--tint)', color: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
              {outlet.displayName.charAt(0)}
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '20px', margin: 0, fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{outlet.displayName}</h1>
                <Badge tone={statusTone}>{statusLabel}</Badge>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                Code <span className="mono">{outlet.outletCode}</span> · Opened <span className="mono">{dateLabel(outlet.openedAt)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="ad-outlet-detail-grid">
          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Card>
              <CardHeading title={<><h2 style={{ fontSize: '15px', margin: 0 }}>Today&apos;s snapshot</h2><p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>This outlet only</p></>} />
              <StatsRow>
                <StatTile label="Today's sales" value={money(d.todaySales)} />
                <StatTile label="Orders today" value={String(d.todayCount)} />
                <StatTile label="Open orders" value={String(openOrdersCount)} />
                <StatTile label="Pieces sold today" value={String(itemsSoldToday)} />
              </StatsRow>
            </Card>

            <Card>
              <CardHeading 
                title={<><h2 style={{ fontSize: '15px', margin: 0 }}>Collected vs expenses — this month</h2><p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>This outlet only · donut share</p></>} 
                action={<Badge tone={d.income >= d.expenses ? 'on' : 'warn'}>Net {money(d.income - d.expenses)}</Badge>} 
              />
              <EarningsDonut income={d.income} expenses={d.expenses} />
            </Card>

            <Card className="dashboard-trend">
              <CardHeading 
                title={<><h2 style={{ fontSize: '15px', margin: 0 }}>Sales trend — last 14 days</h2><p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>This outlet only</p></>} 
                action={<Pill>14d ▾</Pill>} 
              />
              <SalesChart points={d.bars} />
            </Card>

            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '19px' }}>
                <CardHeading title={<><h2 style={{ fontSize: '15px', margin: 0 }}>Employees at this outlet</h2><p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>Active outlet membership</p></>} />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="grid">
                  <thead><tr><th>Name</th><th>Username</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
                  <tbody>
                    {serverEmployees.length > 0 ? serverEmployees.map(emp => (
                      <tr key={emp.id}>
                        <td><strong>{emp.name}</strong></td>
                        <td className="mono">{emp.username}</td>
                        <td style={{ textAlign: 'right' }}>
                          <Badge tone={emp.active ? 'on' : 'off'}>{emp.active ? 'Active' : 'Inactive'}</Badge>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 12px' }}>No employees found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Right Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Card>
              <CardHeading title={<><h2 style={{ fontSize: '15px', margin: 0 }}>Contact & details</h2><p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>Read-only</p></>} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Address</span><span style={{ textAlign: 'right', maxWidth: '170px' }}>{outlet.address || '—'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Phone</span><span className="mono">{outlet.phone || '—'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Opened</span><span className="mono">{dateLabel(outlet.openedAt)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Status</span><Badge tone={statusTone}>{statusLabel}</Badge></div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <ErrorBanner variant="info" message="To update these details or close this outlet, contact platform support." className="mt-4" />
              </div>
            </Card>

            <Card>
              <CardHeading title={<><h2 style={{ fontSize: '15px', margin: 0 }}>Order status — today</h2><p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>This outlet only</p></>} />
              <svg viewBox="0 0 200 200" style={{ width: '150px', height: '150px', margin: '0 auto' }} role="img" aria-label="Order status breakdown donut chart">
                <circle transform="rotate(-90 100 100)" cx="100" cy="100" r="70" fill="none" stroke="#e4e8ee" strokeWidth="22" strokeLinecap="round" />
                {statusCounts.total > 0 && (
                  <>
                    {statusCounts.delivered > 0 && <circle transform="rotate(-90 100 100)" cx="100" cy="100" r="70" fill="none" stroke="#0758d6" strokeWidth="22" strokeLinecap="round" strokeDasharray={`${dDash} ${circ}`} strokeDashoffset="0" />}
                    {statusCounts.ready > 0 && <circle transform="rotate(-90 100 100)" cx="100" cy="100" r="70" fill="none" stroke="#4d86e0" strokeWidth="22" strokeLinecap="round" strokeDasharray={`${rDash} ${circ}`} strokeDashoffset={rOffset} />}
                    {statusCounts.inProgress > 0 && <circle transform="rotate(-90 100 100)" cx="100" cy="100" r="70" fill="none" stroke="#a8c7f8" strokeWidth="22" strokeLinecap="round" strokeDasharray={`${ipDash} ${circ}`} strokeDashoffset={ipOffset} />}
                    {statusCounts.pending > 0 && <circle transform="rotate(-90 100 100)" cx="100" cy="100" r="70" fill="none" stroke="#e5e9ef" strokeWidth="22" strokeLinecap="round" strokeDasharray={`${pDash} ${circ}`} strokeDashoffset={pOffset} />}
                  </>
                )}
                <text x="100" y="96" textAnchor="middle" fontSize="26" fontWeight="700" fill="#102039" fontFamily="IBM Plex Mono, monospace">{statusCounts.total}</text>
                <text x="100" y="116" textAnchor="middle" fontSize="11" fill="#5b6879" fontFamily="DM Sans, sans-serif">Orders</text>
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', justifyContent: 'space-between' }}><span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#0758d6', display: 'inline-block' }}></span>Delivered</span><strong>{statusCounts.delivered} · {Math.round(dPct)}%</strong></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', justifyContent: 'space-between' }}><span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#4d86e0', display: 'inline-block' }}></span>Ready</span><strong>{statusCounts.ready} · {Math.round(rPct)}%</strong></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', justifyContent: 'space-between' }}><span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#a8c7f8', display: 'inline-block' }}></span>In progress</span><strong>{statusCounts.inProgress} · {Math.round(ipPct)}%</strong></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', justifyContent: 'space-between' }}><span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#e5e9ef', display: 'inline-block' }}></span>Pending</span><strong>{statusCounts.pending} · {Math.round(pPct)}%</strong></span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
