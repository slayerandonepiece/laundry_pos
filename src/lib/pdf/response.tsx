import { renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

/** Auth stays in each route; PDF rendering and delivery headers stay here. */
export async function invoicePdfResponse(document: ReactElement<DocumentProps>, documentNumber: string, download: boolean) {
  const buffer = await renderToBuffer(document);
  return new Response(new Uint8Array(buffer), { headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${documentNumber.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf"`,
    'Cache-Control': 'private, no-store',
  } });
}
