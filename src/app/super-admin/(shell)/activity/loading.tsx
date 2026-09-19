import { TimelineSkeleton } from '@/features/super-admin/components/Shimmer';

export default function Loading() {
  return (
    <div style={{ marginTop: 24 }}>
      <TimelineSkeleton count={6} />
    </div>
  );
}
