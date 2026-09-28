'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import './WorkspaceNotice.css';

/** One quiet top-strip treatment for subscription status and announcements. */
export default function WorkspaceNotice({ children, label, tone = 'info', action, dismissible = false, dismissKey }: {
  children: ReactNode;
  label: string;
  tone?: 'info' | 'warning';
  action?: { href: string; label: string };
  dismissible?: boolean;
  dismissKey?: string;
}) {
  const [dismissed, setDismissed] = useState(() => {
    try { return Boolean(dismissKey && typeof window !== 'undefined' && sessionStorage.getItem(`workspace-notice:${dismissKey}`)); } catch { return false; }
  });
  if (dismissed) return null;
  return <aside className={`workspace-notice workspace-notice-${tone}`} aria-label={label}>
    <span className="workspace-notice-message">{children}</span>
    {(action || dismissible) && <span className="workspace-notice-actions">
      {action && <Link href={action.href}>{action.label}</Link>}
      {dismissible && <button type="button" aria-label={`Dismiss ${label}`} onClick={() => { setDismissed(true); try { if (dismissKey) sessionStorage.setItem(`workspace-notice:${dismissKey}`, '1'); } catch {} }}>×</button>}
    </span>}
  </aside>;
}
