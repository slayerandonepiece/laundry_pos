'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/server/auth/session';
import { saveProduct } from '@/server/services/products';
import type { Product } from '../admin.types';

export async function saveProductAction(product: Product): Promise<void> {
  await requireSession('OWNER');
  await saveProduct(product);
  revalidatePath('/admin/products');
}
