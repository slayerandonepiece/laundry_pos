import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { dateLabelFull, paymentMethodLabel } from '@/features/admin/admin.data';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { pdfMoney } from '@/lib/pdfMoney';
import type { OrderInvoiceData } from '@/server/services/order-invoices';

// Mirrors src/features/super-admin/pdf/InvoicePdf.tsx's styling/layout, but
// this is the OTHER invoice system (store -> customer, for a laundry order)
// — see .agents/2026-09-brainstorm-plan.md Item 7. Deliberately shows only
// fields this app's order data actually has. No GST/tax line: the business
// is cash-only and not GST-registered (explicitly out of scope) — don't add
// tax fields here on a guess.
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
  colDesc: { width: '46%' },
  colQty: { width: '18%', textAlign: 'right' },
  colRate: { width: '18%', textAlign: 'right' },
  colAmount: { width: '18%', textAlign: 'right' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f0f2f5' },
  kvLabel: { fontSize: 9.5, color: '#565f6e' },
  kvValue: { fontSize: 9.5, fontWeight: 700 },
  total: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1a2233' },
  totalLabel: { fontSize: 11, fontWeight: 700 },
  totalValue: { fontSize: 14, fontWeight: 700 },
  footer: { position: 'absolute', bottom: 32, left: 40, right: 40, fontSize: 8, color: '#9aa4b2', textAlign: 'center' },
});

function rate(amount: number, quantity: number): number {
  return quantity > 0 ? Math.round(amount / quantity) : amount;
}

export function OrderInvoicePdf({ invoice }: { invoice: OrderInvoiceData }) {
  const invoiceNumber = formatInvoiceNumber(invoice.invoiceSeq);
  const paymentMethods = [...new Set(invoice.payments.map(p => p.method))];
  const methodLabel = paymentMethods.length === 0 ? '-' : paymentMethods.length === 1 ? paymentMethodLabel(paymentMethods[0]) : 'Multiple';

  return (
    <Document title={invoiceNumber}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{invoice.store.name}</Text>
            <Text style={styles.brandSub}>{invoice.store.address || '-'}{invoice.store.phone ? ` · ${invoice.store.phone}` : ''}</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>{invoiceNumber}</Text>
            <Text style={styles.invoiceSub}>Order {invoice.orderCode} - {dateLabelFull(invoice.orderDate)}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Billed to</Text>
            <Text style={styles.value}>{invoice.customerName || 'Walk-in customer'}</Text>
            <Text style={styles.muted}>{invoice.phone}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Order</Text>
            <View style={styles.kv}><Text style={styles.kvLabel}>Order number</Text><Text style={styles.kvValue}>{invoice.orderCode}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>Order date</Text><Text style={styles.kvValue}>{dateLabelFull(invoice.orderDate)}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>Delivery date</Text><Text style={styles.kvValue}>{dateLabelFull(invoice.dueDate)}</Text></View>
          </View>
        </View>

        <Text style={styles.label}>Items</Text>
        <View style={styles.table}>
          <View style={styles.tableHeadRow}>
            <Text style={[styles.th, styles.colDesc]}>Service</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colRate]}>Rate</Text>
            <Text style={[styles.th, styles.colAmount]}>Amount</Text>
          </View>
          {invoice.lines.map((line, index) => (
            <View style={styles.tableRow} key={index}>
              <Text style={[{ fontWeight: 700 }, styles.colDesc]}>{line.name}</Text>
              <Text style={styles.colQty}>{line.quantity} {line.unit}</Text>
              <Text style={styles.colRate}>{pdfMoney(rate(line.amount, line.quantity))}</Text>
              <Text style={[{ fontWeight: 700 }, styles.colAmount]}>{pdfMoney(line.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.total}>
          <Text style={styles.totalLabel}>Order total</Text>
          <Text style={styles.totalValue}>{pdfMoney(invoice.total)}</Text>
        </View>

        <View style={{ marginTop: 20 }}>
          <Text style={styles.label}>Payment</Text>
          <View style={styles.kv}><Text style={styles.kvLabel}>Method</Text><Text style={styles.kvValue}>{methodLabel}</Text></View>
          <View style={styles.kv}><Text style={styles.kvLabel}>Amount paid</Text><Text style={styles.kvValue}>{pdfMoney(invoice.paid)}</Text></View>
          <View style={styles.kv}><Text style={styles.kvLabel}>Balance due</Text><Text style={styles.kvValue}>{pdfMoney(invoice.balance)}</Text></View>
        </View>

        {invoice.payments.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.label}>Payments received</Text>
            <View style={styles.table}>
              <View style={styles.tableHeadRow}>
                <Text style={[styles.th, { width: '40%' }]}>Date</Text>
                <Text style={[styles.th, { width: '30%' }]}>Method</Text>
                <Text style={[styles.th, { width: '30%', textAlign: 'right' }]}>Amount</Text>
              </View>
              {invoice.payments.map((payment, index) => (
                <View style={styles.tableRow} key={index}>
                  <Text style={{ width: '40%' }}>{dateLabelFull(payment.date)}</Text>
                  <Text style={{ width: '30%' }}>{paymentMethodLabel(payment.method)}</Text>
                  <Text style={{ width: '30%', textAlign: 'right', fontWeight: 700 }}>{pdfMoney(payment.amount)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.footer}>Generated {dateLabelFull(invoice.generatedAt.slice(0, 10))} - this is not a tax invoice.</Text>
      </Page>
    </Document>
  );
}
