import { ShimmerBlock, TabContentSkeleton } from '@/features/super-admin/components/Shimmer';

export default function Loading() {
  return (
    <div style={{ animation: 'toastsb .15s ease-out' }}>
      <ShimmerBlock width={140} height={14} style={{ marginBottom: 16 }} />
      <div className="phead" style={{ marginBottom: 20 }}>
        <div className="phead-l" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <ShimmerBlock width={46} height={46} borderRadius={10} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ShimmerBlock width={220} height={22} />
            <ShimmerBlock width={160} height={14} />
          </div>
        </div>
        <div className="phead-r" style={{ display: 'flex', gap: 10 }}>
          <ShimmerBlock width={110} height={36} borderRadius={8} />
          <ShimmerBlock width={130} height={36} borderRadius={8} />
        </div>
      </div>
      <div className="tabs" style={{ marginBottom: 20, display: 'flex', gap: 8 }}>
        <ShimmerBlock width={80} height={32} borderRadius={20} />
        <ShimmerBlock width={70} height={32} borderRadius={20} />
        <ShimmerBlock width={70} height={32} borderRadius={20} />
        <ShimmerBlock width={90} height={32} borderRadius={20} />
        <ShimmerBlock width={70} height={32} borderRadius={20} />
      </div>
      <TabContentSkeleton />
    </div>
  );
}
