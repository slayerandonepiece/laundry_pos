import Logo from '@/components/shared/Logo';
import { whatsappUrl } from '@/config/site';

type NavbarProps = { isOpen: boolean; onToggle: () => void; onClose: () => void };
const links = [['Services', '#services'], ['Prices', '#pricing'], ['About us', '#about'], ['Our store', '#inside'], ['Location', '#location']];

export default function Navbar({ isOpen, onToggle, onClose }: NavbarProps) {
  return <header className="nav"><div className="shell nav-inner"><a href="#top" aria-label="Express Laundry home"><Logo /></a><nav id="main-navigation" className={`links ${isOpen ? 'open' : ''}`} aria-label="Main navigation">{links.map(([label, href]) => <a href={href} onClick={onClose} key={href}>{label}</a>)}<a className="nav-cta" href={whatsappUrl()} target="_blank" rel="noopener">Book a pickup <span className="circle-arrow">↗</span></a></nav><button className="menu" type="button" aria-expanded={isOpen} aria-controls="main-navigation" aria-label={isOpen ? 'Close menu' : 'Open menu'} onClick={onToggle}>{isOpen ? '×' : '☰'}</button></div></header>;
}
