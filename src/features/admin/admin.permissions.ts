import type { AdminUser, Role, Screen, Session, Store } from './admin.types';

export const homeFor = (role: Role) => role === 'owner' ? '/admin/dashboard' : '/admin/sales';
export const canAccess = (role: Role, screen: Screen) => role === 'owner' || screen === 'orders' || screen === 'sales';

/** Browser-prototype guards only. A backend must enforce these permissions later. */
export function resolveUser(session: Session | null, store: Store | null): AdminUser | null {
  if (!session || !store) return null;
  if (session.role === 'owner') return { id: 'owner', role: 'owner', name: store.profile.name };
  const employee = store.employees.find(person => person.id === session.id && person.active && person.credentialVersion === session.credentialVersion);
  return employee ? { id: employee.id, role: 'employee', name: employee.name } : null;
}
