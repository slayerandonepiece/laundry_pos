import Link from 'next/link';

export default function NotFound() {
  return <main className="not-found">
    <h1>Not found</h1>
    <p>That store, user, plan or invoice doesn&apos;t exist — it may have been removed.</p>
    <Link href="/super-admin">Return to dashboard</Link>
  </main>;
}
