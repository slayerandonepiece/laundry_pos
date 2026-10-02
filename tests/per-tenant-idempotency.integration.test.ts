import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { todayIST } from '../src/server/dates';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({
  host: socket, user: 'subscription_test', database: 'postgres', port: 5432,
  application_name: 'el-tenant-idempotency-test',
}) });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
let orders: typeof import('../src/server/services/orders');
let expenses: typeof import('../src/server/services/expenses');
let employees: typeof import('../src/server/services/employees');

before(async () => {
  orders = await import('../src/server/services/orders');
  expenses = await import('../src/server/services/expenses');
  employees = await import('../src/server/services/employees');
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

test('the same idempotency key creates independent order, expense and employee rows per store; retries return the first row', async () => {
  const stores = await Promise.all(['A', 'B'].map(async name => {
    const store = await prisma.store.create({ data: { id: `store-idempotency-${name}`, name } });
    await prisma.subscription.create({ data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 0, paidThroughDate: new Date('2100-01-01') } });
    const product = await prisma.product.create({ data: { storeId: store.id, name: 'Wash', category: 'Laundry', type: 'ITEM', price: 100, active: true } });
    const actor = await prisma.user.create({ data: { name: `Owner ${name}`, phone: testPhone(`tenant_owner_${name}`), passwordHash: await hashPassword('password123') } });
    return { store, product, actor };
  }));
  const orderRows = [];
  const expenseRows = [];
  const employeeRows = [];
  for (const [index, { store, product, actor }] of stores.entries()) {
    const orderInput = { idempotencyKey: 'shared-order', phone: '9876543210', dueDate: todayIST(), entries: [{ productId: product.id, quantity: 1 }] };
    const expenseInput = { idempotencyKey: 'shared-expense', title: 'Rent', category: 'Fixed', amount: 100, due: todayIST(), monthly: false };
    const employeeInput = { idempotencyKey: 'shared-employee', name: `Employee ${index}`, phone: testPhone(`tenant_employee_${index}`), password: 'password123', active: true };
    const order = await orders.createOrder(store.id, orderInput, actor.id);
    const expense = await expenses.createExpense(store.id, expenseInput);
    const employee = await employees.createEmployee(store.id, employeeInput);
    assert.equal((await orders.createOrder(store.id, orderInput, actor.id)).id, order.id);
    assert.equal((await expenses.createExpense(store.id, expenseInput)).id, expense.id);
    assert.equal((await employees.createEmployee(store.id, employeeInput)).id, employee.id);
    orderRows.push(order);
    expenseRows.push(expense);
    employeeRows.push(employee);
  }
  assert.notEqual(orderRows[0].id, orderRows[1].id);
  assert.notEqual(expenseRows[0].id, expenseRows[1].id);
  assert.notEqual(employeeRows[0].id, employeeRows[1].id);
  for (const { store } of stores) {
    assert.equal(await prisma.order.count({ where: { storeId: store.id, idempotencyKey: 'shared-order' } }), 1);
    assert.equal(await prisma.expense.count({ where: { storeId: store.id, idempotencyKey: 'shared-expense' } }), 1);
    assert.equal(await prisma.storeMembership.count({ where: { storeId: store.id, idempotencyKey: 'shared-employee' } }), 1);
  }
});
