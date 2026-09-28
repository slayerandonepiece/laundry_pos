import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCashOnDelivery } from '../src/features/admin/payment-methods';

test('COD follows the stable method code even when its display name changes', () => {
  assert.equal(isCashOnDelivery({ code: 'COD', name: 'Pay at handover' }), true);
  assert.equal(isCashOnDelivery({ code: 'CASH_ON_DELIVERY', name: 'Delivery payment' }), true);
  assert.equal(isCashOnDelivery({ name: 'Cash on delivery' }), true);
  assert.equal(isCashOnDelivery({ code: 'CASH', name: 'Cash' }), false);
  assert.equal(isCashOnDelivery({ code: 'UPI', name: 'Cash on delivery' }), false);
  assert.equal(isCashOnDelivery(undefined), false);
});
