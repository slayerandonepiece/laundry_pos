'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from './AdminProvider';
import { paid, paymentStatus, rangeFor, today, total, within } from '../admin.data';
import { dashboardData } from '../admin.analytics';
import { canAccess, homeFor } from '../admin.permissions';
import type { Employee, Expense, Order, Product, Screen, WorkStatus } from '../admin.types';
import AdminShell from '../components/AdminShell';
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

type Modal = { type: 'order'; id: string } | { type: 'newOrder' } | { type: 'product'; product?: Product } | { type: 'expense' } | { type: 'employee'; employee?: Employee } | null;
export default function AdminScreenContainer({ screen }: { screen: Screen }) {
  const { period, setPeriod, range, setRange, store, setStore, ready, user, login, logout, changePassword, storageError } = useAdmin();
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
    if (!user && screen !== 'login') router.replace('/admin/login');
    else if (user && (screen === 'login' || !canAccess(user.role, screen))) router.replace(homeFor(user.role));
  }, [ready, user, screen, router]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  if (!ready || !store) return <div className="ad-root ad-loading">Opening your workspace…</div>;
  if (screen === 'login') return user ? <div className="ad-root ad-loading">Opening your workspace…</div> : <Login error={error} onSubmit={(username, password) => { if (!login(username, password)) setError('The username or password is incorrect, or this account is inactive.'); }}/>;
  if (!user) return <div className="ad-root ad-loading">Returning to sign in…</div>;
  if (!canAccess(user.role, screen)) return <div className="ad-root ad-loading">Opening your permitted workspace…</div>;

  const isOwner = user.role === 'owner', current = today(), search = query.trim().toLowerCase();
  const open = (next: Modal) => {
    if (!isOwner && next && !['order', 'newOrder'].includes(next.type)) return;
    setError(''); setModal(next);
  };
  const orders = store.orders.filter(order => !order.legacyCancelled && (delivery !== 'all' ? order.status !== 'Completed' && (delivery === 'today' ? order.due === current : order.due < current) : attentionOnly ? order.status !== 'Completed' && order.due <= current : within(order.date, range)));
  const matching = orders.filter(order => (order.name + ' ' + order.phone + ' ' + order.id).toLowerCase().includes(search) && (status === 'All' || order.status === status) && (payment === 'All' || paymentStatus(order) === payment));
  const selected = modal?.type === 'order' ? store.orders.find(order => order.id === modal.id && !order.legacyCancelled) : undefined;
  const selectOrder = (order: Order) => open({ type: 'order', id: order.id });
  const exit = () => setConfirmation({ title: 'Log out?', description: 'Your saved changes will stay in this browser.', confirmLabel: 'Log out', onConfirm: () => { logout(); router.replace('/admin/login'); } });
  const complete = (message: string) => { setModal(null); setError(''); setNotice(message); };
  function updateStatus(next: WorkStatus) {
    if (!selected || next === selected.status || !['Pending', 'In Progress', 'Completed'].includes(next)) return;
    const id = selected.id;
    setConfirmation({ title: 'Update order status?', description: `Change ${id} from ${selected.status} to ${next}.`, confirmLabel: 'Update status', onConfirm: () => {
      setStore(previous => previous && ({ ...previous, orders: previous.orders.map(order => order.id === id ? { ...order, status: next, completed: next === 'Completed' ? current : undefined, history: [...(order.history || []), { status: next, at: new Date().toISOString(), by: user!.name }] } : order) })); setNotice('Order status updated'); setError('');
    } });
  }
  function recordPayment(amount: number, method: string) {
    if (!isOwner || !selected) return;
    if (!Number.isFinite(amount) || amount <= 0 || amount > total(selected) - paid(selected)) return setError('Payment must be positive and no more than the balance.');
    setStore(previous => previous && ({ ...previous, orders: previous.orders.map(order => order.id === selected.id ? { ...order, payments: [...order.payments, { id: crypto.randomUUID(), date: current, amount, method }] } : order) })); setNotice('Payment recorded'); setError('');
  }
  function addExpense(expense: Expense) {
    if (!isOwner) return;
    setStore(previous => previous && ({ ...previous, expenses: [expense, ...previous.expenses] })); complete('Expense saved');
  }
  function saveEmployee(draft: EmployeeDraft) {
    if (!isOwner || modal?.type !== 'employee') return;
    const existing = modal.employee;
    if (!draft.name || !/^[a-z0-9._-]{3,40}$/.test(draft.username)) return setError('Enter a name and a username with 3–40 letters, numbers, dots, underscores or hyphens.');
    if (draft.username === 'admin' || store!.employees.some(employee => employee.id !== existing?.id && employee.username.toLowerCase() === draft.username)) return setError('This username is already in use. Choose another.');
    if ((!existing || draft.password) && draft.password.length < 8) return setError('Use a password with at least 8 characters.');
    const changedCredentials = existing && (Boolean(draft.password) || draft.username !== existing.username || draft.active !== existing.active);
    const employee: Employee = { id: existing?.id || crypto.randomUUID(), ...draft, password: draft.password || existing!.password, credentialVersion: (existing?.credentialVersion || 1) + (changedCredentials ? 1 : 0) };
    const save = () => { setStore(previous => previous && ({ ...previous, employees: existing ? previous.employees.map(person => person.id === employee.id ? employee : person) : [...previous.employees, employee] })); complete(existing ? 'Employee updated' : 'Employee created'); };
    if (existing?.active && !draft.active) setConfirmation({ title: 'Deactivate employee?', description: `${employee.name} will lose access to Sales and Orders. Their saved orders will stay unchanged.`, confirmLabel: 'Deactivate', onConfirm: save });
    else save();
  }
  function toggleEmployee(employee: Employee) {
    if (!isOwner) return;
    setConfirmation({ title: employee.active ? 'Deactivate employee?' : 'Activate employee?', description: employee.active ? `${employee.name} will no longer be able to sign in. Existing orders will stay unchanged.` : `${employee.name} can sign in using their current credentials.`, confirmLabel: employee.active ? 'Deactivate' : 'Activate', onConfirm: () => {
      setStore(previous => previous && ({ ...previous, employees: previous.employees.map(person => person.id === employee.id ? { ...person, active: !person.active, credentialVersion: person.credentialVersion + 1 } : person) })); setNotice(employee.active ? 'Employee deactivated' : 'Employee activated');
    } });
  }
  const title = modal?.type === 'order' ? selected?.id || 'Order' : modal?.type === 'newOrder' ? (isOwner ? 'New sale' : 'New order') : modal?.type === 'product' ? (modal.product ? 'Edit service' : 'Add service') : modal?.type === 'employee' ? (modal.employee ? 'Edit employee' : 'Add employee') : 'Add expense';
  return <AdminShell screen={screen} name={user.name} role={user.role} onLogout={exit} onNew={() => open({ type: 'newOrder' })}>
    {storageError && <p className="ad-error" role="alert">{storageError}</p>}{notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    {(['dashboard', 'orders', 'expenses'].includes(screen) || (screen === 'sales' && isOwner)) && <div className="ad-filter-row"><DateFilter period={period} range={range} onPeriod={value => { setDelivery('all'); setAttentionOnly(false); setPeriod(value); if (value !== 'custom') setRange(rangeFor(value)); }} onRange={value => { setDelivery('all'); setAttentionOnly(false); if (value.from && value.to && value.from <= value.to) setRange(value); }}/><span>IST · INR ₹</span></div>}
    {isOwner && screen === 'dashboard' && <Dashboard data={dashboardData(store, range)} onSelect={selectOrder}/>}
    {screen === 'products' && <Catalogue readOnly={!isOwner} products={store.products.filter(product => (product.name + product.category).toLowerCase().includes(search))} search={query} view={catalogueView} onView={setCatalogueView} onSearch={setQuery} onEdit={product => open({ type: 'product', product })} onNew={() => open({ type: 'product' })}/>}
    {screen === 'sales' && !isOwner && <EmployeeSalesContainer/>}
    {(screen === 'orders' || (screen === 'sales' && isOwner)) && <Sales delivery={delivery} onDelivery={value => { setDelivery(value); setAttentionOnly(false); }} orders={orders} matching={matching} employee={!isOwner} attentionOnly={attentionOnly} query={query} status={status} payment={payment} onQuery={setQuery} onStatus={setStatus} onPayment={setPayment} onSelect={selectOrder} onClear={() => { setDelivery('all'); setQuery(''); setStatus('All'); setPayment('All'); setAttentionOnly(false); }}/>}
    {isOwner && screen === 'employees' && <Employees employees={store.employees.filter(employee => (employee.name + ' ' + employee.username).toLowerCase().includes(search))} search={query} onSearch={setQuery} onNew={() => open({ type: 'employee' })} onEdit={employee => open({ type: 'employee', employee })} onToggle={toggleEmployee}/>}
    {isOwner && screen === 'expenses' && <Expenses expenses={store.expenses.filter(expense => within(expense.due, range) && (expense.title + expense.category).toLowerCase().includes(search))} search={query} onSearch={setQuery} paidTotal={store.expenses.filter(expense => expense.paid && within(expense.paid, range)).reduce((sum, expense) => sum + expense.amount, 0)} dueTotal={store.expenses.filter(expense => !expense.paid && within(expense.due, range)).reduce((sum, expense) => sum + expense.amount, 0)} onNew={() => open({ type: 'expense' })} onPaid={id => { if (!isOwner) return; setConfirmation({ title: 'Mark expense paid?', description: 'Record this bill as paid today.', confirmLabel: 'Mark paid', onConfirm: () => { setStore(previous => previous && ({ ...previous, expenses: previous.expenses.map(expense => expense.id === id ? { ...expense, paid: current } : expense) })); setNotice('Expense marked paid'); } }); }}/>}
    {isOwner && screen === 'profile' && <Profile profile={store.profile} onLogout={exit} error={error} onSave={profile => { if (!isOwner) return; setStore(previous => previous && ({ ...previous, profile })); setNotice('Profile updated'); }} onPassword={(old, next, confirm) => { if (!isOwner) return false; if (next !== confirm || next === old || next.length < 8) { setError('Use a different password of at least 8 characters and confirm it exactly.'); return false; } if (!changePassword(old, next)) { setError('Current password is incorrect.'); return false; } setError(''); setNotice('Demo password changed for this browser session'); return true; }}/>}
    {modal && <Panel key={modal.type + (modal.type === 'order' ? modal.id : '')} title={title} headerContent={selected ? <OrderDetailsHeader order={selected}/> : undefined} variant={modal.type === 'order' ? 'details' : 'default'} onClose={() => setModal(null)} warnOnChanges={modal.type !== 'order'}>
      {selected && <OrderDetails order={selected} canRecordPayment={isOwner} error={error} onStatus={updateStatus} onPayment={recordPayment}/>}
      {modal.type === 'newOrder' && <OrderEditorContainer products={store.products} onSave={order => { setStore(previous => previous && ({ ...previous, orders: [{ ...order, history: [{ status: 'Pending', at: new Date().toISOString(), by: user.name }] }, ...previous.orders] })); open({ type: 'order', id: order.id }); setNotice('Order saved'); }}/>}
      {isOwner && modal.type === 'product' && <ProductEditorContainer product={modal.product} onSave={product => { if (!isOwner) return; setStore(previous => previous && ({ ...previous, products: previous.products.some(value => value.id === product.id) ? previous.products.map(value => value.id === product.id ? product : value) : [...previous.products, product] })); complete('Service saved'); }}/>}
      {isOwner && modal.type === 'expense' && <ExpenseEditor onSave={addExpense}/>}
      {isOwner && modal.type === 'employee' && <EmployeeEditor employee={modal.employee} error={error} onSave={saveEmployee}/>}
    </Panel>}
    {confirmation && <ConfirmationDialog {...confirmation} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation.onConfirm; setConfirmation(null); action(); }}/>}
  </AdminShell>;
}
