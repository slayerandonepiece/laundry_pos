'use client';
import { useState, type ReactNode } from 'react';
import { shareInvoice } from '@/lib/invoiceShare';
import { printInvoicePdf } from '@/lib/invoicePrint';

export type PdfActionsProps = {
  /** Staff-only PDF URL (authenticated route) */
  viewUrl: string;
  /** Staff-only download URL (authenticated route, ?download=1) */
  downloadUrl: string;
  /** Display title for share sheet, e.g. "INV-000042" */
  title: string;
  /**
   * Called on first Share/WhatsApp/Print to resolve the public customer URL.
   * Return a string (public URL) or void if no public link exists.
   */
  getPublicUrl?: () => Promise<string | void>;
  /** Viewer panel to show when "View PDF" is clicked */
  viewer?: ReactNode | ((onClose: () => void) => ReactNode);
  /** Button wrapper — pass Button from admin Primitives or a plain <button> */
  ButtonComponent?: React.ComponentType<{
    secondary?: boolean;
    type?: 'button';
    disabled?: boolean;
    onClick?: () => void;
    children: ReactNode;
    style?: React.CSSProperties;
    title?: string;
  }>;
  className?: string;
  downloadClassName?: string;
  toastClassName?: string;
  whatsappSecondary?: boolean;
  icons?: {
    print?: ReactNode;
    view?: ReactNode;
    whatsapp?: ReactNode;
    share?: ReactNode;
    download?: ReactNode;
  };
  labels?: {
    print?: string;
    view?: string;
    whatsapp?: string;
    share?: string;
    download?: string;
  };
};

function DefaultButton({ children, secondary, ...p }: {
  secondary?: boolean;
  type?: 'button';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  style?: React.CSSProperties;
  title?: string;
}) {
  return <button className={'ad-button ' + (secondary ? 'ad-secondary' : '')} {...p}>{children}</button>;
}

export default function PdfActions({
  viewUrl,
  downloadUrl,
  title,
  getPublicUrl,
  viewer,
  ButtonComponent,
  className,
  downloadClassName,
  toastClassName,
  whatsappSecondary = true,
  icons,
  labels,
}: PdfActionsProps) {
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  const Btn = ButtonComponent ?? DefaultButton;

  async function print() {
    try {
      if (getPublicUrl) await getPublicUrl(); // ensure invoice exists
    } catch { return flash('Could not open the invoice. Try again.'); }
    printInvoicePdf(viewUrl);
  }

  async function view() {
    try {
      if (getPublicUrl) await getPublicUrl();
      setViewing(true);
    } catch { flash('Could not open the invoice. Try again.'); }
  }

  async function deliver(whatsApp = false) {
    if (busy) return;
    setBusy(true);
    try {
      const publicUrl = getPublicUrl ? (await getPublicUrl() ?? `${window.location.origin}${downloadUrl}`) : `${window.location.origin}${downloadUrl}`;
      const result = await shareInvoice({ downloadUrl: publicUrl, publicUrl, title, whatsApp });
      if (result === 'copied') flash('Invoice link copied to clipboard');
    } catch { flash('Could not share the invoice. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <div className={className ?? "ad-order-invoice-actions"}>
      <Btn secondary type="button" onClick={() => void print()}>
        {icons?.print}{icons?.print ? ' ' : ''}{labels?.print ?? 'Print'}
      </Btn>
      <Btn secondary type="button" onClick={() => void view()}>
        {icons?.view}{icons?.view ? ' ' : ''}{labels?.view ?? 'View PDF'}
      </Btn>
      <Btn
        secondary={whatsappSecondary}
        type="button"
        disabled={busy}
        onClick={() => void deliver(true)}
        title="Share invoice link directly to customer via WhatsApp"
      >
        {icons?.whatsapp}{icons?.whatsapp ? ' ' : ''}{labels?.whatsapp ?? 'Share via WhatsApp'}
      </Btn>
      <Btn
        secondary
        type="button"
        disabled={busy}
        onClick={() => void deliver()}
        title="Share or copy invoice link"
      >
        {icons?.share}{icons?.share ? ' ' : ''}{labels?.share ?? 'Share'}
      </Btn>
      <a className={downloadClassName ?? "ad-button"} href={downloadUrl} download>
        {icons?.download}{icons?.download ? ' ' : ''}{labels?.download ?? 'Download PDF'}
      </a>
      {viewing && (typeof viewer === 'function' ? viewer(() => setViewing(false)) : viewer)}
      {toast && <div className={toastClassName ?? "ad-toast"} role="status">{toast}</div>}
    </div>
  );
}
