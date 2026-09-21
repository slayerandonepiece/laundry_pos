'use client';

import React from 'react';
import Link from 'next/link';
import type { OutletDetail as OutletDetailType } from '@/features/super-admin/types';
import { useAdmin } from '@/features/admin/containers/AdminProvider';
import { AccessBlockedScreen, PaymentWarningBanner } from '@/features/admin/components/AccessNotices';
import { Card, CardHeading, StatTile, StatsRow, Badge, Pill, ErrorBanner } from '@/features/admin/components/ui';

export function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function OutletDetail({ outlet }: { outlet: OutletDetailType }) {
  const { blockedReason, blockedPaidThroughDate, paymentWarning, user } = useAdmin();
  const isOwner = user?.role === 'owner';

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
                <StatTile label="Today's sales" value="₹0" />
                <StatTile label="Orders today" value="0" />
                <StatTile label="Pending" value="0" />
                <StatTile label="Items sold today" value="0" />
              </StatsRow>
            </Card>

            <Card>
              <CardHeading 
                title={<><h2 style={{ fontSize: '15px', margin: 0 }}>Earnings vs expenses — this month</h2><p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>This outlet only · donut share</p></>} 
                action={<Badge tone="on">Net ₹0</Badge>} 
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                <svg viewBox="0 0 200 200" style={{ width: '140px', height: '140px', flexShrink: 0 }} role="img" aria-label="Earnings vs expenses this month, donut chart">
                  <circle transform="rotate(-90 100 100)" cx="100" cy="100" r="70" fill="none" stroke="#e4e8ee" strokeWidth="22" strokeLinecap="round" />
                  <text x="100" y="96" textAnchor="middle" fontSize="19" fontWeight="700" fill="#102039" fontFamily="IBM Plex Mono, monospace">₹0</text>
                  <text x="100" y="116" textAnchor="middle" fontSize="10" fill="#5b6879" fontFamily="DM Sans, sans-serif">Total this month</text>
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flexGrow: 1 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#0758d6', display: 'inline-block' }}></span>Earnings</span>
                    <strong className="mono">₹0 · 0%</strong>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#a8c7f8', display: 'inline-block' }}></span>Expenses</span>
                    <strong className="mono">₹0 · 0%</strong>
                  </span>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeading 
                title={<><h2 style={{ fontSize: '15px', margin: 0 }}>Sales trend — last 14 days</h2><p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>This outlet only</p></>} 
                action={<Pill>14d ▾</Pill>} 
              />
              <div style={{ height: '170px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '13px', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                No recent order data.
              </div>
            </Card>

            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '19px' }}>
                <CardHeading title={<><h2 style={{ fontSize: '15px', margin: 0 }}>Employees at this outlet</h2><p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>Active outlet membership</p></>} />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="grid">
                  <thead><tr><th>Name</th><th>Role</th><th></th></tr></thead>
                  <tbody>
                    <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 12px' }}>No employees found.</td></tr>
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
                <text x="100" y="96" textAnchor="middle" fontSize="26" fontWeight="700" fill="#102039" fontFamily="IBM Plex Mono, monospace">0</text>
                <text x="100" y="116" textAnchor="middle" fontSize="11" fill="#5b6879" fontFamily="DM Sans, sans-serif">Orders</text>
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', justifyContent: 'space-between' }}><span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#0758d6', display: 'inline-block' }}></span>Delivered</span><strong>0%</strong></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', justifyContent: 'space-between' }}><span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#4d86e0', display: 'inline-block' }}></span>Ready</span><strong>0%</strong></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', justifyContent: 'space-between' }}><span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#a8c7f8', display: 'inline-block' }}></span>In progress</span><strong>0%</strong></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', justifyContent: 'space-between' }}><span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#e5e9ef', display: 'inline-block' }}></span>Pending</span><strong>0%</strong></span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
