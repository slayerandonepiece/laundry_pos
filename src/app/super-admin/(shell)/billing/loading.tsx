import { StatsSkeleton, TableSkeleton } from '@/features/super-admin/components/Shimmer';

export default function Loading() {
  return (
    <>
      <StatsSkeleton count={5} />
      <div style={{ marginTop: 24 }}>
        <TableSkeleton rows={6} cols={8} />
      </div>
    </>
  );
}
