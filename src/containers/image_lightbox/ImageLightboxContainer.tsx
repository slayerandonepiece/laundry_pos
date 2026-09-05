'use client';
import { useEffect, useState } from 'react';
import { ImageLightbox } from '@/components/image_lightbox';
export default function ImageLightboxContainer() { const [open, setOpen] = useState(false); useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false); document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [open]); return <ImageLightbox open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} />; }
