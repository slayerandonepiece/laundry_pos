'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export default function SubscriptionsShell({ planCount, storeCount, children }: {
  planCount: number;
  storeCount: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const tabs: [string, string, number][] = [
    ['/super-admin/subscriptions', 'Plans', planCount],
    ['/super-admin/subscriptions/billing', 'Billing by store', storeCount],
  ];
  return <>
    <div className="tabs">
      {tabs.map(([href, label, count]) => {
        const active = pathname === href;
        return <Link key={href} href={href} className={'tab' + (active ? ' on' : '')} aria-current={active ? 'page' : undefined}>
          {label}<span className="pill">{count}</span>
        </Link>;
      })}
    </div>
    {children}
  </>;
}
