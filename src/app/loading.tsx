export default function Loading() {
  return <main className="ad-route-loading" aria-live="polite" aria-busy="true">
    <span className="ad-spinner" aria-hidden="true" />
    <p>Loading…</p>
  </main>;
}
