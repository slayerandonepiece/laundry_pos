import { Document, Page, View, Text } from '@react-pdf/renderer';
import { dateLabelFull, paymentMethodLabel } from '@/features/admin/admin.data';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { pdfMoney } from '@/lib/pdfMoney';
import { InvoiceHeader, invoiceStyles } from '@/lib/pdf/InvoiceLayout';
import type { StoreDetail, StoreInvoice } from '../types';

// Deliberately shows only fields this app's data model actually has —
// amount, method, dates, notes. No GST/tax line: the billing model has no
// tax fields at all today, and fabricating one would misrepresent a real
// financial document. Add tax support here only after it exists in the
// Subscription/Store schema.
const styles = { ...invoiceStyles, colDesc: { width: '45%' }, colPeriod: { width: '35%' }, colAmount: { width: '20%', textAlign: 'right' as const } };

export function InvoicePdf({ invoice, store }: { invoice: StoreInvoice; store: StoreDetail }) {
  const period = invoice.coversFrom && invoice.coversTo ? `${dateLabelFull(invoice.coversFrom)} - ${dateLabelFull(invoice.coversTo)}` : '-';
  const invoiceTitle = formatInvoiceNumber(invoice.invoiceSeq);
  return (
    <Document title={invoiceTitle}>
      <Page size="A4" style={styles.page}>
        <InvoiceHeader brand="StoreOps" contact="Platform subscription billing" number={invoiceTitle} subtitle={`${invoice.type === 'DEPOSIT' ? 'Deposit payment' : 'Annual renewal'} - recorded ${dateLabelFull(invoice.paidAt)}`} />

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Billed to</Text>
            <Text style={styles.value}>{store.name}</Text>
            <Text style={styles.muted}>{store.address || '-'}</Text>
            <Text style={[styles.muted, { marginTop: 6 }]}>{store.ownerName} ({store.ownerPhone})</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Payment</Text>
            <View style={styles.kv}><Text style={styles.kvLabel}>Method</Text><Text style={styles.kvValue}>{invoice.method ? paymentMethodLabel(invoice.method) : '-'}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>Paid on</Text><Text style={styles.kvValue}>{dateLabelFull(invoice.paidAt)}</Text></View>
            {invoice.coversFrom && invoice.coversTo && <View style={styles.kv}><Text style={styles.kvLabel}>Covers</Text><Text style={styles.kvValue}>{period}</Text></View>}
          </View>
        </View>

        <Text style={styles.label}>Line items</Text>
        <View style={styles.table}>
          <View style={styles.tableHeadRow}>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colPeriod]}>Period</Text>
            <Text style={[styles.th, styles.colAmount]}>Amount</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[{ fontWeight: 700 }, styles.colDesc]}>{invoice.type === 'DEPOSIT' ? 'Subscription deposit' : 'Annual maintenance'}</Text>
            <Text style={styles.colPeriod}>{period}</Text>
            <Text style={[{ fontWeight: 700 }, styles.colAmount]}>{pdfMoney(invoice.amount)}</Text>
          </View>
        </View>

        <View style={styles.total}>
          <Text style={styles.totalLabel}>Total paid</Text>
          <Text style={styles.totalValue}>{pdfMoney(invoice.amount)}</Text>
        </View>

        {invoice.notes && (
          <View style={{ marginTop: 24 }}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.muted}>{invoice.notes}</Text>
          </View>
        )}

        <Text style={styles.footer} fixed>This invoice reflects a payment already recorded in StoreOps. It is not a tax invoice.</Text>
      </Page>
    </Document>
  );
}
