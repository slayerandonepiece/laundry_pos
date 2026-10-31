const paths: Record<string, string> = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  store: '<path d="M3 9.5 4.6 4.6A1.5 1.5 0 0 1 6 3.6h12a1.5 1.5 0 0 1 1.4 1L21 9.5"/><path d="M4 9.5v10.9h16V9.5"/><path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.9"/><path d="M18 14.4a6.2 6.2 0 0 1 3.2 5.6"/>',
  subscriptions: '<rect x="2.6" y="5" width="18.8" height="14" rx="2.4"/><path d="M2.6 9.8h18.8"/><path d="M6.4 15h3.2"/>',
  logo: '<path d="M4.6 20.4V5a1.4 1.4 0 0 1 1.4-1.4h7a1.4 1.4 0 0 1 1.4 1.4v15.4"/><path d="M14.4 9.6h3.6a1.4 1.4 0 0 1 1.4 1.4v9.4"/><path d="M3 20.4h18"/><path d="M7.6 7.6h3.4"/><path d="M7.6 11.6h3.4"/><path d="M7.6 15.6h3.4"/>',
  search: '<circle cx="11" cy="11" r="6.4"/><path d="m20 20-3.6-3.6"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  bell: '<path d="M6.4 9.6a5.6 5.6 0 0 1 11.2 0c0 5.2 2 6.6 2 6.6H4.4s2-1.4 2-6.6"/><path d="M10.2 19.6a2 2 0 0 0 3.6 0"/>',
  export: '<path d="M12 4v10.6"/><path d="m7.6 10.6 4.4 4.4 4.4-4.4"/><path d="M4.6 19.4h14.8"/>',
  plus: '<path d="M12 5.4v13.2"/><path d="M5.4 12h13.2"/>',
  lock: '<rect x="4.6" y="10.4" width="14.8" height="10" rx="2.2"/><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8"/>',
  edit: '<path d="M16.4 4.6a2.1 2.1 0 0 1 3 3L9 18l-4 1 1-4z"/>',
  arrowLeft: '<path d="M19 12H5.4"/><path d="m11 5.4-5.6 6.6 5.6 6.6"/>',
  trash: '<path d="M5.4 7.4h13.2"/><path d="M9.4 7.4V5.2a1.4 1.4 0 0 1 1.4-1.4h2.4a1.4 1.4 0 0 1 1.4 1.4v2.2"/><path d="M7.4 7.4 8.2 19a1.6 1.6 0 0 0 1.6 1.5h4.4a1.6 1.6 0 0 0 1.6-1.5l.8-11.6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  logout: '<path d="M14 4.6h3.6a1.8 1.8 0 0 1 1.8 1.8v11.2a1.8 1.8 0 0 1-1.8 1.8H14"/><path d="M10 8.4 6.4 12l3.6 3.6"/><path d="M6.6 12h8.6"/>',
  hamburger: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  mail: '<rect x="3.4" y="5.4" width="17.2" height="13.2" rx="2"/><path d="m4.4 7 7.6 6 7.6-6"/>',
  phone: '<path d="M8.4 4.4 6 4a1.6 1.6 0 0 0-1.6 1.6c0 8.3 6.7 15 15 15a1.6 1.6 0 0 0 1.6-1.6l-.4-2.4a1.6 1.6 0 0 0-1.2-1.3l-3-.7a1.6 1.6 0 0 0-1.6.5l-1 1.2a11.8 11.8 0 0 1-5.4-5.4l1.2-1a1.6 1.6 0 0 0 .5-1.6l-.7-3a1.6 1.6 0 0 0-1.2-1.3Z"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 2"/>',
  externalLink: '<path d="M9.4 14.6 19.2 4.8"/><path d="M13.4 4.4h5.8v5.8"/><path d="M18 13v5.4A1.6 1.6 0 0 1 16.4 20H5.6A1.6 1.6 0 0 1 4 18.4V7.6A1.6 1.6 0 0 1 5.6 6H11"/>',
  card: '<rect x="2.6" y="5" width="18.8" height="14" rx="2.4"/><path d="M2.6 9.8h18.8"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4.6V9h4.4"/><path d="M12 8v4.6l3 2"/>',
  filter: '<path d="M4 6h16"/><path d="M7.6 12h8.8"/><path d="M10.6 18h2.8"/>',
  check: '<path d="M5 12.6 9.4 17 19 6.4"/>',
  archive: '<rect x="3.4" y="5" width="17.2" height="4.6" rx="1.2"/><path d="M5 9.6v9a1.6 1.6 0 0 0 1.6 1.6h10.8a1.6 1.6 0 0 0 1.6-1.6v-9"/><path d="M10 13.6h4"/>',
  key: '<circle cx="8" cy="16" r="3.6"/><path d="m10.4 13.6 8.2-8.2"/><path d="m15.4 8.6 2.4 2.4"/><path d="m17.8 6.2 2.4 2.4"/>',
  userPlus: '<circle cx="9.4" cy="8.4" r="3.4"/><path d="M3.6 20a5.8 5.8 0 0 1 11.6 0"/><path d="M18.4 8.4v6"/><path d="M15.4 11.4h6"/>',
  building: '<path d="M3 9.5 4.6 4.6A1.5 1.5 0 0 1 6 3.6h12a1.5 1.5 0 0 1 1.4 1L21 9.5"/><path d="M4 9.5v10.9h16V9.5"/>',
  alertTriangle: '<path d="M12 4.2 2.2 20.8h19.6Z"/><path d="M12 10v4.6"/><path d="M12 18v.1"/>',
  moreVertical: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  eye: '<path d="M2.4 12S5.8 5.4 12 5.4 21.6 12 21.6 12 18.2 18.6 12 18.6 2.4 12 2.4 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  download: '<path d="M12 4v10.6"/><path d="m7.6 10.6 4.4 4.4 4.4-4.4"/><path d="M4.6 19.4h14.8"/>',
  printer: '<rect x="4.6" y="9" width="14.8" height="7.6" rx="1.4"/><path d="M7 9V4.6h10V9"/><path d="M7 15.6v3.8h10v-3.8"/>',
  share: '<circle cx="18" cy="5.4" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.6" r="2.6"/><path d="m8.3 10.6 7.4-4.4"/><path d="m8.3 13.4 7.4 4.4"/>',
  whatsapp: '<path d="M12 3.6a8.3 8.3 0 0 0-7.1 12.6L3.6 20.4l4.3-1.2A8.3 8.3 0 1 0 12 3.6Z"/><path d="M8.6 8.4c.2-.5.5-.5.8-.5h.5c.2 0 .4 0 .6.4l.7 1.7c.1.2.1.4 0 .6l-.4.6c-.1.2-.1.3 0 .5.4.7 1.5 1.8 2.2 2.2.2.1.3.1.5 0l.6-.4c.2-.1.4-.1.6 0l1.7.7c.3.2.4.4.4.6v.5c0 .3 0 .6-.5.8-.5.3-1.2.5-2 .3-1.4-.3-3-1.2-4.3-2.5-1.3-1.3-2.2-2.9-2.5-4.3-.2-.8 0-1.5.3-2Z"/>',
};

export type IconName = keyof typeof paths;

export default function Icon({ name, size = 's' }: { name: IconName; size?: 's' | 'm' | 'l' }) {
  return <span className={'ic' + (size === 's' ? ' s' : size === 'l' ? ' l' : '')} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: paths[name] }} />
  </span>;
}
