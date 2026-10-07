import { Document, Page, View, Text } from '@react-pdf/renderer';
import { dateLabelFull } from '@/features/admin/admin.data';
import { pdfMoney } from '@/lib/pdfMoney';
import { InvoiceHeader, invoiceStyles as styles } from '@/lib/pdf/InvoiceLayout';
import type { OrderSlipData } from '@/server/services/order-slips';

// The order slip shares the invoice's PDF primitives but carries no document
// number and no tax lines: it is a record of the order, not a bill.
export function OrderSlipPdf({ slip }: { slip: OrderSlipData }) {
  const contact = [slip.outlet?.name ?? slip.store.name, (slip.outlet?.phone || slip.store.phone)?.trim()].filter(Boolean).join(' · ');
  return (
    <Document title={`Order ${slip.orderCode}`}>
      <Page size="A4" style={styles.page}>
        <InvoiceHeader brand={slip.store.name} contact={[slip.store.address?.trim(), contact].filter(Boolean).join(' · ')} number={`Order ${slip.orderCode}`} subtitle={`Order slip - ${dateLabelFull(slip.orderDate)}`} />

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Customer</Text>
            <Text style={styles.value}>{slip.customerName || 'Walk-in customer'}</Text>
            <Text style={styles.muted}>{slip.phone}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Order</Text>
            <View style={styles.kv}><Text style={styles.kvLabel}>Order number</Text><Text style={styles.kvValue}>{slip.orderCode}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>Status</Text><Text style={styles.kvValue}>{slip.status}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>Order date</Text><Text style={styles.kvValue}>{dateLabelFull(slip.orderDate)}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>Delivery date</Text><Text style={styles.kvValue}>{dateLabelFull(slip.dueDate)}</Text></View>
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
          {slip.lines.map((line, index) => (
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
          <Text style={styles.totalValue}>{pdfMoney(slip.total)}</Text>
        </View>

        <View style={{ marginTop: 20 }}>
          <Text style={styles.label}>Payment</Text>
          <View style={styles.kv}><Text style={styles.kvLabel}>Amount paid</Text><Text style={styles.kvValue}>{pdfMoney(slip.paid)}</Text></View>
          <View style={styles.kv}><Text style={styles.kvLabel}>Amount due</Text><Text style={styles.kvValue}>{pdfMoney(slip.balance)}</Text></View>
        </View>

        {slip.notes ? <View style={{ marginTop: 20 }}><Text style={styles.label}>Care instructions</Text><Text style={styles.muted}>{slip.notes}</Text></View> : null}

        <Text style={styles.footer} fixed>Order slip - this is not an invoice or a tax document.</Text>
      </Page>
    </Document>
  );
}
