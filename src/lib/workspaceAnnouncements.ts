export interface WorkspaceAnnouncement {
  id: string;
  revision: number;
  message: string;
  audience: 'store' | 'platform' | 'all';
  tone: 'info' | 'warning';
  storeIds: string[];
  published: boolean;
  action?: { href: string; label: string };
}
