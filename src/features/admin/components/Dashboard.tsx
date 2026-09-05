import Link from 'next/link';
import type { Order } from '../admin.types';
import type { dashboardData } from '../admin.analytics';
import { money } from '../admin.data';
import { Metric } from './Primitives';
import { SalesChart, CashChart, StatusChart, ServiceChart } from './DashboardCharts';
import OrderTable from './OrderTable';

export type DashboardData = ReturnType<typeof dashboardData>;
export default function Dashboard({ data: d, onSelect }: { data: DashboardData; onSelect: (order: Order) => void }) {
  return <>
    <div className="ad-section-label"><span>Today and open orders</span><span>Order counts</span></div>
    <div className="ad-metrics">
      <Metric primary label="Orders today" value={String(d.todayCount)} detail={money(d.todaySales) + ' · new orders today'}/>
      <Metric label="Waiting to start" value={String(d.pendingCount)} detail={money(d.pendingAmount) + ' · Pending, all dates'}/>
      <Metric label="Completed today" value={String(d.completed)} detail={money(d.completedAmount) + ' · marked completed today'}/>
      <Metric label="Due today" value={String(d.dueToday)} detail={d.overdue + ' more orders are late · not completed'}/>
    </div>
    {(d.dueToday > 0 || d.overdue > 0) && <div className="ad-delivery-reminder">
      <p><strong>{d.dueToday} due today · {d.overdue} late</strong><span>These orders still need to be completed.</span></p>
      <Link className="ad-text-link" href="/admin/sales?attention=1">View these orders ↗</Link>
    </div>}
    <div className="ad-dashboard-grid ad-analytics-primary">
      <section className="ad-card">
        <div className="ad-card-heading"><div><h2>Sales by date</h2><p>Total order prices · selected dates above</p></div><span className="ad-chart-key"><i/>Sales</span></div>
        <div className="ad-chart-total"><strong>{money(d.periodSales)}</strong><span>{d.periodOrders} orders</span></div>
        <SalesChart points={d.bars}/>
      </section>
      <section className="ad-card">
        <div className="ad-card-heading"><div><h2>Money in & expenses</h2><p>{d.month} · this month only</p></div></div>
        <div className="ad-chart-total"><strong>{money(d.income - d.expenses)}</strong><span>Received minus spent</span></div>
        <div className="ad-cash-legend"><span><i/>{money(d.income)} received</span><span><i/>{money(d.expenses)} spent</span></div>
        <CashChart points={d.cash}/><p className="ad-chart-note">Payments received minus bills paid. Not profit or bank balance.</p>
      </section>
    </div>
    <div className="ad-dashboard-grid ad-analytics-secondary">
      <section className="ad-card">
        <div className="ad-card-heading"><div><h2>How orders are moving</h2><p>Orders created in the selected dates</p></div></div>
        <StatusChart entries={d.statuses}/>
        <p className="ad-chart-note">Pending = not started · In Progress = being worked on · Completed = finished.</p>
      </section>
      <section className="ad-card">
        <div className="ad-card-heading"><div><h2>Sales by service</h2><p>Total order prices for each service · selected dates</p></div></div>
        <ServiceChart entries={d.serviceMix}/>
      </section>
    </div>
    <section className="ad-card ad-table-card">
      <div className="ad-card-heading"><div><h2>Orders to finish</h2><p>All unfinished orders, oldest delivery date first</p></div><Link className="ad-text-link" href="/admin/sales?attention=1">Due today & late ↗</Link></div>
      <OrderTable orders={d.commitments} onSelect={onSelect} compact/>
    </section>
  </>;
}
