import { Card, ShimmerLine, ShimmerRow, ShimmerTile } from './ui';

export function DashboardLoading() {
  return <div className="dashboard dashboard-loading" role="status" aria-label="Loading dashboard" aria-busy="true">
    <div className="dashboard-heading"><h1>Dashboard</h1><ShimmerLine /></div>
    <div className="stats-row">{Array.from({ length: 4 }, (_, index) => <ShimmerTile key={index} />)}</div>
    <Card><ShimmerLine /><div className="shimmer dashboard-loading-chart" /></Card>
    <Card><ShimmerLine /><ShimmerRow count={4} /></Card>
  </div>;
}
