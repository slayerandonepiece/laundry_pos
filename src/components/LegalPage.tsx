import type { ReactNode } from 'react';
import Link from 'next/link';
import { LEGAL } from '@/lib/legal-config';
import './LegalPage.css';

export type LegalSection = { id: string; heading: string; body: ReactNode };

export default function LegalPage({ title, sections, intro }: { title: string; sections: LegalSection[]; intro: ReactNode }) {
  return <div className="lg-page">
    <header className="lg-header">
      <Link href="/login" className="lg-brand">KlenPOS</Link>
      <nav aria-label="Legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav>
    </header>
    <main className="lg-main">
      <h1>{title}</h1>
      <p className="lg-updated">Last updated: {LEGAL.lastUpdated}</p>
      <div className="lg-intro">{intro}</div>
      <nav className="lg-toc" aria-label="On this page">
        <strong>On this page</strong>
        <ol>{sections.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.heading}</a></li>)}</ol>
      </nav>
      {sections.map((s, i) => <section key={s.id} id={s.id}><h2>{i + 1}. {s.heading}</h2>{s.body}</section>)}
    </main>
    <footer className="lg-footer">
      <p>Questions? <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a></p>
      <p><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · KlenPOS</p>
    </footer>
  </div>;
}
