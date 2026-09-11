'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from './AdminProvider';
import { paid, paymentStatus, rangeFor, today, total, within } from '../admin.data';
import { dashboardData } from '../admin.analytics';
import { canAccess, homeFor } from '../admin.permissions';
import type { Employee, Expense, Order, Product, Screen, StorePaymentMethod, WorkStatus } from '../admin.types';
import Login from '../components/Login';
import Dashboard from '../components/Dashboard';
import Catalogue, { type CatalogueView } from '../components/Catalogue';
import Expenses from '../components/Expenses';
import Profile from '../components/Profile';
import Sales from '../components/Sales';
import EmployeeSalesContainer from './EmployeeSalesContainer';
import Employees from '../components/Employees';
import EmployeeEditor, { type EmployeeDraft } from '../components/EmployeeEditor';
import OrderDetailsHeader from '../components/OrderDetailsHeader';
import OrderDetails from '../components/OrderDetails';
import OrderEditorContainer from './OrderEditorContainer';
import ProductEditorContainer from './ProductEditorContainer';
import ExpenseEditor from '../components/ExpenseEditor';
import ConfirmationDialog, { type Confirmation } from '../components/ConfirmationDialog';
import { DateFilter, Panel } from '../components/Primitives';
import { AccessBlockedScreen, PaymentWarningBanner } from '../components/AccessNotices';
import { saveProductAction } from '../actions/products.actions';
import { createOrderAction, recordPaymentAction, updateOrderStatusAction } from '../actions/orders.actions';
import { createExpenseAction, markExpensePaidAction } from '../actions/expenses.actions';
import { createEmployeeAction, toggleEmployeeActiveAction, updateEmployeeAction } from '../actions/employees.actions';
import { changePasswordAction, saveProfileAction } from '../actions/profile.actions';
import type { Profile as ProfileType } from '../admin.types';

type Modal = { type: 'order'; id: string } | { type: 'newOrder' } | { type: 'product'; product?: Product } | { type: 'expense' } | { type: 'employee'; employee?: Employee } | null;
export default function AdminScreenContainer({ screen, serverProducts, serverOrders, serverExpenses, serverEmployees, serverProfile, serverPaymentMethods, ownerUsername }: { screen: Screen; serverProducts?: Product[]; serverOrders?: Order[]; serverExpenses?: Expense[]; serverEmployees?: Employee[]; serverProfile?: ProfileType; serverPaymentMethods?: StorePaymentMethod[]; ownerUsername?: string }) {
  const { period, setPeriod, range, setRange, ready, user, blockedReason, blockedPaidThroughDate, paymentWarning, login, logout } = useAdmin();
  const router = useRouter();
  const [delivery, setDelivery] = useState('all');
  const [attentionOnly, setAttentionOnly] = useState(false), [catalogueView, setCatalogueView] = useState<CatalogueView>('grid');
  const [query, setQuery] = useState(''), [status, setStatus] = useState('All'), [payment, setPayment] = useState('All');
  const [modal, setModal] = useState<Modal>(null), [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => {
    if (screen !== 'sales' && screen !== 'orders') return;
    // Synchronize the browser-only route drilldown after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttentionOnly(new URLSearchParams(window.location.search).get('attention') === '1');
    const orderId = new URLSearchParams(window.location.search).get('order');
    if (screen === 'orders' && orderId) setModal({ type: 'order', id: orderId });
  }, [screen]);
  useEffect(() => {
    if (!ready) return;
    if (!user && screen !== 'login') router.replace('/login');
    else if (user && (screen === 'login' || !canAccess(user.role, screen))) router.replace(homeFor(user.role));
  }, [ready, user, screen, router]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  if (!ready) return <div className="ad-root ad-loading">Opening your workspace…</div>;
  if (screen === 'login') return user ? <div className="ad-root ad-loading">Opening your workspace…</div> : <Login error={error} onSubmit={(username, password) => { login(username, password).then(ok => { if (!ok) setError('The username or password is incorrect, or this account is inactive.'); }); }}/>;
  if (!user) return <div className="ad-root ad-loading">Returning to sign in…</div>;
  if (!canAccess(user.role, screen)) return <div className="ad-root ad-loading">Opening your permitted workspace…</div>;

  const isOwner = user.role === 'owner', current = today(), search = query.trim().toLowerCase();
  const allOrders = serverOrders ?? [];
  const allProducts = serverProducts ?? [];
  const allExpenses = serverExpenses ?? [];
  const allEmployees = serverEmployees ?? [];
  const allProfile = serverProfile ?? { name: '', phone: '', email: '', store: '', address: '' };
  const open = (next: Modal) => {
    if (!isOwner && next && !['order', 'newOrder'].includes(next.type)) return;
    setError(''); setModal(next);
  };
  const orders = allOrders.filter(order => !order.legacyCancelled && (delivery !== 'all' ? order.status !== 'Delivered' && (order.status as string) !== 'Completed' && (delivery === 'today' ? order.due === current : order.due < current) : attentionOnly ? order.status !== 'Delivered' && (order.status as string) !== 'Completed' && order.due <= current : within(order.date, range)));
  const matching = orders.filter(order => (order.name + ' ' + order.phone + ' ' + order.id).toLowerCase().includes(search) && (status === 'All' || order.status === status) && (payment === 'All' || paymentStatus(order) === payment));
  const selected = modal?.type === 'order' ? allOrders.find(order => order.id === modal.id && !order.legacyCancelled) : undefined;
  const selectOrder = (order: Order) => open({ type: 'order', id: order.id });
  const exit = () => setConfirmation({ title: 'Log out?', description: 'You can sign back in any time.', confirmLabel: 'Log out', onConfirm: () => { logout(); router.replace('/login'); } });
  const complete = (message: string) => { setModal(null); setError(''); setNotice(message); };
  function updateStatus(next: WorkStatus) {
    if (!selected || next === selected.status || !['Pending', 'In Progress', 'Ready', 'Delivered'].includes(next)) return;
    const id = selected.id;
    setConfirmation({ title: 'Update order status?', description: `Change ${id} from ${selected.status} to ${next}.`, confirmLabel: 'Update status', onConfirm: () => {
      updateOrderStatusAction(id, next).then(() => { router.refresh(); setNotice('Order status updated'); setError(''); }).catch(() => setError('Could not update the status. Try again.'));
    } });
  }
  function recordPayment(amount: number, method: string) {
    if (!selected) return;
    if (!Number.isFinite(amount) || amount <= 0 || amount > total(selected) - paid(selected)) return setError('Payment must be positive and no more than the balance.');
    recordPaymentAction(selected.id, amount, method).then(() => { router.refresh(); setNotice('Payment recorded'); setError(''); }).catch(() => setError('Could not record the payment. Try again.'));
  }
  function addExpense(expense: Expense) {
    if (!isOwner) return;
    createExpenseAction({ title: expense.title, category: expense.category, amount: expense.amount, due: expense.due, monthly: expense.monthly, paidToday: Boolean(expense.paid) })
      .then(() => { router.refresh(); complete('Expense saved'); })
      .catch(() => setError('Could not save the expense. Try again.'));
  }
  function saveEmployee(draft: EmployeeDraft) {
    if (!isOwner || modal?.type !== 'employee') return;
    const existing = modal.employee;
    if (!draft.name || !/^[a-z0-9._-]{3,40}$/.test(draft.username)) return setError('Enter a name and a username with 3–40 letters, numbers, dots, underscores or hyphens.');
    if ((!existing || draft.password) && draft.password.length < 8) return setError('Use a password with at least 8 characters.');
    const save = () => {
      const action = existing ? updateEmployeeAction(existing.id, draft) : createEmployeeAction(draft);
      action.then(result => {
        if (!result.ok) return setError(result.error || 'Could not save the employee. Try again.');
        router.refresh(); complete(existing ? 'Employee updated' : 'Employee created');
      }).catch(() => setError('Could not save the employee. Try again.'));
    };
    if (existing?.active && !draft.active) setConfirmation({ title: 'Deactivate employee?', description: `${draft.name} will lose access to Sales and Orders. Their saved orders will stay unchanged.`, confirmLabel: 'Deactivate', onConfirm: save });
    else save();
  }
  function toggleEmployee(employee: Employee) {
    if (!isOwner) return;
    setConfirmation({ title: employee.active ? 'Deactivate employee?' : 'Activate employee?', description: employee.active ? `${employee.name} will no longer be able to sign in. Existing orders will stay unchanged.` : `${employee.name} can sign in using their current credentials.`, confirmLabel: employee.active ? 'Deactivate' : 'Activate', onConfirm: () => {
      toggleEmployeeActiveAction(employee.id).then(() => { router.refresh(); setNotice(employee.active ? 'Employee deactivated' : 'Employee activated'); }).catch(() => setError('Could not update this employee. Try again.'));
    } });
  }
  const title = modal?.type === 'order' ? selected?.id || 'Order' : modal?.type === 'newOrder' ? (isOwner ? 'New sale' : 'New order') : modal?.type === 'product' ? (modal.product ? 'Edit service' : 'Add service') : modal?.type === 'employee' ? (modal.employee ? 'Edit employee' : 'Add employee') : 'Add expense';
  return <>
    <div className="ad-page-heading"><div><p className="ad-eyebrow">EXPRESS LAUNDRY WORKSPACE</p><h1>{screen.charAt(0).toUpperCase() + screen.slice(1)}</h1><p>{screen === 'dashboard' ? 'Your orders, sales and upcoming deliveries.' : { products: isOwner ? 'Manage your services and prices.' : 'View the services available for orders.', sales: !isOwner ? 'Choose services, add customer details and punch an order.' : 'Track orders from drop-off to handover.', orders: 'Find orders and update their progress.', expenses: 'Track bills and payments.', employees: 'Manage your team and their access.', profile: 'Your account and store details.' }[screen as 'products']}</p></div>{screen === 'sales' && isOwner && <button className="ad-button" onClick={() => open({ type: 'newOrder' })}>＋ New sale</button>}</div>
    <div className="ad-screen-content">
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    {blockedReason ? (
      // Access withheld (admin lock, archived store, this membership
      // deactivated, or the subscription lapsing) — the normal screens are
      // replaced entirely rather than rendering their now-empty server data
      // next to a small banner (see .agents/2026-09-brainstorm-plan.md Items
      // 1 and 3). Logout/navigation stay reachable via the persistent
      // AdminChrome sidebar/topbar.
      <AccessBlockedScreen reason={blockedReason} isOwner={isOwner} paidThroughDate={blockedPaidThroughDate}/>
    ) : (<>
      {paymentWarning && <PaymentWarningBanner isOwner={isOwner} paidThroughDate={paymentWarning.paidThroughDate}/>}
      {(['dashboard', 'orders', 'expenses'].includes(screen) || (screen === 'sales' && isOwner)) && <div className="ad-filter-row"><DateFilter period={period} range={range} onPeriod={value => { setDelivery('all'); setAttentionOnly(false); setPeriod(value); if (value !== 'custom') setRange(rangeFor(value)); }} onRange={value => { setDelivery('all'); setAttentionOnly(false); if (value.from && value.to && value.from <= value.to) setRange(value); }}/><span>IST · INR ₹</span></div>}
      {isOwner && screen === 'dashboard' && <Dashboard data={dashboardData({ orders: allOrders, expenses: allExpenses, products: allProducts }, range)} onSelect={selectOrder}/>}
      {screen === 'products' && <Catalogue readOnly={!isOwner} products={allProducts.filter(product => (product.name + product.category).toLowerCase().includes(search))} search={query} view={catalogueView} onView={setCatalogueView} onSearch={setQuery} onEdit={product => open({ type: 'product', product })} onNew={() => open({ type: 'product' })}/>}
      {screen === 'sales' && !isOwner && <EmployeeSalesContainer products={allProducts} paymentMethods={serverPaymentMethods ?? []}/>}
      {(screen === 'orders' || (screen === 'sales' && isOwner)) && <Sales delivery={delivery} onDelivery={value => { setDelivery(value); setAttentionOnly(false); }} orders={orders} matching={matching} employee={!isOwner} attentionOnly={attentionOnly} query={query} status={status} payment={payment} onQuery={setQuery} onStatus={setStatus} onPayment={setPayment} onSelect={selectOrder} onClear={() => { setDelivery('all'); setQuery(''); setStatus('All'); setPayment('All'); setAttentionOnly(false); }}/>}
      {isOwner && screen === 'employees' && <Employees employees={allEmployees.filter(employee => (employee.name + ' ' + employee.username).toLowerCase().includes(search))} search={query} onSearch={setQuery} onNew={() => open({ type: 'employee' })} onEdit={employee => open({ type: 'employee', employee })} onToggle={toggleEmployee}/>}
      {isOwner && screen === 'expenses' && <Expenses expenses={allExpenses.filter(expense => within(expense.due, range) && (expense.title + expense.category).toLowerCase().includes(search))} search={query} onSearch={setQuery} paidTotal={allExpenses.filter(expense => expense.paid && within(expense.paid, range)).reduce((sum, expense) => sum + expense.amount, 0)} dueTotal={allExpenses.filter(expense => !expense.paid && within(expense.due, range)).reduce((sum, expense) => sum + expense.amount, 0)} onNew={() => open({ type: 'expense' })} onPaid={id => { if (!isOwner) return; setConfirmation({ title: 'Mark expense paid?', description: 'Record this bill as paid today.', confirmLabel: 'Mark paid', onConfirm: () => { markExpensePaidAction(id).then(() => { router.refresh(); setNotice('Expense marked paid'); }).catch(() => setError('Could not mark this expense paid. Try again.')); } }); }}/>}
      {isOwner && screen === 'profile' && <Profile profile={allProfile} paymentMethods={serverPaymentMethods ?? []} username={ownerUsername} onLogout={exit} error={error} onSave={profile => { if (!isOwner) return; saveProfileAction(profile).then(result => { if (!result.ok) return setError(result.error || 'Could not save your profile. Try again.'); router.refresh(); setError(''); setNotice('Profile updated'); }).catch(() => setError('Could not save your profile. Try again.')); }} onPassword={async (old, next, confirm) => { if (!isOwner) return false; if (next !== confirm || next === old || next.length < 8) { setError('Use a different password of at least 8 characters and confirm it exactly.'); return false; } try { const result = await changePasswordAction(old, next); if (!result.ok) { setError(result.error || 'Could not update your password. Try again.'); return false; } setError(''); setNotice('Password updated — signing you out for security.'); logout(); router.replace('/login'); return true; } catch { setError('Could not update your password. Try again.'); return false; } }}/>}
      {modal && <Panel key={modal.type + (modal.type === 'order' ? modal.id : '')} title={title} headerContent={selected ? <OrderDetailsHeader order={selected}/> : undefined} variant={modal.type === 'order' ? 'details' : 'default'} onClose={() => setModal(null)} warnOnChanges={modal.type !== 'order'}>
        {selected && <OrderDetails order={selected} paymentMethods={serverPaymentMethods ?? []} canRecordPayment={true} error={error} onStatus={updateStatus} onPayment={recordPayment}/>}
        {modal.type === 'newOrder' && <OrderEditorContainer products={allProducts} paymentMethods={serverPaymentMethods ?? []} onSave={input => createOrderAction(input).then(order => { router.refresh(); open({ type: 'order', id: order.id }); setNotice('Order saved'); })}/>}
        {isOwner && modal.type === 'product' && <ProductEditorContainer product={modal.product} error={error} onSave={product => { if (!isOwner) return; saveProductAction(product).then(() => { router.refresh(); complete('Service saved'); }).catch(() => setError('Could not save the service. Try again.')); }}/>}
        {isOwner && modal.type === 'expense' && <ExpenseEditor error={error} onSave={addExpense}/>}
        {isOwner && modal.type === 'employee' && <EmployeeEditor employee={modal.employee} error={error} onSave={saveEmployee}/>}
      </Panel>}
    </>)}
    {confirmation && <ConfirmationDialog {...confirmation} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation.onConfirm; setConfirmation(null); action(); }}/>}
    </div>
  </>;
}
