'use server';

import { requireSuperAdmin } from '@/server/auth/session';
import { listStoreInvoices } from '@/server/services/stores';
import { listStoreMembers } from '@/server/services/platform-users';
import { listOutletsForStore, listOutletsForStoreAdmin, listOutletMembershipsForStore } from '@/server/services/outlets';
import { getOrgLifecycleFacts, type OrgLifecycleFacts } from '@/server/services/store-lifecycle';
import { listStoreActivity } from '@/server/services/activity';
import { listPlans } from '@/server/services/subscription-plans';
import { prisma } from '@/server/db';
import { formatCalendarDate } from '@/server/dates';
import type { ActivityEntry, OutletListItem, PlatformActivityEntry, StoreInvoice, SubscriptionPlanListItem } from '../types';

export interface OverviewTabData {
  members: { userId: string; name: string; username: string; active: boolean; role: 'OWNER' | 'EMPLOYEE' }[];
  lifecycle: OrgLifecycleFacts | null;
  activity: ActivityEntry[];
}

export interface OutletsTabData {
  outlets: OutletListItem[];
}

export interface PeopleTabData {
  members: { userId: string; name: string; username: string; active: boolean; role: 'OWNER' | 'EMPLOYEE'; outletsGranted: string }[];
}

export interface SubscriptionTabData {
  invoices: StoreInvoice[];
  plans: SubscriptionPlanListItem[];
  hasSubscription: boolean;
  trialEndsAt?: string;
}

export interface ActivityTabData {
  entries: PlatformActivityEntry[];
}

export async function fetchStoreOverviewDataAction(storeId: string): Promise<OverviewTabData> {
  await requireSuperAdmin();
  const [members, lifecycle, activity] = await Promise.all([
    listStoreMembers(storeId),
    getOrgLifecycleFacts(storeId),
    listStoreActivity(storeId, 3),
  ]);
  return { members, lifecycle, activity };
}

export async function fetchStoreOutletsDataAction(storeId: string): Promise<OutletsTabData> {
  await requireSuperAdmin();
  const outlets = await listOutletsForStoreAdmin(storeId);
  return { outlets };
}

export async function fetchStorePeopleDataAction(storeId: string): Promise<PeopleTabData> {
  await requireSuperAdmin();
  const [members, outlets, membershipsByUser] = await Promise.all([
    listStoreMembers(storeId),
    listOutletsForStore(storeId),
    listOutletMembershipsForStore(storeId),
  ]);
  const membersWithOutlets = members.map(m => ({
    ...m,
    outletsGranted: m.role === 'OWNER' ? 'All outlets' : outlets.length === 0 ? '—' : `${(membershipsByUser[m.userId] ?? []).length} of ${outlets.length}`,
  }));
  return { members: membersWithOutlets };
}

export async function fetchStoreSubscriptionDataAction(storeId: string): Promise<SubscriptionTabData> {
  await requireSuperAdmin();
  const [invoices, plans, subscriptionRow] = await Promise.all([
    listStoreInvoices(storeId),
    listPlans(),
    prisma.subscription.findUnique({ where: { storeId }, select: { trialEndsAt: true } }),
  ]);
  return {
    invoices,
    plans: plans.filter(p => !p.archivedAt),
    hasSubscription: subscriptionRow !== null,
    trialEndsAt: subscriptionRow?.trialEndsAt ? formatCalendarDate(subscriptionRow.trialEndsAt) : undefined,
  };
}

export async function fetchStoreActivityDataAction(storeId: string): Promise<ActivityTabData> {
  await requireSuperAdmin();
  const entries = await listStoreActivity(storeId);
  return { entries };
}
