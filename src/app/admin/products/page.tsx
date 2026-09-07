import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listProducts } from '@/server/services/products';
import { requireSession, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverProducts: Awaited<ReturnType<typeof listProducts>> = [];
  try {
    await requireSession('OWNER');
    serverProducts = await listProducts();
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="products" serverProducts={serverProducts} />;
}
