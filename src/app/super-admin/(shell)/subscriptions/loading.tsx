import { TableSkeleton } from '@/features/super-admin/components/Shimmer';

export default function Loading() {
  return (
    <div style={{ marginTop: 24 }}>
      <TableSkeleton rows={5} cols={6} />
    </div>
  );
}
