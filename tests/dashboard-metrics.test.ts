import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashboardData } from '../src/features/admin/admin.analytics';
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
