import '@fontsource-variable/manrope';
import '@fontsource-variable/dm-sans';
import './super-admin.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  // ad-root carries the legacy .ad-* design system's CSS variables — kept
  // here so screens not yet migrated to the new .soa design system (see
  // super-admin.css) still render correctly during the screen-by-screen
  // reskin. Remove once every Super Admin screen has been migrated.
  return <div className="soa ad-root">{children}</div>;
}
