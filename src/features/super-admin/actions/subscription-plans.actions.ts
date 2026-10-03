'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/server/auth/session';
import { archivePlan, changeStorePlan, createPlan, updatePlan, duplicatePlan, deletePlan, listPlanStores, type ChangeStorePlanInput } from '@/server/services/subscription-plans';
import { ValidationError } from '@/server/errors';
import { recordStoreActivity } from '@/server/services/activity';
import type { PlanInput, SubscriptionPlanListItem } from '../types';

export interface PlanActionResult {
  ok: boolean;
  error?: string;
  plan?: SubscriptionPlanListItem;
}

export async function createPlanAction(input: PlanInput): Promise<PlanActionResult> {
  await requireSuperAdmin();
  try {
    const plan = await createPlan(input);
    revalidatePath('/super-admin/subscriptions');
    return { ok: true, plan };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function updatePlanAction(planId: string, input: PlanInput): Promise<PlanActionResult> {
  await requireSuperAdmin();
  try {
    const plan = await updatePlan(planId, input);
    revalidatePath('/super-admin/subscriptions');
    revalidatePath(`/super-admin/subscriptions/${planId}`);
    return { ok: true, plan };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function duplicatePlanAction(planId: string): Promise<PlanActionResult> {
  await requireSuperAdmin();
  try {
    const plan = await duplicatePlan(planId);
    revalidatePath('/super-admin/subscriptions');
    return { ok: true, plan };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export interface DeletePlanResult {
  ok: boolean;
  error?: string;
}

export async function deletePlanAction(planId: string): Promise<DeletePlanResult> {
  await requireSuperAdmin();
  try {
    await deletePlan(planId);
    revalidatePath('/super-admin/subscriptions');
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function listPlanStoresAction(planId: string): Promise<{ id: string; name: string; ownerName: string }[]> {
  await requireSuperAdmin();
  return listPlanStores(planId);
}

export interface ArchivePlanResult {
  ok: boolean;
  error?: string;
}

export async function archivePlanAction(planId: string, reassignToPlanId?: string): Promise<ArchivePlanResult> {
  await requireSuperAdmin();
  try {
    await archivePlan(planId, reassignToPlanId);
    revalidatePath('/super-admin/subscriptions');
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export interface ChangeStorePlanResult {
  ok: boolean;
  error?: string;
}

export async function changeStorePlanAction(storeId: string, input: ChangeStorePlanInput): Promise<ChangeStorePlanResult> {
  const session = await requireSuperAdmin();
  try {
    await changeStorePlan(storeId, input);
    await recordStoreActivity({ storeId, actorId: session.id, action: 'CHANGE_SUBSCRIPTION_PLAN', entityType: 'Subscription', entityId: storeId, after: { planId: input.planId, depositAmount: input.depositAmount ?? null, annualFeeAmount: input.annualFeeAmount ?? null, discountAmount: input.discountAmount ?? null } });
    revalidatePath('/super-admin/subscriptions');
    revalidatePath(`/super-admin/stores/${storeId}`);
    revalidatePath(`/super-admin/stores/${storeId}/subscription`);
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
