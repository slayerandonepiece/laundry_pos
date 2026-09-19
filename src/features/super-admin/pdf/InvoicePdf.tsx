import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { dateLabelFull, paymentMethodLabel } from '@/features/admin/admin.data';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { pdfMoney } from '@/lib/pdfMoney';
import type { StoreDetail, StoreInvoice } from '../types';

// Deliberately shows only fields this app's data model actually has —
// amount, method, dates, notes. No GST/tax line: the billing model has no
// tax fields at all today, and fabricating one would misrepresent a real
// financial document. Add tax support here only after it exists in the
// Subscription/Store schema.
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10.5, fontFamily: 'Helvetica', color: '#1a2233' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  brand: { fontSize: 16, fontWeight: 700 },
  brandSub: { fontSize: 9, color: '#6b7684', marginTop: 2 },
  invoiceTitle: { fontSize: 18, fontWeight: 700, textAlign: 'right' },
  invoiceSub: { fontSize: 9, color: '#6b7684', textAlign: 'right', marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  col: { width: '48%' },
  label: { fontSize: 8.5, color: '#8a93a3', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  value: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  muted: { fontSize: 9.5, color: '#565f6e' },
  table: { borderTopWidth: 1, borderTopColor: '#dde2e9', borderBottomWidth: 1, borderBottomColor: '#dde2e9', marginTop: 8 },
  tableHeadRow: { flexDirection: 'row', paddingVertical: 8, backgroundColor: '#f6f8fb' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#eef1f5' },
  th: { fontSize: 8.5, color: '#8a93a3', textTransform: 'uppercase', letterSpacing: 0.4 },
  colDesc: { width: '45%' },
  colPeriod: { width: '35%' },
  colAmount: { width: '20%', textAlign: 'right' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f0f2f5' },
  kvLabel: { fontSize: 9.5, color: '#565f6e' },
  kvValue: { fontSize: 9.5, fontWeight: 700 },
  total: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1a2233' },
  totalLabel: { fontSize: 11, fontWeight: 700 },
  totalValue: { fontSize: 14, fontWeight: 700 },
  footer: { position: 'absolute', bottom: 32, left: 40, right: 40, fontSize: 8, color: '#9aa4b2', textAlign: 'center' },
});

export function InvoicePdf({ invoice, store }: { invoice: StoreInvoice; store: StoreDetail }) {
  const period = invoice.coversFrom && invoice.coversTo ? `${dateLabelFull(invoice.coversFrom)} - ${dateLabelFull(invoice.coversTo)}` : '-';
  const invoiceTitle = formatInvoiceNumber(invoice.invoiceSeq);
  return (
    <Document title={invoiceTitle}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>StoreOps</Text>
            <Text style={styles.brandSub}>Platform subscription billing</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>{invoiceTitle}</Text>
            <Text style={styles.invoiceSub}>{invoice.type === 'DEPOSIT' ? 'Deposit payment' : 'Annual renewal'} - recorded {dateLabelFull(invoice.paidAt)}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Billed to</Text>
            <Text style={styles.value}>{store.name}</Text>
            <Text style={styles.muted}>{store.address || '-'}</Text>
            <Text style={[styles.muted, { marginTop: 6 }]}>{store.ownerName} (@{store.ownerUsername})</Text>
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

        <Text style={styles.footer}>This invoice reflects a payment already recorded in StoreOps. It is not a tax invoice.</Text>
      </Page>
    </Document>
  );
}
