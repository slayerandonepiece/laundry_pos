// Helvetica, the built-in PDF font used by both invoice templates, does not
// contain the Indian rupee glyph. Keep PDF amounts portable without embedding
// another font; the web UI continues to use the native ₹ symbol.
export function pdfMoney(value: number) {
  const amount = new Intl.NumberFormat('en-IN', { maximumFractionDigits: value % 100 ? 2 : 0 }).format(value / 100);
  return `Rs. ${amount}`;
}
