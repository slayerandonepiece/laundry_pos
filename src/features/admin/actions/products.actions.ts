'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireStoreSession } from '@/server/auth/session';
import { saveProduct } from '@/server/services/products';
import type { Product } from '../admin.types';

export async function saveProductAction(product: Product): Promise<void> {
  const session = await requireStoreSession(undefined, 'OWNER');
  await saveProduct(session.storeId, product);
  revalidateTag(session.storeId, { expire: 0 });
  revalidatePath('/admin/products');
}
