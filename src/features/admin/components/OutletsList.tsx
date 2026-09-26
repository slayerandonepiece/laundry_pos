import React from 'react';
import Link from 'next/link';
import type { OutletListItem } from '@/features/super-admin/types';
import { Card, Badge, ErrorBanner, EmptyState } from './ui';

export function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function outletStatusBadge(status: string): { tone: 'off' | 'warn' | 'on'; label: string } {
  const isRelocated = status === 'RELOCATED';
  const isClosed = status === 'CLOSED';
  const tone = isClosed ? 'off' : isRelocated ? 'warn' : 'on';
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return { tone, label };
}

export default function OutletsList({ outlets }: { outlets: OutletListItem[] }) {
  // If undefined, it's loading. But AdminScreenContainer renders it when ready.
  // We'll just assume it's loaded if outlets is an array.
  
  return (
    <>
      <ErrorBanner variant="info" message="Outlets are provisioned and managed by platform support. Contact support to add or relocate a branch." />
      
      {!outlets.length ? (
        <EmptyState
          icon="◫"
          title="No outlets yet"
          description="Contact platform support to provision your first physical branch."
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div className="outlet-table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Outlet</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Opened</th>
                  <th style={{ textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {outlets.map(outlet => {
                  const { tone, label } = outletStatusBadge(outlet.status);

                  return (
                    <tr key={outlet.id}>
                      <td>
                        <strong>{outlet.displayName}</strong>
                        {outlet.address && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{outlet.address}</div>}
                      </td>
                      <td className="mono">{outlet.outletCode}</td>
                      <td>
                        <Badge tone={tone}>{label}</Badge>
                      </td>
                      <td className="mono">{dateLabel(outlet.openedAt)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href={`/admin/outlets/${outlet.id}`} className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="outlet-cards">
            {outlets.map(outlet => {
              const { tone, label } = outletStatusBadge(outlet.status);

              return (
                <article key={outlet.id} className="outlet-card">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{outlet.displayName}</strong>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                  {outlet.address && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{outlet.address}</span>}
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    {outlet.outletCode} · Opened {dateLabel(outlet.openedAt)}
                  </span>
                  <Link href={`/admin/outlets/${outlet.id}`} className="btn btn-secondary outlet-card-view" style={{ textDecoration: 'none' }}>
                    View
                  </Link>
                </article>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}
