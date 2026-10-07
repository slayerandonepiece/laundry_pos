import Link from 'next/link';
import { profileSections, type ProfileSection } from '../profile-sections';

// In-page section switcher for the Profile screens.
export default function ProfileTabs({ active }: { active: ProfileSection }) {
  return <nav className="ad-profile-tabs" aria-label="Profile sections">
    {profileSections.map(s => <Link key={s.id} href={s.href} aria-current={s.id === active ? 'page' : undefined} className={s.id === active ? 'active' : ''}>{s.label}</Link>)}
  </nav>;
}
