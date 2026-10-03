'use client';

import { useEffect, useRef, useState } from 'react';

/** Render the actual PDF without depending on a browser's native PDF plugin. */
export default function PdfPreview({ src, title }: { src: string; title: string }) {
  const pages = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => Promise<void>) | undefined;
    const container = pages.current;
    container?.replaceChildren();

    async function render() {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (cancelled || !container) return;
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
        const task = pdfjs.getDocument({ url: src, useWasm: false });
        destroy = () => task.destroy();
        const pdf = await task.promise;
        for (let index = 1; index <= pdf.numPages; index++) {
          if (cancelled) return;
          const page = await pdf.getPage(index);
          // Keep the preview sharp on Retina/high-DPI displays. The CSS page
          // can reach 900px, so render that width at the device pixel ratio.
          const scale = Math.max(2, Math.min(3, window.devicePixelRatio * 1.5));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `${title}, page ${index} of ${pdf.numPages}`);
          await page.render({ canvas, viewport }).promise;
          if (cancelled) return;
          container.append(canvas);
        }
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    }
    void render();
    return () => { cancelled = true; void destroy?.(); container?.replaceChildren(); };
  }, [src, title, attempt]);

  return <div className="pdf-preview">
    {state === 'loading' && <div className="ad-pdf-loading" role="status"><div className="ad-spinner" aria-hidden="true" /><p>Loading PDF…</p></div>}
    {state === 'error' && <div className="pdf-preview-error" role="alert">
      <p>Could not load the PDF preview.</p>
      <button type="button" onClick={() => { setState('loading'); setAttempt(value => value + 1); }}>Try again</button>
      <a href={src} target="_blank" rel="noreferrer">Open PDF</a>
    </div>}
    <div className="pdf-preview-pages" ref={pages} aria-label={title} />
  </div>;
}
