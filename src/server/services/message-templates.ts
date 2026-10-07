import 'server-only';

import { unstable_cache, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { ValidationError } from '@/server/errors';

export const MESSAGE_STATUS_KEYS = ['PENDING', 'IN_PROGRESS', 'READY', 'DELIVERED'] as const;
export type MessageStatusKey = (typeof MESSAGE_STATUS_KEYS)[number];
export type MessageAttachment = 'NONE' | 'ORDER_SLIP_PDF' | 'INVOICE_PDF';

export const MESSAGE_STATUS_LABELS: Record<MessageStatusKey, string> = {
  PENDING: 'Placed',
  IN_PROGRESS: 'In progress',
  READY: 'Ready',
  DELIVERED: 'Delivered',
};

export const ALLOWED_MESSAGE_PLACEHOLDERS = [
  'customer',
  'store',
  'outlet',
  'orderNo',
  'total',
  'due',
  'date',
  'dueDate',
  'method',
  'invoiceNo',
  'link',
] as const;

export const MAX_MESSAGE_TEMPLATE_LENGTH = 1000;

const statusSchema = z.enum(MESSAGE_STATUS_KEYS);
const attachmentSchema = z.enum(['NONE', 'ORDER_SLIP_PDF', 'INVOICE_PDF']);
const bodySchema = z.string().trim().min(1, 'Message body is required.').max(
  MAX_MESSAGE_TEMPLATE_LENGTH,
  `Message body must be ${MAX_MESSAGE_TEMPLATE_LENGTH} characters or fewer.`,
);

export interface PlatformMessageTemplateDTO {
  id: string;
  statusKey: MessageStatusKey;
  body: string;
  defaultEnabled: boolean;
  defaultAttachment: MessageAttachment;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMessageTemplateDTO {
  id?: string;
  statusKey: MessageStatusKey;
  body: string;
  enabled: boolean;
  attachment: MessageAttachment;
  inherited: boolean;
  defaultBody: string;
  defaultEnabled: boolean;
  defaultAttachment: MessageAttachment;
  updatedAt?: string;
  defaultUpdatedAt: string;
}

export interface MessageTemplateInput {
  statusKey: MessageStatusKey;
  body: string;
  enabled: boolean;
  attachment: MessageAttachment;
}

export function validateMessageTemplate(statusKey: MessageStatusKey, bodyInput: string): string {
  const status = statusSchema.parse(statusKey);
  const body = bodySchema.parse(bodyInput);
  const allowed = new Set<string>(ALLOWED_MESSAGE_PLACEHOLDERS);
  const placeholders = [...body.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]);
  const unknown = [...new Set(placeholders.filter(name => !allowed.has(name)))];
  if (unknown.length) {
    throw new ValidationError(`Unknown placeholder${unknown.length === 1 ? '' : 's'}: ${unknown.map(name => `{${name}}`).join(', ')}.`);
  }
  if ((status === 'READY' || status === 'DELIVERED') && !placeholders.includes('link')) {
    throw new ValidationError(`${MESSAGE_STATUS_LABELS[status]} messages must include {link}.`);
  }
  return body;
}

function toPlatformDTO(row: {
  id: string;
  statusKey: MessageStatusKey;
  body: string;
  defaultEnabled: boolean;
  defaultAttachment: MessageAttachment;
  createdAt: Date;
  updatedAt: Date;
}): PlatformMessageTemplateDTO {
  return row;
}

export const listPlatformMessageTemplates = unstable_cache(
  async (): Promise<PlatformMessageTemplateDTO[]> => {
    const rows = await prisma.platformMessageTemplate.findMany();
    const byStatus = new Map(rows.map(row => [row.statusKey, row]));
    return MESSAGE_STATUS_KEYS.flatMap(status => {
      const row = byStatus.get(status);
      return row ? [toPlatformDTO(row)] : [];
    });
  },
  ['platform-message-templates'],
  { revalidate: 60, tags: ['platform-message-templates'] },
);

export async function savePlatformMessageTemplate(
  statusKey: MessageStatusKey,
  input: { body: string; defaultEnabled: boolean; defaultAttachment: MessageAttachment },
): Promise<PlatformMessageTemplateDTO> {
  const status = statusSchema.parse(statusKey);
  const body = validateMessageTemplate(status, input.body);
  const defaultAttachment = attachmentSchema.parse(input.defaultAttachment);
  const row = await prisma.platformMessageTemplate.upsert({
    where: { statusKey: status },
    create: { statusKey: status, body, defaultEnabled: input.defaultEnabled, defaultAttachment },
    update: { body, defaultEnabled: input.defaultEnabled, defaultAttachment },
  });
  revalidateTag('platform-message-templates', { expire: 0 });
  return toPlatformDTO(row);
}

export async function listOrganizationMessageTemplates(
  storeId: string,
): Promise<OrganizationMessageTemplateDTO[]> {
  const [defaults, overrides] = await Promise.all([
    prisma.platformMessageTemplate.findMany(),
    prisma.organizationMessageTemplate.findMany({ where: { storeId } }),
  ]);
  const defaultByStatus = new Map(defaults.map(row => [row.statusKey, row]));
  const overrideByStatus = new Map(overrides.map(row => [row.statusKey, row]));
  return MESSAGE_STATUS_KEYS.flatMap(statusKey => {
    const fallback = defaultByStatus.get(statusKey);
    if (!fallback) return [];
    const override = overrideByStatus.get(statusKey);
    return [{
      id: override?.id,
      statusKey,
      body: override?.body ?? fallback.body,
      enabled: override?.enabled ?? fallback.defaultEnabled,
      attachment: override?.attachment ?? fallback.defaultAttachment,
      inherited: !override,
      defaultBody: fallback.body,
      defaultEnabled: fallback.defaultEnabled,
      defaultAttachment: fallback.defaultAttachment,
      updatedAt: override?.updatedAt.toISOString(),
      defaultUpdatedAt: fallback.updatedAt.toISOString(),
    }];
  });
}

export async function saveOrganizationMessageTemplates(
  storeId: string,
  inputs: MessageTemplateInput[],
  updatedById: string,
): Promise<OrganizationMessageTemplateDTO[]> {
  const seen = new Set<MessageStatusKey>();
  const parsed = inputs.map(input => {
    const statusKey = statusSchema.parse(input.statusKey);
    if (seen.has(statusKey)) throw new ValidationError(`Duplicate ${MESSAGE_STATUS_LABELS[statusKey]} template.`);
    seen.add(statusKey);
    return {
      statusKey,
      body: validateMessageTemplate(statusKey, input.body),
      enabled: z.boolean().parse(input.enabled),
      attachment: attachmentSchema.parse(input.attachment),
    };
  });
  if (parsed.length !== MESSAGE_STATUS_KEYS.length || MESSAGE_STATUS_KEYS.some(status => !seen.has(status))) {
    throw new ValidationError('Save one template for every order status.');
  }

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw new ValidationError('Organization not found.');

  // An organization row exists only for wording that differs from the platform
  // default; a status saved as the default is left (or put back) to inherit it,
  // so later platform edits still reach it.
  const defaults = new Map((await prisma.platformMessageTemplate.findMany()).map(row => [row.statusKey, row]));
  await prisma.$transaction(parsed.map(template => {
    const fallback = defaults.get(template.statusKey);
    const matchesDefault = !!fallback && fallback.body === template.body
      && fallback.defaultEnabled === template.enabled && fallback.defaultAttachment === template.attachment;
    if (matchesDefault) return prisma.organizationMessageTemplate.deleteMany({ where: { storeId, statusKey: template.statusKey } });
    return prisma.organizationMessageTemplate.upsert({
      where: { storeId_statusKey: { storeId, statusKey: template.statusKey } },
      create: { storeId, updatedById, ...template },
      update: { updatedById, body: template.body, enabled: template.enabled, attachment: template.attachment },
    });
  }));
  return listOrganizationMessageTemplates(storeId);
}

export async function restoreOrganizationMessageTemplate(
  storeId: string,
  statusKey: MessageStatusKey,
): Promise<void> {
  const status = statusSchema.parse(statusKey);
  await prisma.organizationMessageTemplate.deleteMany({ where: { storeId, statusKey: status } });
}
