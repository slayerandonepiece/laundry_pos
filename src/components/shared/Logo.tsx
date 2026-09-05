import { siteConfig } from '@/config/site';

export default function Logo() {
  return <span className="brand"><span className="mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M14 9h20a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V13a4 4 0 0 1 4-4Z"/><circle cx="24" cy="26" r="9"/><path d="M16 15h2m4 0h2m4 0h4"/></svg></span><span><strong>{siteConfig.name}</strong><small>{siteConfig.area}</small></span></span>;
}
