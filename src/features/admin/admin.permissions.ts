import type { AdminUser, Role, Screen, Session } from './admin.types';

export const homeFor = (role: Role) => role === 'owner' ? '/' : '/admin/sales';
export const canAccess = (role: Role, screen: Screen) => role === 'owner' || screen === 'orders' || screen === 'sales';

// Session identity comes from the server (loginAction) and always carries a
// name for a real account; client-side routing/display is purely a mirror of
// that server-verified session, never the source of truth for authorization.
export function resolveUser(session: Session | null): AdminUser | null {
  if (!session || !session.name) return null;
  return { id: session.id, role: session.role, name: session.name };
}
