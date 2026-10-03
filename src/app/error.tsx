'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="ad-route-loading">
    <h1 className="ad-route-error-title">Something went wrong</h1>
    <p>This screen hit an unexpected error. Your data is safe — try again.</p>
    <button className="ad-button" onClick={() => reset()}>Try again</button>
  </main>;
}
