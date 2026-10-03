import { StatsSkeleton, TableSkeleton } from '@/features/super-admin/components/Shimmer';

export default function Loading() {
  return (
    <>
      <StatsSkeleton count={3} />
      <div style={{ marginTop: 24 }}>
        <TableSkeleton rows={5} cols={5} />
      </div>
    </>
  );
}
