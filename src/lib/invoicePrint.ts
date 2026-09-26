'use client';

/**
 * Print a PDF directly without printing the host page's HTML chrome.
 * Appends a hidden iframe pointing to the PDF URL, waits for it to load,
 * and calls .print() on the PDF's window context.
 * Falls back to opening a dedicated popup window if iframe printing is blocked.
 */
export function printInvoicePdf(pdfUrl: string): void {
  if (typeof window === 'undefined') return;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  iframe.src = pdfUrl;

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // If sandboxed or blocked by browser PDF plugin, open directly
      const win = window.open(pdfUrl, '_blank');
      win?.addEventListener('load', () => win?.print());
    }
  };

  iframe.onload = triggerPrint;
  document.body.appendChild(iframe);

  // Fallback timer in case onload does not fire for PDF embed
  setTimeout(triggerPrint, 1500);

  // Cleanup after print dialog lifecycle
  setTimeout(() => {
    try {
      if (iframe.parentNode) document.body.removeChild(iframe);
    } catch {}
  }, 60000);
}
