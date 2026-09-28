import { View, Text, StyleSheet } from '@react-pdf/renderer';

export const invoiceStyles = StyleSheet.create({
  page: { paddingTop: 40, paddingHorizontal: 40, paddingBottom: 64, fontSize: 10.5, fontFamily: 'Helvetica', color: '#1a2233' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  brandColumn: { width: '58%', paddingRight: 16 },
  invoiceColumn: { width: '42%' },
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

/** Fixed columns keep long organization addresses away from invoice identifiers. */
export function InvoiceHeader({ brand, contact, number, subtitle }: { brand: string; contact: string; number: string; subtitle: string }) {
  return <View style={invoiceStyles.header} wrap={false}>
    <View style={invoiceStyles.brandColumn}><Text style={invoiceStyles.brand}>{brand}</Text>{contact && <Text style={invoiceStyles.brandSub}>{contact}</Text>}</View>
    <View style={invoiceStyles.invoiceColumn}><Text style={invoiceStyles.invoiceTitle}>{number}</Text><Text style={invoiceStyles.invoiceSub}>{subtitle}</Text></View>
  </View>;
}
