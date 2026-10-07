'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';
import { recordStoreActivity } from '@/server/services/activity';
import {
  saveOrganizationPaymentConfig,
  type OrganizationPaymentConfigInput,
  type OrganizationPaymentMethodDTO,
} from '@/server/services/platform-payment-methods';
import {
  restoreOrganizationMessageTemplate,
  saveOrganizationMessageTemplates,
  savePlatformMessageTemplate,
  type MessageAttachment,
  type MessageStatusKey,
  type MessageTemplateInput,
  type OrganizationMessageTemplateDTO,
  type PlatformMessageTemplateDTO,
} from '@/server/services/message-templates';

export interface SavePaymentsResult {
  ok: boolean;
  error?: string;
  methods?: OrganizationPaymentMethodDTO[];
}

export interface SaveMessagesResult {
  ok: boolean;
  error?: string;
  templates?: OrganizationMessageTemplateDTO[];
}

export interface SavePlatformMessageResult {
  ok: boolean;
  error?: string;
  template?: PlatformMessageTemplateDTO;
}

function refresh(storeId: string) {
  revalidatePath(`/super-admin/stores/${storeId}`);
  revalidatePath(`/super-admin/stores/${storeId}/payments`);
  revalidatePath(`/super-admin/stores/${storeId}/messages`);
  revalidatePath(`/super-admin/stores/${storeId}/activity`);
  revalidatePath('/admin/profile');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/sales');
}

export async function saveOrganizationPaymentsAction(storeId: string, items: OrganizationPaymentConfigInput[]): Promise<SavePaymentsResult> {
  const session = await requireSuperAdmin();
  try {
    const methods = await saveOrganizationPaymentConfig(storeId, items);
    await recordStoreActivity({
      storeId,
      actorId: session.id,
      action: 'UPDATE_ORGANIZATION_PAYMENT_METHODS',
      entityType: 'Store',
      entityId: storeId,
      after: { methods: methods.map(method => ({ code: method.code, enabled: method.enabled })) },
    });
    refresh(storeId);
    return { ok: true, methods };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function saveOrganizationMessagesAction(storeId: string, inputs: MessageTemplateInput[]): Promise<SaveMessagesResult> {
  const session = await requireSuperAdmin();
  try {
    const templates = await saveOrganizationMessageTemplates(storeId, inputs, session.id);
    await recordStoreActivity({
      storeId,
      actorId: session.id,
      action: 'UPDATE_ORGANIZATION_MESSAGE_TEMPLATES',
      entityType: 'Store',
      entityId: storeId,
      after: { templates: templates.map(template => ({ status: template.statusKey, enabled: template.enabled, attachment: template.attachment })) },
    });
    refresh(storeId);
    return { ok: true, templates };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function restoreOrganizationMessageAction(storeId: string, statusKey: MessageStatusKey): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSuperAdmin();
  try {
    await restoreOrganizationMessageTemplate(storeId, statusKey);
    await recordStoreActivity({
      storeId,
      actorId: session.id,
      action: 'RESTORE_ORGANIZATION_MESSAGE_TEMPLATE',
      entityType: 'Store',
      entityId: storeId,
      after: { status: statusKey },
    });
    refresh(storeId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function savePlatformMessageAction(
  statusKey: MessageStatusKey,
  input: { body: string; defaultEnabled: boolean; defaultAttachment: MessageAttachment },
): Promise<SavePlatformMessageResult> {
  const session = await requireSuperAdmin();
  try {
    const template = await savePlatformMessageTemplate(statusKey, input);
    await recordStoreActivity({
      actorId: session.id,
      action: 'UPDATE_PLATFORM_MESSAGE_TEMPLATE',
      entityType: 'PlatformMessageTemplate',
      entityId: statusKey,
      after: { status: statusKey, defaultEnabled: template.defaultEnabled, defaultAttachment: template.defaultAttachment },
    });
    revalidatePath('/super-admin/message-templates');
    return { ok: true, template };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
