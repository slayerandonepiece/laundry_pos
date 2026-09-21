import React from 'react';
import Link from 'next/link';
import type { OutletListItem } from '@/features/super-admin/types';
import { Card, Badge, ErrorBanner, EmptyState, ShimmerRow } from './ui';

export function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
          <table className="grid">
            <thead>
              <tr>
                <th>Outlet</th>
                <th>Code</th>
                <th>Status</th>
                <th>Opened</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {outlets.map(outlet => {
                const isRelocated = outlet.status === 'RELOCATED';
                const isClosed = outlet.status === 'CLOSED';
                const tone = isClosed ? 'off' : isRelocated ? 'warn' : 'on';
                const label = outlet.status.charAt(0) + outlet.status.slice(1).toLowerCase();
                
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
                    <td>
                      <Link href={`/admin/outlets/${outlet.id}`} className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                        View ↗
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
