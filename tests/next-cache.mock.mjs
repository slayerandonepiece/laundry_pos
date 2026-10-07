import { mock } from 'node:test';

// Service integration tests run outside a Next.js request. Keep database reads
// live and stub only the framework cache boundary, never Prisma or auth.
const cache = {
  unstable_cache: callback => callback,
  revalidateTag: mock.fn(),
  revalidatePath: mock.fn(),
};
mock.module('next/cache', { namedExports: cache, defaultExport: cache });
