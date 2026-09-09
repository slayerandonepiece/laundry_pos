import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

// The generic "phead" block every top-level Super Admin list/detail screen
// used to get for free from SuperAdminShell. Now that the chrome lives in
// src/app/super-admin/(shell)/layout.tsx and no longer receives per-page
// title/subtitle/action data, each page renders this itself as the first
// thing in its own content — pages with their own custom header (Store
// Detail, Plan Detail, Invoice Detail) skip this entirely.
export default function PageHeading({ icon, title, subtitle, action }: { icon: IconName; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="phead">
    <div className="phead-l">
      <span className="phead-ic"><Icon name={icon} /></span>
      <div><h1>{title}</h1><p>{subtitle}</p></div>
    </div>
    {action && <div className="phead-r">{action}</div>}
  </div>;
}
