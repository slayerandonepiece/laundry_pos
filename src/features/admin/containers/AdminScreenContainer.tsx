'use client';
import { cacheCreatedOrder } from '../client-cache';
import { useOrdersCache } from './useOrdersCache';
import { useOrderMutation } from './useOrderMutation';
const emptyOrders: Order[] = [];
import { isValidPhone } from '@/lib/contactValidation';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from './AdminProvider';
import { money, paid, paymentStatus, rangeFor, today, total, within } from '../admin.data';
import { dashboardData } from '../admin.analytics';
import { canAccess, homeFor } from '../admin.permissions';
import type { Employee, Expense, Order, Product, Screen, StorePaymentMethod, WorkStatus } from '../admin.types';
import type { OutletListItem, StoreDetail } from '@/features/super-admin/types';
import type { OrganizationPaymentMethodDTO } from '@/server/services/platform-payment-methods';
import Login from '../components/Login';
import Dashboard, { type DashboardOutlet, type DashboardOutletSummary } from '../components/Dashboard';
import { DashboardLoading } from '../components/DashboardStates';
import { TableLoading, ProfileLoading } from '../components/WorkspaceLoading';
import DashboardOutletControl from '../components/DashboardOutletControl';
import DashboardPeriodControl from '../components/DashboardPeriodControl';
import DashboardLoadBoundary from '../components/DashboardLoadBoundary';
import Catalogue from '../components/Catalogue';
import Expenses from '../components/Expenses';
import Profile from '../components/Profile';
import Sales from '../components/Sales';
import EmployeeSalesContainer from './EmployeeSalesContainer';
import Employees from '../components/Employees';
import OutletsList from '../components/OutletsList';
import EmployeeEditor, { type EmployeeDraft } from '../components/EmployeeEditor';
import OrderDetailsHeader from '../components/OrderDetailsHeader';
import OrderDetails from '../components/OrderDetails';
import OrderEditorContainer from './OrderEditorContainer';
import ProductEditorContainer from './ProductEditorContainer';
import ExpenseEditor from '../components/ExpenseEditor';
import ExpenseDetails from '../components/ExpenseDetails';
import DeleteExpenseDialog from '../components/DeleteExpenseDialog';
import ResetEmployeePasswordDialog from '../components/ResetEmployeePasswordDialog';
import MarkExpensePaidDialog from '../components/MarkExpensePaidDialog';
import ConfirmationDialog, { type Confirmation } from '../components/ConfirmationDialog';
import { DateFilter, Panel } from '../components/Primitives';
import { requestOrganizationDeletionAction } from '../actions/account-deletion.actions';
import { AccessBlockedScreen, PaymentWarningBanner } from '../components/AccessNotices';
import { saveProductAction } from '../actions/products.actions';
import { createOrderAction, recordPaymentAction, updateOrderStatusAction } from '../actions/orders.actions';
import { createExpenseAction, markExpensePaidAction, updateExpenseAction, deleteExpenseAction } from '../actions/expenses.actions';
import { createEmployeeAction, toggleEmployeeActiveAction, updateEmployeeAction, resetEmployeePasswordAction } from '../actions/employees.actions';
import { changePasswordAction, saveProfileAction } from '../actions/profile.actions';
import type { Profile as ProfileType } from '../admin.types';

type Modal = { type: 'order'; id: string } | { type: 'newOrder' } | { type: 'product'; product?: Product } | { type: 'expense'; expense?: Expense } | { type: 'expenseView'; expense: Expense } | { type: 'employee'; employee?: Employee } | null;
export default function AdminScreenContainer({ screen, serverStoreId, serverProducts, serverOrders, serverExpenses, serverOutlets, serverEmployees, serverProfile, serverPaymentMethods, serverOrgPaymentMethods, ownerLoginPhone, storeInfo, passwordUpdatedAt, serverSummaries, allOutletsSelected, outletName, dashboardOutlets, selectedOutletId, dashboardLoadFailed = false }: { screen: Screen; serverStoreId?: string; serverProducts?: Product[]; serverOrders?: Order[]; serverExpenses?: Expense[]; serverOutlets?: OutletListItem[]; serverEmployees?: Employee[]; serverProfile?: ProfileType; serverPaymentMethods?: StorePaymentMethod[]; serverOrgPaymentMethods?: OrganizationPaymentMethodDTO[]; ownerLoginPhone?: string; serverSummaries?: DashboardOutletSummary[]; dashboardLoadFailed?: boolean; dashboardOutlets?: DashboardOutlet[]; selectedOutletId?: string; storeInfo?: StoreDetail | null; passwordUpdatedAt?: string; allOutletsSelected?: boolean; outletName?: string }) {
  const { period, setPeriod, range, setRange, ready, user, sessionVerified, blockedReason, blockedPaidThroughDate, paymentWarning, login, logout } = useAdmin();
  const router = useRouter();
  const [dashboardPeriod, setDashboardPeriod] = useState('14d');
  const [dashboardRange, setDashboardRange] = useState(() => {
    const to = today();
    return { from: new Date(Date.parse(to) - 13 * 86400000).toISOString().slice(0, 10), to };
  });
  const [delivery, setDelivery] = useState('all');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [query, setQuery] = useState(''), [status, setStatus] = useState('All'), [payment, setPayment] = useState('All');
  const [modal, setModal] = useState<Modal>(null), [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<Employee | null>(null);
  const [paidExpenseId, setPaidExpenseId] = useState<string | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const orderMutation = useOrderMutation({ storeId: serverStoreId ?? user?.storeId ?? '', serverOrders, onError: setError, onSuccess: setNotice });
  const [optimisticOrders, setOptimisticOrders] = useState<Order[]>([]);
  const cachedOrders = useOrdersCache(serverStoreId ?? '', screen === 'sales' && blockedReason !== 'store_locked' && sessionVerified && user?.role === 'owner' && user.storeId === serverStoreId, serverOrders ?? emptyOrders);
  const allOrders = useMemo(() => {
    const server = cachedOrders;
    const serverIds = new Set(server.map(o => o.id));
    const pending = optimisticOrders.filter(o => !serverIds.has(o.id));
    return [...pending, ...server];
  }, [cachedOrders, optimisticOrders]);
  useEffect(() => {
    if (screen !== 'sales' && screen !== 'orders') return;
    // Synchronize the browser-only route drilldown after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttentionOnly(new URLSearchParams(window.location.search).get('attention') === '1');
    const orderId = new URLSearchParams(window.location.search).get('order');
    if (orderId) setModal({ type: 'order', id: orderId });
  }, [screen]);
  useEffect(() => {
    if (!ready) return;
    if (!user && screen !== 'login') router.replace('/login');
    else if (user && (screen === 'login' || !canAccess(user.role, screen))) router.replace(homeFor(user.role));
  }, [ready, user, screen, router]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  if (!ready) {
    if (screen === 'dashboard') return <DashboardLoading />;
    if (screen === 'profile') return <ProfileLoading />;
    if (screen !== 'login') return <TableLoading />;
    return <div className="ad-root ad-loading">Opening your workspace…</div>;
  }
  if (screen === 'login') return user ? <div className="ad-root ad-loading">Opening your workspace…</div> : <Login error={error} onSubmit={(phone, password) => { login(phone, password).then(ok => { if (!ok) setError('The phone or password is incorrect, or this account is inactive.'); }); }}/>;
  if (!user) return <div className="ad-root ad-loading">Returning to sign in…</div>;
  if (!canAccess(user.role, screen)) return <div className="ad-root ad-loading">Opening your permitted workspace…</div>;

  const readOnly = blockedReason === 'store_locked';
  const isOwner = user.role === 'owner', current = today(), search = query.trim().toLowerCase();
  const allProducts = serverProducts ?? [];
  const allExpenses = serverExpenses ?? [];
  const allOutlets = serverOutlets ?? [];
  const allEmployees = serverEmployees ?? [];
  const allProfile = serverProfile ?? { name: '', phone: '', email: '', store: '', address: '' };
  const open = (next: Modal) => {
    if (readOnly && next && !['order', 'expenseView'].includes(next.type)) return;
    if (!isOwner && next && !['order', 'newOrder'].includes(next.type)) return;
    setError(''); setModal(next);
  };
  const orders = allOrders.filter(order => !order.legacyCancelled && (delivery !== 'all' ? order.status !== 'Delivered' && (order.status as string) !== 'Completed' && (delivery === 'today' ? order.due === current : order.due < current) : attentionOnly ? order.status !== 'Delivered' && (order.status as string) !== 'Completed' && order.due <= current : within(order.date, range)));
  const matching = orders.filter(order => (order.name + ' ' + order.phone + ' ' + order.id).toLowerCase().includes(search) && (status === 'All' || order.status === status) && (payment === 'All' || paymentStatus(order) === payment));
  const selected = modal?.type === 'order' ? (orderMutation.updatedOrder?.id === modal.id ? orderMutation.updatedOrder : allOrders.find(order => order.id === modal.id && !order.legacyCancelled)) : undefined;
  const selectOrder = (order: Order) => open({ type: 'order', id: order.id });
  const requestDeletion = () => setConfirmation({ title: 'Delete this organization?', description: 'All orders, services, expenses, staff and outlets will be permanently deleted after a grace period (90 days by default). Your team is locked out immediately. Sign in and restore before then to cancel.', confirmLabel: 'Request deletion', onConfirm: async () => { try { const result = await requestOrganizationDeletionAction(); if (!result.ok) { setError(result.error || 'Could not request deletion. Try again.'); return; } await logout(); router.replace('/login'); } catch { setError('Could not request deletion. Try again.'); } } });
  const exit = () => setConfirmation({ title: 'Log out?', description: 'You can sign back in any time.', confirmLabel: 'Log out', onConfirm: async () => { await logout(); router.replace('/login'); } });
  const complete = (message: string) => { setModal(null); setError(''); setNotice(message); };
  function updateStatus(next: WorkStatus) {
    if (readOnly || !selected || next === selected.status || !['Pending', 'In Progress', 'Ready', 'Delivered'].includes(next)) return;
    const id = selected.id;
    const balanceDue = total(selected) - paid(selected);
    const deliverWithBalance = next === 'Delivered' && balanceDue > 0;
    setConfirmation({ title: 'Update order status?', description: deliverWithBalance ? `${id} still has ${money(balanceDue)} due. Mark it delivered anyway?` : `Change ${id} from ${selected.status} to ${next}.`, confirmLabel: deliverWithBalance ? 'Deliver anyway' : 'Update status', onConfirm: () => {
      orderMutation.run(() => updateOrderStatusAction(id, next), 'Updating status…', 'Order status updated', 'Could not update the status. Try again.');
    } });
  }
  function recordPayment(amount: number, method: string) {
    if (readOnly || !selected) return;
    if (!Number.isFinite(amount) || amount <= 0 || amount > total(selected) - paid(selected)) return setError('Payment must be positive and no more than the balance.');
    const id = selected.id;
    orderMutation.run(() => recordPaymentAction(id, amount, method), 'Recording payment…', 'Payment recorded', 'Could not record the payment. Try again.');
  }
  function addExpense(expense: Expense): Promise<void> {
    if (readOnly || !isOwner) return Promise.resolve();
    if (modal?.type === 'expense' && modal.expense) {
      return updateExpenseAction(modal.expense.id, { title: expense.title, category: expense.category, amount: expense.amount, due: expense.due, outletId: expense.outletId })
        .then(() => { router.refresh(); complete('Expense updated'); })
        .catch(() => setError('Could not update the expense. Check its due month and outlet, then try again.'));
    }
    return createExpenseAction({ title: expense.title, category: expense.category, amount: expense.amount, due: expense.due, monthly: expense.monthly, paidToday: Boolean(expense.paid), outletId: expense.outletId })
      .then(() => { router.refresh(); complete('Expense saved'); })
      .catch(() => setError('Could not save the expense. Try again.'));
  }
  function saveEmployee(draft: EmployeeDraft): Promise<void> {
    if (readOnly || !isOwner || modal?.type !== 'employee') return Promise.resolve();
    const existing = modal.employee;
    if (!draft.name || !isValidPhone(draft.phone)) { setError('Enter a name and a valid phone number (8–15 digits).'); return Promise.resolve(); }
    if ((!existing || draft.password) && (draft.password ?? '').length < 8) { setError('Use a password with at least 8 characters.'); return Promise.resolve(); }
    const save = () => {
      const action = existing ? updateEmployeeAction(existing.id, draft) : createEmployeeAction(draft);
      return action.then(result => {
        if (!result.ok) return setError(result.error || 'Could not save the employee. Try again.');
        router.refresh(); complete(existing ? 'Employee updated' : 'Employee created');
      }).catch(() => setError('Could not save the employee. Try again.'));
    };
    if (existing?.active && !draft.active) { setConfirmation({ title: 'Deactivate employee?', description: `${draft.name} will lose access to Sales. Their saved orders will stay unchanged.`, confirmLabel: 'Deactivate', onConfirm: save }); return Promise.resolve(); }
    return save();
  }
  function toggleEmployee(employee: Employee) {
    if (readOnly || !isOwner) return;
    setConfirmation({ title: employee.active ? 'Deactivate employee?' : 'Activate employee?', description: employee.active ? `${employee.name} will no longer be able to sign in. Existing orders will stay unchanged.` : `${employee.name} can sign in using their current credentials.`, confirmLabel: employee.active ? 'Deactivate' : 'Activate', onConfirm: () => {
      toggleEmployeeActiveAction(employee.id).then(() => { router.refresh(); setNotice(employee.active ? 'Employee deactivated' : 'Employee activated'); }).catch(() => setError('Could not update this employee. Try again.'));
    } });
  }
  const title = modal?.type === 'order' ? selected?.id || 'Order' : modal?.type === 'newOrder' ? (isOwner ? 'New sale' : 'New order') : modal?.type === 'product' ? (modal.product ? 'Edit service' : 'Add service') : modal?.type === 'employee' ? (modal.employee ? 'Edit employee' : 'Add employee') : 'Add expense';
  return <>
    {screen !== 'dashboard' && <div className="ad-page-heading"><div><h1>{screen.charAt(0).toUpperCase() + screen.slice(1)}</h1><p>{{ products: isOwner ? 'Manage your services and prices.' : 'View the services available for orders.', sales: 'Browse sales history and open individual orders.', orders: 'Choose services, find your customer and create an order.', expenses: 'Track bills and payments.', employees: 'Manage your team and their access.', outlets: 'Physical branches for this organization.', profile: 'Your account and store details.' }[screen as 'products']}</p></div>{screen === 'employees' && isOwner && <button disabled={readOnly} className="ad-button" onClick={() => open({ type: 'employee' })}>＋ Add employee</button>}</div>}
    <div className={"ad-screen-content ad-screen-" + screen}>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    {blockedReason && blockedReason !== 'store_locked' ? (
      // Access withheld (admin lock, archived store, this membership
      // deactivated, or the subscription lapsing) — the normal screens are
      // replaced entirely rather than rendering their now-empty server data
      // next to a small banner (see .agents/2026-09-brainstorm-plan.md Items
      // 1 and 3). Logout/navigation stay reachable via the persistent
      // AdminChrome sidebar/topbar.
      <AccessBlockedScreen reason={blockedReason} isOwner={isOwner} paidThroughDate={blockedPaidThroughDate}/>
    ) : (<>
      {paymentWarning && <PaymentWarningBanner isOwner={isOwner} paidThroughDate={paymentWarning.paidThroughDate}/>}
      {(['sales', 'expenses'].includes(screen)) && <div className="ad-filter-row"><DateFilter period={period} range={range} onPeriod={value => { setDelivery('all'); setAttentionOnly(false); setPeriod(value); if (value !== 'custom') setRange(rangeFor(value)); }} onRange={value => { setDelivery('all'); setAttentionOnly(false); if (value.from && value.to && value.from <= value.to) setRange(value); }}/>{screen === 'expenses' ? <button disabled={readOnly} className="ad-button" onClick={() => open({ type: 'expense' })}>＋ Add expense</button> : <span>IST · INR ₹</span>}</div>}
      {isOwner && screen === 'dashboard' && <DashboardLoadBoundary failed={dashboardLoadFailed}>
        <DashboardOutletControl outlets={dashboardOutlets ?? []} selectedOutletId={selectedOutletId} allOutletsSelected={allOutletsSelected} />
        <Dashboard data={dashboardData({ orders: allOrders, expenses: allExpenses, products: allProducts }, dashboardRange)}
          previousPoints={dashboardData({ orders: allOrders, expenses: allExpenses, products: allProducts }, {
            from: new Date(Date.parse(dashboardRange.from) - Math.max(86400000, Date.parse(dashboardRange.to < current ? dashboardRange.to : current) - Date.parse(dashboardRange.from) + 86400000)).toISOString().slice(0, 10),
            to: new Date(Date.parse(dashboardRange.from) - 86400000).toISOString().slice(0, 10),
          }).bars}
          recentOrders={allOrders.filter(order => !order.legacyCancelled).slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id, undefined, { numeric: true }))}
          businessDate={current} yesterday={new Date(Date.parse(current) - 86400000).toISOString().slice(0, 10)}
          trendTitle={dashboardPeriod === '14d' ? 'Sales trend — last 14 days (2-day buckets)' : 'Sales trend — selected period'}
          trendControl={<DashboardPeriodControl period={dashboardPeriod} range={dashboardRange} currentDate={current} onPeriodChange={setDashboardPeriod} onRangeChange={setDashboardRange} />}
          summaries={serverSummaries} allOutletsSelected={allOutletsSelected} outlets={dashboardOutlets} outletName={outletName} onSelect={selectOrder} />
      </DashboardLoadBoundary>}
      {screen === 'products' && <Catalogue actionsDisabled={readOnly} readOnly={!isOwner} products={allProducts.filter(product => (product.name + product.category).toLowerCase().includes(search))} totalCount={allProducts.length} search={query} onSearch={setQuery} onEdit={product => open({ type: 'product', product })} onNew={() => open({ type: 'product' })}/>}
      {screen === 'orders' && readOnly && <p role="status" className="ad-help">This workspace is read-only. Open Sales to view existing orders.</p>}
      {screen === 'orders' && !readOnly && <EmployeeSalesContainer products={allProducts} paymentMethods={serverPaymentMethods ?? []} outlets={allOutlets.filter(outlet => outlet.status === 'ACTIVE').map(outlet => ({ id: outlet.id, name: outlet.displayName }))}/>}
      {screen === 'sales' && <Sales delivery={delivery} onDelivery={value => { setDelivery(value); setAttentionOnly(false); }} orders={orders} matching={matching} employee={!isOwner} attentionOnly={attentionOnly} query={query} status={status} payment={payment} onQuery={setQuery} onStatus={setStatus} onPayment={setPayment} onSelect={selectOrder} onClear={() => { setDelivery('all'); setQuery(''); setStatus('All'); setPayment('All'); setAttentionOnly(false); }} outlets={allOutlets.map(o => ({ id: o.id, name: o.displayName }))} onNewOrder={!readOnly ? () => router.push('/admin/orders') : undefined}/>}
      {isOwner && screen === 'employees' && <Employees readOnly={readOnly} employees={allEmployees.filter(employee => (employee.name + ' ' + employee.phone).toLowerCase().includes(search))} outlets={allOutlets} search={query} onSearch={setQuery} onNew={() => open({ type: 'employee' })} onEdit={employee => open({ type: 'employee', employee })} onToggle={toggleEmployee} onResetPassword={setPasswordTarget}/>}
      {screen === 'outlets' && <OutletsList outlets={allOutlets} />}
      {isOwner && screen === 'expenses' && <Expenses readOnly={readOnly} expenses={allExpenses.filter(expense => within(expense.due, range) && (expense.title + expense.category).toLowerCase().includes(search))} outlets={allOutlets} onNew={() => open({ type: 'expense' })} onPaid={id => setPaidExpenseId(id)} onView={expense => open({ type: 'expenseView', expense })} onEdit={expense => open({ type: 'expense', expense })} onDelete={setDeleteTarget}/> }
      {screen === 'profile' && <Profile readOnly={readOnly} role={user.role} profile={allProfile} paymentMethods={serverOrgPaymentMethods ?? []} outlets={serverOutlets ?? []} storeInfo={storeInfo ?? null} passwordUpdatedAt={passwordUpdatedAt} phone={ownerLoginPhone} onLogout={exit} onRequestDeletion={isOwner ? requestDeletion : undefined} error={error} onSave={profile => { if (readOnly || !isOwner) return; saveProfileAction(profile).then(result => { if (!result.ok) return setError(result.error || 'Could not save your profile. Try again.'); router.refresh(); setError(''); setNotice('Profile updated'); }).catch(() => setError('Could not save your profile. Try again.')); }} onPassword={async (old, next, confirm) => { if (readOnly) return false; if (next !== confirm || next === old || next.length < 8) { setError('Use a different password of at least 8 characters and confirm it exactly.'); return false; } try { const result = await changePasswordAction(old, next); if (!result.ok) { setError(result.error || 'Could not update your password. Try again.'); return false; } setError(''); setNotice('Password updated — signing you out for security.'); logout(); router.replace('/login'); return true; } catch { setError('Could not update your password. Try again.'); return false; } }}/>}
      {modal && (!readOnly || modal.type === 'order') && modal.type !== 'expense' && modal.type !== 'expenseView' && modal.type !== 'employee' && modal.type !== 'product' && <Panel key={modal.type + (modal.type === 'order' ? modal.id : '')} title={title} busy={modal.type === 'order' && orderMutation.pending} busyLabel={orderMutation.label} headerContent={selected ? <OrderDetailsHeader readOnly={readOnly} order={selected} outletName={allOutlets.find(o => o.id === selected.outletId)?.displayName ?? dashboardOutlets?.find(o => o.id === selected.outletId)?.displayName}/> : undefined} variant={modal.type === 'order' ? 'details' : 'default'} onClose={() => setModal(null)} warnOnChanges={modal.type !== 'order'}>
        {selected && <OrderDetails readOnly={readOnly} order={selected} paymentMethods={serverPaymentMethods ?? []} canRecordPayment={!readOnly} error={error} onStatus={updateStatus} onPayment={recordPayment}/>}
        {modal.type === 'newOrder' && <OrderEditorContainer products={allProducts} paymentMethods={serverPaymentMethods ?? []} outlets={allOutlets.filter(outlet => outlet.status === 'ACTIVE')} onSave={(input, outletId) => createOrderAction(input, outletId).then(order => { if (sessionVerified) cacheCreatedOrder(user.storeId, order); setOptimisticOrders(prev => [order, ...prev.filter(o => o.id !== order.id)]); router.refresh(); open({ type: 'order', id: order.id }); setNotice('Order saved'); })}/>}
      </Panel>}
      {modal?.type === 'product' && isOwner && !readOnly && (
        <ProductEditorContainer product={modal.product} error={error} onClose={() => setModal(null)} onSave={product => saveProductAction(product).then(() => { router.refresh(); complete('Service saved'); }).catch(() => setError('Could not save the service. Try again.'))}/>
      )}
      {modal?.type === 'expense' && isOwner && !readOnly && (
        <ExpenseEditor key={modal.expense?.id ?? 'new'} expense={modal.expense} error={error} outlets={allOutlets} onClose={() => setModal(null)} onSave={addExpense} />
      )}
      {modal?.type === 'expenseView' && isOwner && <ExpenseDetails readOnly={readOnly} expense={modal.expense} outletName={allOutlets.find(outlet => outlet.id === modal.expense.outletId)?.displayName ?? 'Organization-wide'} onClose={() => setModal(null)} onEdit={() => open({ type: 'expense', expense: modal.expense })} onDelete={() => { setDeleteTarget(modal.expense); setModal(null); }} />}
      {modal?.type === 'employee' && isOwner && !readOnly && (
        <EmployeeEditor employee={modal.employee} outlets={allOutlets} error={error} onClose={() => setModal(null)} onSave={saveEmployee} />
      )}
    </>)}
    {passwordTarget && isOwner && !readOnly && <ResetEmployeePasswordDialog employee={passwordTarget} onClose={() => setPasswordTarget(null)} onSave={async password => { await resetEmployeePasswordAction(passwordTarget.id, password); setPasswordTarget(null); router.refresh(); setNotice('Employee password reset'); }} />}
    {deleteTarget && isOwner && !readOnly && <DeleteExpenseDialog expense={deleteTarget} onClose={() => setDeleteTarget(null)} onDelete={async () => { await deleteExpenseAction(deleteTarget.id); setDeleteTarget(null); router.refresh(); setNotice('Expense deleted'); }} />}
    {paidExpenseId && isOwner && !readOnly && <MarkExpensePaidDialog onClose={() => setPaidExpenseId(null)} onSave={async date => { await markExpensePaidAction(paidExpenseId, date); setPaidExpenseId(null); router.refresh(); setNotice('Expense marked paid'); }} />}
    {confirmation && (!readOnly || confirmation.confirmLabel === 'Log out') && <ConfirmationDialog {...confirmation} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation.onConfirm; setConfirmation(null); action(); }}/>}
    </div>
  </>;
}
