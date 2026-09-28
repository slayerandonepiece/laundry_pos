/** Open WhatsApp Web directly from a click, without native share sheets. */
export function openWhatsAppInvoice(publicUrl: string, title: string): void {
  window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(title + '\n' + publicUrl)}`, '_blank', 'noopener,noreferrer');
}

/** Shared browser delivery for both customer and subscription invoices. */
export async function sharePdfFile(url: string, title: string): Promise<boolean> {
  if (!navigator.share || !navigator.canShare) return false;
  const response = await fetch(url);
  if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) throw new Error('Could not load invoice PDF.');
  const file = new File([await response.blob()], `${title}.pdf`, { type: 'application/pdf' });
  if (!navigator.canShare({ files: [file] })) return false;
  await navigator.share({ files: [file], title });
  return true;
}

export async function shareInvoice({ downloadUrl, publicUrl, title, whatsApp = false }: {
  downloadUrl: string; publicUrl: string; title: string; whatsApp?: boolean;
}): Promise<'shared' | 'copied' | 'cancelled'> {
  try { if (await sharePdfFile(downloadUrl, title)) return 'shared'; }
  catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'; }
  if (whatsApp) {
    window.open(`https://wa.me/?text=${encodeURIComponent(title + '\n' + publicUrl)}`, '_blank', 'noopener,noreferrer');
    return 'shared';
  }
  if (navigator.share) {
    try { await navigator.share({ title, url: publicUrl }); return 'shared'; }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'; }
  }
  await navigator.clipboard.writeText(publicUrl);
  return 'copied';
}
