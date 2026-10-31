import { TableSkeleton } from '@/features/super-admin/components/Shimmer';

export default function Loading() {
  return <TableSkeleton rows={3} cols={4} />;
}
