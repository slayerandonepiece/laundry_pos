'use client';
import { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
export default function NavbarContainer() {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => { document.body.classList.toggle('menu-open', isOpen); const close = (event: KeyboardEvent) => event.key === 'Escape' && setIsOpen(false); document.addEventListener('keydown', close); return () => { document.body.classList.remove('menu-open'); document.removeEventListener('keydown', close); }; }, [isOpen]);
  return <Navbar isOpen={isOpen} onToggle={() => setIsOpen(value => !value)} onClose={() => setIsOpen(false)} />;
}
