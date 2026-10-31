import { Document, Page, View, Text } from '@react-pdf/renderer';
import { dateLabelFull, paymentMethodLabel } from '@/features/admin/admin.data';
import { pdfMoney } from '@/lib/pdfMoney';
import { InvoiceHeader, invoiceStyles as styles } from '@/lib/pdf/InvoiceLayout';
import type { OrderInvoiceData } from '@/server/services/order-invoices';

// Customer-order and subscription invoices share the PDF primitives.
// Business fields remain specific to their invoice type; no invented tax lines.
export function OrderInvoicePdf({ invoice }: { invoice: OrderInvoiceData }) {
  const invoiceNumber = invoice.invoiceNumber;
  const paymentMethods = [...new Set(invoice.payments.map(p => p.method))];
  const methodLabel = paymentMethods.length === 0 ? '-' : paymentMethods.length === 1 ? paymentMethodLabel(paymentMethods[0]) : 'Multiple';

  const storeContactParts = [invoice.store.address?.trim(), invoice.store.phone?.trim()].filter(Boolean);

  return (
    <Document title={invoiceNumber}>
      <Page size="A4" style={styles.page}>
        <InvoiceHeader brand={invoice.store.name} contact={storeContactParts.join(' · ')} number={invoiceNumber} subtitle={`Order ${invoice.orderCode} - ${dateLabelFull(invoice.orderDate)}`} />

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
            <View style={styles.tableRow} key={index} wrap={false}>
              <Text style={[{ fontWeight: 700 }, styles.colDesc]}>{line.name}</Text>
              <Text style={styles.colQty}>{line.quantity} {line.unit}</Text>
              <Text style={styles.colRate}>{line.unit === 'pcs' && line.quantity > 0 ? pdfMoney(Math.round(line.amount / line.quantity)) : 'Slab pricing'}</Text>
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
                <View style={styles.tableRow} key={index} wrap={false}>
                  <Text style={{ width: '40%' }}>{dateLabelFull(payment.date)}</Text>
                  <Text style={{ width: '30%' }}>{paymentMethodLabel(payment.method)}</Text>
                  <Text style={{ width: '30%', textAlign: 'right', fontWeight: 700 }}>{pdfMoney(payment.amount)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.footer} fixed>Generated {dateLabelFull(invoice.generatedAt.slice(0, 10))} - this is not a tax invoice.</Text>
      </Page>
    </Document>
  );
}
