'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { ValidationError } from '@/server/errors';
import {
  customerNames,
  importOrders,
  listImportBatches,
  previewOrderImport,
  undoImportBatch,
  type ImportBatchDTO,
  type OrderImportInput,
  type OrderImportPreview,
} from '@/server/services/order-import';
import { listOrganizationPaymentMethods } from '@/server/services/platform-payment-methods';

// History import is Super Admin only. Every action re-checks the session; owners and
// employees never reach it, and nothing here trusts an organization or outlet id
// without the service re-checking that it belongs together.

export interface ImportContext {
  outlets: { id: string; name: string; status: string }[];
  services: { name: string; type: 'ITEM' | 'WEIGHT' }[];
  /** Methods the organization has enabled for collecting after the order is placed. */
  methods: { id: string; name: string }[];
  batches: ImportBatchDTO[];
}

export interface ImportOrganization { id: string; name: string; orgCode: string }

/** Finds organizations by name or code, so the page needs no preloaded list. */
export async function searchImportOrganizationsAction(query: string): Promise<ImportOrganization[]> {
  await requireSuperAdmin();
  const text = query.trim().slice(0, 80);
  const rows = await prisma.store.findMany({
    where: text ? { deletedAt: null, OR: [{ name: { contains: text, mode: 'insensitive' } }, { orgCode: { contains: text } }] } : { deletedAt: null },
    orderBy: { name: 'asc' },
    take: 10,
    select: { id: true, name: true, orgCode: true },
  });
  return rows.map(row => ({ id: row.id, name: row.name, orgCode: String(row.orgCode) }));
}

export async function fetchImportContextAction(storeId: string): Promise<ImportContext> {
  await requireSuperAdmin();
  const [outlets, products, methods, batches] = await Promise.all([
    prisma.outlet.findMany({ where: { storeId }, orderBy: { createdAt: 'asc' }, select: { id: true, displayName: true, status: true } }),
    prisma.product.findMany({ where: { storeId }, orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { name: true, type: true } }),
    listOrganizationPaymentMethods(storeId),
    listImportBatches(storeId),
  ]);
  return {
    outlets: outlets.map(outlet => ({ id: outlet.id, name: outlet.displayName, status: outlet.status })),
    services: products.map(product => ({ name: product.name, type: product.type })),
    methods: methods.filter(method => method.enabled && method.stage !== 'PRE_ORDER').map(method => ({ id: method.id, name: method.name })),
    batches,
  };
}

export async function previewOrderImportAction(input: OrderImportInput): Promise<OrderImportPreview> {
  await requireSuperAdmin();
  return previewOrderImport(input);
}

export type ImportResult = { ok: true; batch: ImportBatchDTO } | { ok: false; error: string };

export async function importOrdersAction(input: OrderImportInput, idempotencyKey: string): Promise<ImportResult> {
  const session = await requireSuperAdmin();
  try {
    const batch = await importOrders(input, session.id, idempotencyKey);
    revalidatePath('/super-admin/tools/import');
    revalidatePath('/admin/sales');
    revalidatePath('/');
    return { ok: true, batch };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function undoImportBatchAction(storeId: string, batchId: string): Promise<ImportResult> {
  const session = await requireSuperAdmin();
  try {
    const batch = await undoImportBatch(storeId, batchId, session.id);
    revalidatePath('/super-admin/tools/import');
    revalidatePath('/admin/sales');
    revalidatePath('/');
    return { ok: true, batch };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Existing customer names for the sheet's numbers, so a blank name keeps what the customer already has. */
export async function lookupImportCustomerNamesAction(storeId: string, phones: string[]): Promise<Record<string, string>> {
  await requireSuperAdmin();
  return Object.fromEntries(await customerNames(storeId, phones.slice(0, 300)));
}
