import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Order } from '../admin.types';
import type { dashboardData, TrendPoint } from '../admin.analytics';
import { money, total } from '../admin.data';
import { SalesChart, EarningsDonut } from './DashboardCharts';
import { Card, CardHeading, StatTile, Badge, SectionNote, EmptyState } from './ui';

export type DashboardData = ReturnType<typeof dashboardData>;
export interface DashboardOutlet {
  id: string;
  outletCode: string;
  displayName: string;
  status: string;
}
export interface DashboardOutletSummary {
  outletId: string;
  businessDate: string;
  ordersCreatedCount: number;
  grossOrderAmount: number;
  expensesAmount: number;
}

export default function Dashboard({ data: d, summaries = [], allOutletsSelected, outlets = [], outletName,
  recentOrders, previousPoints, businessDate, yesterday, trendTitle = 'Sales trend — last 14 days', trendControl,
  onSelect,
}: {
  data: DashboardData;
  summaries?: DashboardOutletSummary[];
  allOutletsSelected?: boolean;
  outlets?: DashboardOutlet[];
  outletName?: string;
  recentOrders: Order[];
  previousPoints: TrendPoint[];
  businessDate: string;
  yesterday: string;
  trendTitle?: string;
  trendControl?: ReactNode;
  onSelect: (order: Order) => void;
}) {
  const isAllOutlets = Boolean(allOutletsSelected && outlets.length > 1);
  const todaySummaries = summaries.filter(s => s.businessDate === businessDate);
  const yesterdaySummaries = summaries.filter(s => s.businessDate === yesterday);
  const maxSales = Math.max(...todaySummaries.map(s => s.grossOrderAmount), 0);
  const attention = <Card className="dashboard-attention">
    <CardHeading title="Needs attention" subtitle="Overdue & unpaid" />
    <div className="dashboard-attention-rows">
      {d.overdue > 0 && <div className="row"><span>{d.overdue} order{d.overdue === 1 ? '' : 's'} overdue</span><Badge tone="warn">Action</Badge></div>}
      {d.dueToday > 0 && <div className="row"><span>{d.dueToday} order{d.dueToday === 1 ? '' : 's'} due today</span><Badge tone="warn">Action</Badge></div>}
      {d.overdue === 0 && d.dueToday === 0 && <p className="dashboard-muted">All caught up!</p>}
    </div>
  </Card>;
  const recent = <Card className="dashboard-recent">
    <CardHeading title={isAllOutlets ? 'Recent orders — all outlets' : 'Recent orders'}
      subtitle={isAllOutlets ? 'Newest first, every outlet combined' : 'Latest activity at this outlet'}
      action={<Link href="/admin/orders" className="btn btn-secondary">View all →</Link>} />
    {recentOrders.length ? <div className="dashboard-table-scroll" tabIndex={0} role="region" aria-label="Recent orders">
      <table className="grid"><thead><tr><th scope="col">Order</th><th scope="col">Customer</th>{isAllOutlets && <th scope="col">Outlet</th>}<th scope="col">Status</th><th scope="col" className="num">Amount</th></tr></thead>
        <tbody>{recentOrders.slice(0, isAllOutlets ? 3 : 4).map(order => <tr key={order.id}>
          <td className="mono"><button type="button" className="dashboard-order-link" onClick={() => onSelect(order)} aria-label={`Open order ${order.id}`}>{order.id}</button></td>
          <td>{order.name || 'Walk-in customer'}</td>
          {isAllOutlets && <td>{outlets.find(outlet => outlet.id === order.outletId)?.displayName ?? 'Unassigned'}</td>}
          <td><Badge tone={order.status === 'Delivered' ? 'on' : order.status === 'Pending' ? 'off' : 'warn'}>{order.status}</Badge></td>
          <td className="num mono">{money(total(order))}</td>
        </tr>)}</tbody>
      </table>
    </div> : <EmptyState firstUseTitle="No orders yet" firstUseDescription={isAllOutlets ? 'New orders from your outlets will appear here.' : 'New orders at this outlet will appear here.'}
      firstUseAction={<Link href="/admin/sales" className="btn btn-primary">Create an order</Link>} />}
  </Card>;

  return <div className="dashboard" data-view={isAllOutlets ? 'all-outlets' : 'single-outlet'}>
    <div className="dashboard-heading"><h1>Dashboard</h1><p>{isAllOutlets
      ? `Aggregated across ${outlets.length} outlets. Switch to one outlet above to see its own numbers only.`
      : `Today's overview${outletName ? ` — ${outletName}` : ''}.${outlets.length === 1 ? " One outlet on this account, so there's no switcher." : ''}`}</p></div>
    <div className="stats-row">
      <StatTile label="Today's sales" value={money(d.todaySales)} />
      <StatTile label="Orders today" value={String(d.todayCount)} />
      <StatTile label="Open orders" value={String(d.todo)} />
      <StatTile label="Expenses this month" value={money(d.expenses)} />
    </div>
    <Card className="dashboard-trend"><CardHeading title={trendTitle} subtitle={isAllOutlets ? 'All outlets combined' : 'This outlet'} action={trendControl} />
      <SalesChart points={d.bars} previousPoints={previousPoints} />
    </Card>
    {isAllOutlets && <>
      <section className="dashboard-outlets" aria-label="Per-outlet summary">
        <SectionNote>Per-outlet summary — today, share of best-performing outlet</SectionNote>
        <div className="dashboard-outlet-grid">{outlets.map((outlet, index) => {
          const current = todaySummaries.find(s => s.outletId === outlet.id);
          const sales = current?.grossOrderAmount ?? 0;
          const ydaySales = yesterdaySummaries.find(s => s.outletId === outlet.id)?.grossOrderAmount ?? 0;
          const pct = maxSales > 0 ? sales / maxSales * 100 : 0;
          const growth = ydaySales > 0 ? (sales - ydaySales) / ydaySales * 100 : null;
          const openOrders = d.commitments.filter(order => order.outletId === outlet.id).length;
          return <Card key={outlet.id} className="dashboard-outlet">
            <CardHeading title={<h2>{outlet.displayName}</h2>} subtitle={<span className="mono">{outlet.outletCode}</span>}
              action={<Badge tone={outlet.status === 'ACTIVE' ? 'on' : 'off'}>{outlet.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge>} />
            <div className="dashboard-outlet-metrics">
              <div className="row"><span>Sales today</span><strong className="mono">{money(sales)}</strong></div>
              <div className="row"><span>Orders</span><strong className="mono">{current?.ordersCreatedCount ?? 0}</strong></div>
              <div className="row"><span>Open orders</span><strong className="mono">{openOrders}</strong></div>
            </div>
            <div><div className="dashboard-share" role="meter" aria-label={`${outlet.displayName}: share of best outlet sales`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${pct}%`, background: ['var(--brand)', '#4d86e0', '#a8c7f8'][index % 3] }} />
            </div><div className="row dashboard-comparison"><span>{pct === 100 ? 'Best outlet today' : `${Math.round(pct)}% of best outlet`}</span>
              {growth !== null && <Badge tone={growth >= 0 ? 'on' : 'warn'}>{growth >= 0 ? '↑' : '↓'} {Math.round(Math.abs(growth))}% vs yesterday</Badge>}
            </div></div>
            <Link href={`/admin/outlets/${outlet.id}`} className="btn btn-secondary">View detail ↗</Link>
          </Card>;
        })}</div>
      </section>
      <Card className="dashboard-earnings"><CardHeading title="Collected vs expenses — this month" subtitle={isAllOutlets ? 'All outlets combined · payments collected this month' : 'This outlet · payments collected this month'}
        action={<Badge tone={d.income >= d.expenses ? 'on' : 'warn'}>Net {money(d.income - d.expenses)}</Badge>} />
        <EarningsDonut income={d.income} expenses={d.expenses} />
      </Card>
      {attention}{recent}
    </>}
    {!isAllOutlets && <div className="dashboard-bottom-grid">{recent}{attention}</div>}
  </div>;
}
