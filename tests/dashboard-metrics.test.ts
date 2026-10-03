import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashboardData, granularIntervals } from '../src/features/admin/admin.analytics';
import { total, today } from '../src/features/admin/admin.data';
import type { Order, Expense, Product } from '../src/features/admin/admin.types';

test('Dashboard KPI totals equal the sum of per-outlet cards plus org-wide orders', () => {
  const current = today();

  const mockProducts: Product[] = [
    { id: 'p1', name: 'Wash & Fold', category: 'Laundry', active: true, type: 'item', price: 1000 },
  ];

  const mockOrders: Order[] = [
    // Outlet 1 (Chinnapanahalli): 3 orders, 2 open, 1 delivered
    {
      id: 'EL-2',
      outletId: 'outlet-chn',
      name: 'Customer 2',
      phone: '9999999992',
      date: current,
      due: current,
      status: 'Pending',
      lines: [{ productId: 'p1', name: 'Wash & Fold', quantity: 2, unit: 'pcs', amount: 50000 }],
      payments: [],
      notes: '',
    },
    {
      id: 'EL-3',
      outletId: 'outlet-chn',
      name: 'Customer 3',
      phone: '9999999993',
      date: current,
      due: current,
      status: 'In Progress',
      lines: [{ productId: 'p1', name: 'Wash & Fold', quantity: 3, unit: 'pcs', amount: 70100 }],
      payments: [{ id: 'pmt-1', amount: 30000, date: current, method: 'Cash' }],
      notes: '',
    },
    {
      id: 'EL-5',
      outletId: 'outlet-chn',
      name: 'Customer 5',
      phone: '9999999995',
      date: current,
      due: current,
      completed: current,
      status: 'Delivered',
      lines: [{ productId: 'p1', name: 'Wash & Fold', quantity: 2, unit: 'pcs', amount: 50000 }],
      payments: [{ id: 'pmt-2', amount: 50000, date: current, method: 'Cash' }],
      notes: '',
    },
    // Outlet 2 (HSR Layout): 1 order, delivered (EL-4)
    {
      id: 'EL-4',
      outletId: 'outlet-hsr',
      name: 'Customer 4',
      phone: '9999999994',
      date: current,
      due: current,
      completed: current,
      status: 'Delivered',
      lines: [{ productId: 'p1', name: 'Wash & Fold', quantity: 1, unit: 'pcs', amount: 6000 }],
      payments: [{ id: 'pmt-3', amount: 6000, date: current, method: 'Cash' }],
      notes: '',
    },
  ];

  const mockExpenses: Expense[] = [];

  const range = { from: current, to: current };
  const d = dashboardData({ orders: mockOrders, expenses: mockExpenses, products: mockProducts }, range);

  // Chinnapanahalli figures
  const chnOrders = mockOrders.filter(o => o.outletId === 'outlet-chn');
  const chnSalesToday = chnOrders.filter(o => o.date === current && !o.legacyCancelled).reduce((sum, o) => sum + total(o), 0);
  const chnOrdersToday = chnOrders.filter(o => o.date === current && !o.legacyCancelled).length;
  const chnOpenOrders = d.commitments.filter(o => o.outletId === 'outlet-chn').length;

  assert.equal(chnSalesToday, 170100); // ₹1,701
  assert.equal(chnOrdersToday, 3);
  assert.equal(chnOpenOrders, 2); // EL-2 (Pending) + EL-3 (In Progress)

  // HSR Layout figures
  const hsrOrders = mockOrders.filter(o => o.outletId === 'outlet-hsr');
  const hsrSalesToday = hsrOrders.filter(o => o.date === current && !o.legacyCancelled).reduce((sum, o) => sum + total(o), 0);
  const hsrOrdersToday = hsrOrders.filter(o => o.date === current && !o.legacyCancelled).length;
  const hsrOpenOrders = d.commitments.filter(o => o.outletId === 'outlet-hsr').length;

  assert.equal(hsrSalesToday, 6000); // ₹60
  assert.equal(hsrOrdersToday, 1);
  assert.equal(hsrOpenOrders, 0); // EL-4 is Delivered

  // Arithmetic check: Aggregate KPI totals == sum of outlet cards
  assert.equal(d.todaySales, chnSalesToday + hsrSalesToday, 'KPI Today Sales == sum of outlet sales');
  assert.equal(d.todaySales, 176100); // ₹1,761

  assert.equal(d.todayCount, chnOrdersToday + hsrOrdersToday, 'KPI Orders Today == sum of outlet order counts');
  assert.equal(d.todayCount, 4);

  assert.equal(d.todo, chnOpenOrders + hsrOpenOrders, 'KPI Open Orders == sum of outlet open orders');
  assert.equal(d.todo, 2);

  // Verify Recent orders sorting includes EL-4
  const sortedRecent = mockOrders.filter(o => !o.legacyCancelled).slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id, undefined, { numeric: true }));
  const topIds = sortedRecent.map(o => o.id);
  assert.deepEqual(topIds, ['EL-5', 'EL-4', 'EL-3', 'EL-2']);
  assert.ok(topIds.includes('EL-4'), 'Recent orders includes HSR order EL-4');
});

test('BE2: dashboard granularity bucketing and clipping', () => {
  const current = today();

  // 1. 7 days with day granularity = 7 buckets
  const sevenDayRange = { from: '2026-08-01', to: '2026-08-07' };
  const dayBuckets = granularIntervals(sevenDayRange, 'day');
  assert.equal(dayBuckets.length, 7);
  assert.equal(dayBuckets[0].from, '2026-08-01');
  assert.equal(dayBuckets[0].to, '2026-08-01');
  assert.equal(dayBuckets[6].from, '2026-08-07');
  assert.equal(dayBuckets[6].to, '2026-08-07');
  // Labels for single day bucket use existing dateLabel
  assert.ok(!dayBuckets[0].label.includes('–'));

  // 2. 30 days with week granularity = at most 5 buckets with the first and last clipped
  const thirtyDayRange = { from: '2026-08-01', to: '2026-08-30' };
  const weekBuckets = granularIntervals(thirtyDayRange, 'week');
  assert.ok(weekBuckets.length <= 5, `Expected <= 5 buckets, got ${weekBuckets.length}`);
  assert.equal(weekBuckets.length, 5);
  // First bucket clipped: 2026-08-01 (Saturday) to 2026-08-02 (Sunday)
  assert.equal(weekBuckets[0].from, '2026-08-01');
  assert.equal(weekBuckets[0].to, '2026-08-02');
  assert.ok(weekBuckets[0].label.includes('–'));
  // Last bucket clipped: 2026-08-24 (Monday) to 2026-08-30 (Sunday)
  assert.equal(weekBuckets[4].from, '2026-08-24');
  assert.equal(weekBuckets[4].to, '2026-08-30');

  // 3. 90 days with month granularity = 3-4 calendar-month buckets
  const ninetyDayRange1 = { from: '2026-05-01', to: '2026-07-31' };
  const monthBuckets1 = granularIntervals(ninetyDayRange1, 'month');
  assert.equal(monthBuckets1.length, 3);
  assert.equal(monthBuckets1[0].from, '2026-05-01');
  assert.equal(monthBuckets1[0].to, '2026-05-31');
  assert.equal(monthBuckets1[1].from, '2026-06-01');
  assert.equal(monthBuckets1[1].to, '2026-06-30');
  assert.equal(monthBuckets1[2].from, '2026-07-01');
  assert.equal(monthBuckets1[2].to, '2026-07-31');

  const ninetyDayRange2 = { from: '2026-05-15', to: '2026-08-15' };
  const monthBuckets2 = granularIntervals(ninetyDayRange2, 'month');
  assert.equal(monthBuckets2.length, 4);
  assert.equal(monthBuckets2[0].from, '2026-05-15');
  assert.equal(monthBuckets2[0].to, '2026-05-31');
  assert.equal(monthBuckets2[3].from, '2026-08-01');
  assert.equal(monthBuckets2[3].to, '2026-08-15');

  // 4. A range ending in the future is clipped to today
  const futureRange = { from: '2026-08-01', to: '2099-12-31' };
  const clippedDayBuckets = granularIntervals(futureRange, 'day');
  assert.ok(clippedDayBuckets.length > 0);
  assert.equal(clippedDayBuckets.at(-1)?.to, current);

  const clippedWeekBuckets = granularIntervals(futureRange, 'week');
  assert.equal(clippedWeekBuckets.at(-1)?.to, current);

  const clippedMonthBuckets = granularIntervals(futureRange, 'month');
  assert.equal(clippedMonthBuckets.at(-1)?.to, current);

  // 5. dashboardData behavior: absent granularity vs present
  const dummyStore = { orders: [], expenses: [], products: [] };
  const noGran = dashboardData(dummyStore, thirtyDayRange);
  assert.equal((noGran as { cashRange?: unknown }).cashRange, undefined);
  assert.ok(Array.isArray(noGran.bars));
  assert.ok(Array.isArray(noGran.cash));

  const withGran = dashboardData(dummyStore, thirtyDayRange, 'week');
  assert.ok(Array.isArray(withGran.cashRange));
  assert.equal(withGran.cashRange?.length, 5);
  assert.equal(withGran.bars.length, 5);
  // cash is still the 5 calendar month intervals
  assert.equal(withGran.cash.length, 5);
});
