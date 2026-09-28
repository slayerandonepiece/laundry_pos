import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/server/db';
import type { Product } from '@/features/admin/admin.types';

const slabSchema = z.object({ limit: z.number().positive(), price: z.number().int().nonnegative() });

const productSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    category: z.string().trim().min(1),
    active: z.boolean(),
    type: z.literal('item'),
    price: z.number().int().nonnegative(),
  }),
  z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    category: z.string().trim().min(1),
    active: z.boolean(),
    type: z.literal('weight'),
    slabs: z.array(slabSchema).min(1),
    extra: z.number().int().nonnegative(),
  }),
]);

export type ProductInput = z.infer<typeof productSchema>;

type ProductRow = Awaited<ReturnType<typeof findAll>>[number];

function findAll(storeId: string) {
  return prisma.product.findMany({
    where: { storeId },
    include: { slabs: { orderBy: { limit: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
}

function toDTO(row: ProductRow): Product {
  const base = { id: row.id, name: row.name, category: row.category, active: row.active };
  if (row.type === 'ITEM') return { ...base, type: 'item', price: row.price ?? 0 };
  return {
    ...base,
    type: 'weight',
    slabs: row.slabs.map(slab => ({ limit: Number(slab.limit), price: slab.price })),
    extra: row.extra ?? 0,
  };
}

export async function listProducts(storeId: string): Promise<Product[]> {
  return unstable_cache(async () => {
    const rows = await findAll(storeId);
    return rows.map(toDTO);
  }, ['products', storeId], { tags: ['products', storeId], revalidate: 60 })();
}

export async function saveProduct(storeId: string, input: unknown): Promise<Product> {
  const data = productSchema.parse(input);

  const row = await prisma.$transaction(async tx => {
    // upsert-by-id doesn't know about storeId, so cross-tenant ownership has
    // to be checked explicitly before writing to an existing row.
    const existing = await tx.product.findUnique({ where: { id: data.id }, select: { storeId: true } });
    if (existing && existing.storeId !== storeId) throw new Error('Product not found.');

    if (data.type === 'item') {
      const saved = await tx.product.upsert({
        where: { id: data.id },
        update: { name: data.name, category: data.category, active: data.active, type: 'ITEM', price: data.price, extra: null },
        create: { id: data.id, storeId, name: data.name, category: data.category, active: data.active, type: 'ITEM', price: data.price },
      });
      await tx.productSlab.deleteMany({ where: { productId: data.id } });
      return { ...saved, slabs: [] as { limit: unknown; price: number }[] };
    }

    const saved = await tx.product.upsert({
      where: { id: data.id },
      update: { name: data.name, category: data.category, active: data.active, type: 'WEIGHT', price: null, extra: data.extra },
      create: { id: data.id, storeId, name: data.name, category: data.category, active: data.active, type: 'WEIGHT', extra: data.extra },
    });
    await tx.productSlab.deleteMany({ where: { productId: data.id } });
    await tx.productSlab.createMany({ data: data.slabs.map(slab => ({ productId: data.id, limit: slab.limit, price: slab.price })) });
    const slabs = await tx.productSlab.findMany({ where: { productId: data.id }, orderBy: { limit: 'asc' } });
    return { ...saved, slabs };
  });

  revalidateTag(storeId, { expire: 0 });
  return toDTO(row as ProductRow);
}
