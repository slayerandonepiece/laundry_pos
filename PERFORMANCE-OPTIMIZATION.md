# Backend performance changes — 2026-09-26

These diffs compare against the working tree at the start of this request, preserving earlier phone-login and UI work. No repository test files or seed code were changed.

## Requested optimizations

| # | Outcome | Files |
|---|---|---|
| 1 | Added and deployed five indexes to the configured dev Neon database. Added the omitted composite customer lookup index on storeId, phone, orderDate as well as the four explicitly listed indexes. | prisma/schema.prisma; prisma/migrations/20260926220000_add_perf_indexes/migration.sql |
| 2 | All three session lookups select only session identifiers/expiry/version and required user identity/validation fields. Validation logic is unchanged. | src/server/auth/session.ts |
| 3 | Narrowed owner projections in directory/detail, exact owner lookup, and member directory. The member function is in platform-users.ts in this checkout. | src/server/services/stores.ts; src/server/services/platform-users.ts |
| 4 | List queries omit the per-event byUser include and load unique actor IDs/names once. Actor names remain available because the web detail panel opens list data directly. Full detail/sync/mutation queries select only actor name from the relation. | src/server/services/orders.ts |
| 5 | Cached listStores for 60 seconds with the stores tag. Immediate invalidation covers onboarding, organization edits/status/archive, subscription payments/trials/plan changes, plan edits, outlet creation, owner profile, and shared user/employee identity changes. Authorization continues to use live session/membership reads. | src/server/services/stores.ts; subscription-plans.ts; platform-users.ts; employees.ts; outlets.ts; profile.ts under src/server/services/ |
| 6 | Used the explicitly permitted alternative: retained the existing synchronous Map throttle and documented that attempts are isolated to each warm serverless instance. No shared database throttle or cross-process protection is claimed. | src/server/auth/throttle.ts |
| 7 | Added the requested server external packages, explicit compression, and disabled the powered-by header. | next.config.ts |
| 8 | Successful GET products/payment-methods responses opt into private max-age=30. Vary includes credentials and store/outlet selection. Mutations/errors/other routes keep no-store. | src/server/api/handler.ts; src/app/api/v1/products/route.ts; src/app/api/v1/payment-methods/route.ts |
| 9 | Set the supported project-level regions setting to sin1, covering server components/actions as well as API routes. Both locally configured Neon connection URLs identify ap-southeast-1; credentials and full URLs are omitted. | vercel.json |
| 10 | Preserved unlimited default results. A silent 200-row cap would hide historical search results and change aggregates; full pagination needs separate work. Existing explicit limits remain honored. | src/server/services/orders.ts; web pages unchanged |

## Validation

- npx tsc --noEmit: passes.
- npm run lint: zero errors; the same two existing unused-variable warnings in scripts/qa_audit.mjs.
- npm run build: passes in an isolated temporary copy, preserving the running dev server output.
- npm run test:subscription-payments: all 74 existing integration tests pass, unchanged.
- Temporary disposable-Postgres harness: passes cache-hit/invalidation behavior at a simulated framework cache boundary, owner-name/last-invoice/outlet-count refresh, complete 201-order results, actor-name fidelity, explicit limits, and GET/error/mutation cache headers.
- Prisma schema validation and diff hygiene pass.
- Index migration contains only CREATE INDEX statements. Generated using Prisma's schema-to-schema migrate diff against the starting schema, so it contains no unrelated pending-schema changes. Dev preflight verified prior migrations were already applied, valid unique personal phones, and only this index migration pending; prisma migrate deploy applied it successfully.
- Test files were verified byte-for-byte unchanged from the starting snapshot.

## Limits

No production deployment or production database migration was performed. No latency benchmark is claimed. Boolean indexes do not accelerate session primary-key lookup by themselves; the session payload projection is the relevant optimization there. The in-memory throttle still does not share attempts across instances. Private client caching allows these two catalogue responses to remain fresh for 30 seconds without another server request. The cache harness verifies service invalidation with a simulated boundary, not Vercel's deployed Data Cache.

## Configuration references

Vercel supports the project-level regions setting and identifies Singapore as sin1: [function regions](https://vercel.com/docs/functions/configuring-functions/region), [region list](https://vercel.com/docs/regions). Next.js cache and external-package APIs were verified against the installed Next.js 16.3.4 documentation in node_modules/next/dist/docs.

## Exact before/after diffs

The patch below contains only changes from this request; paths are relative to /Users/reddygona/Documents/skills/laundry_pos. Minus lines are the old code; plus lines are the new code. The complete standalone patch is PERFORMANCE-OPTIMIZATION.patch.

### prisma/schema.prisma

```diff
--- a/prisma/schema.prisma
+++ b/prisma/schema.prisma
@@ -89,6 +89,8 @@
   createdOutlets    Outlet[]              @relation("OutletCreatedBy")
   auditLogs         AuditLog[]

+  @@index([active])
+  @@index([isSuperAdmin])
   @@map("users")
 }

@@ -143,6 +145,7 @@
   dailyOutletSummaries        DailyOutletSummary[]
   dailyOutletServiceSummaries DailyOutletServiceSummary[]

+  @@index([deletedAt])
   @@map("stores")
 }

@@ -310,6 +313,8 @@
   @@index([outletId, dueDate])
   @@unique([storeId, offlineId])
   @@index([orderDate])
+  @@index([updatedAt])
+  @@index([storeId, phone, orderDate])
   @@map("orders")
 }

```

### src/server/auth/session.ts

```diff
--- a/src/server/auth/session.ts
+++ b/src/server/auth/session.ts
@@ -95,7 +95,16 @@

 export async function getSessionFromToken(token: string): Promise<SessionUser | null> {
   if (!isValidSessionToken(token)) return null;
-  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
+  const session = await prisma.session.findUnique({
+    where: { token },
+    select: {
+      id: true,
+      token: true,
+      credentialVersion: true,
+      expiresAt: true,
+      user: { select: { id: true, name: true, phone: true, isSuperAdmin: true, active: true, credentialVersion: true } },
+    },
+  });
   if (!session) return null;
   if (session.expiresAt < new Date()) return null;
   if (!session.user.active) return null;
@@ -116,7 +125,16 @@
   }
   if (!sessionId) return null;

-  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
+  const session = await prisma.session.findUnique({
+    where: { id: sessionId },
+    select: {
+      id: true,
+      token: true,
+      credentialVersion: true,
+      expiresAt: true,
+      user: { select: { id: true, name: true, phone: true, isSuperAdmin: true, active: true, credentialVersion: true } },
+    },
+  });
   if (!session) return null;
   if (session.expiresAt < new Date()) return null;
   if (!session.user.active) return null;
@@ -137,7 +155,16 @@
     const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
     const sessionId = match ? decodeURIComponent(match[1]) : null;
     if (sessionId) {
-      const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
+      const session = await prisma.session.findUnique({
+        where: { id: sessionId },
+        select: {
+          id: true,
+          token: true,
+          credentialVersion: true,
+          expiresAt: true,
+          user: { select: { id: true, name: true, phone: true, isSuperAdmin: true, active: true, credentialVersion: true } },
+        },
+      });
       if (!session) return null;
       if (session.expiresAt < new Date()) return null;
       if (!session.user.active) return null;
```

### src/server/auth/throttle.ts

```diff
--- a/src/server/auth/throttle.ts
+++ b/src/server/auth/throttle.ts
@@ -11,6 +11,7 @@
 const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
 const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

+// This throttle is limited to one warm serverless instance; attempts are not shared across instances.
 const attempts = new Map<string, AttemptRecord>();

 // Cleanup stale entries every 10 minutes
```

### src/server/services/stores.ts

```diff
--- a/src/server/services/stores.ts
+++ b/src/server/services/stores.ts
@@ -1,7 +1,7 @@
 import 'server-only';
 import { normalizePhone, isValidPhone } from '@/lib/contactValidation';
 import { z } from 'zod';
-import { revalidateTag } from 'next/cache';
+import { unstable_cache, revalidateTag } from 'next/cache';
 import { prisma } from '@/server/db';
 import { hashPassword } from '@/server/auth/password';
 import { parseCalendarDate, formatCalendarDate, todayIST } from '@/server/dates';
@@ -19,7 +19,7 @@
     where: { deletedAt: null },
     include: {
       subscription: { include: { plan: true } },
-      memberships: { where: { role: 'OWNER' }, include: { user: true }, orderBy: { createdAt: 'asc' } },
+      memberships: { where: { role: 'OWNER' }, select: { user: { select: { id: true, name: true, phone: true, email: true } } }, orderBy: { createdAt: 'asc' } },
       _count: { select: { outlets: true } },
     },
     orderBy: { onboardedAt: 'desc' },
@@ -79,7 +79,7 @@
     email: row.email,
     ownerId: owner?.id,
     ownerName: owner?.name ?? '—',
-        ownerEmail: owner?.email ?? undefined,
+    ownerEmail: owner?.email ?? undefined,
     ownerPhone: owner?.phone ?? undefined,
     planName: row.subscription?.plan?.name,
     depositAmount: row.subscription?.depositAmount ?? 0,
@@ -94,7 +94,7 @@
   };
 }

-export async function listStores(): Promise<StoreListItem[]> {
+export const listStores = unstable_cache(async (): Promise<StoreListItem[]> => {
   const today = todayIST();
   const rows = await findAllStores();

@@ -111,7 +111,7 @@
   for (const p of payments) if (!lastInvoiceByStore.has(p.storeId)) lastInvoiceByStore.set(p.storeId, p);

   return rows.map(row => toDTO(row, today, lastInvoiceByStore.get(row.id)));
-}
+}, ['stores'], { tags: ['stores'], revalidate: 60 });

 export async function getStore(storeId: string): Promise<StoreDetail | null> {
   const today = todayIST();
@@ -119,7 +119,7 @@
     where: { id: storeId },
     include: {
       subscription: { include: { plan: true } },
-      memberships: { where: { role: 'OWNER' }, include: { user: true }, orderBy: { createdAt: 'asc' } },
+      memberships: { where: { role: 'OWNER' }, select: { user: { select: { id: true, name: true, phone: true, email: true } } }, orderBy: { createdAt: 'asc' } },
       _count: { select: { outlets: true } },
     },
   });
@@ -164,6 +164,7 @@
   const existing = await prisma.store.findUnique({ where: { id: storeId } });
   if (!existing) throw new ValidationError('Store not found.');
   await prisma.store.update({ where: { id: storeId }, data });
+  revalidateTag('stores', { expire: 0 });
   const store = await getStore(storeId);
   if (!store) throw new Error('Store not found after update.');
   return store;
@@ -173,6 +174,7 @@
   const existing = await prisma.store.findUnique({ where: { id: storeId } });
   if (!existing) throw new ValidationError('Store not found.');
   await prisma.store.update({ where: { id: storeId }, data: { status } });
+  revalidateTag('stores', { expire: 0 });
   const store = await getStore(storeId);
   if (!store) throw new Error('Store not found after update.');
   return store;
@@ -183,6 +185,7 @@
   if (!existing || existing.deletedAt) throw new ValidationError('Store not found.');
   if (confirmName.trim() !== existing.name) throw new ValidationError('Type the store name exactly to confirm.');
   await prisma.store.update({ where: { id: storeId }, data: { deletedAt: new Date() } });
+  revalidateTag('stores', { expire: 0 });
 }

 export async function lookupOwnerByPhone(phone: string): Promise<OwnerLookupResult | null> {
@@ -190,7 +193,7 @@
   if (!isValidPhone(normalized)) return null;
   const user = await prisma.user.findUnique({
     where: { phone: normalized },
-    include: { memberships: { where: { store: { deletedAt: null } }, include: { store: { select: { name: true } } } } },
+    select: { id: true, name: true, phone: true, isSuperAdmin: true, memberships: { where: { store: { deletedAt: null } }, select: { store: { select: { name: true } } } } },
   });
   if (!user || user.isSuperAdmin) return null;
   return { id: user.id, name: user.name, phone: user.phone, storeCount: user.memberships.length, storeNames: user.memberships.map(m => m.store.name) };
@@ -324,6 +327,7 @@
   });

   revalidateTag('plans', { expire: 0 });
+  revalidateTag('stores', { expire: 0 });
   const rows = await findAllStores();
   const row = rows.find(r => r.id === storeId);
   if (!row) throw new Error('Store not found after creation.');
@@ -378,6 +382,7 @@
     });
   });

+  revalidateTag('stores', { expire: 0 });
   return {
     invoiceSeq: result.invoiceSeq,
     storeId,
@@ -487,6 +492,7 @@
     update: { trialStartsAt: parsedStart ?? null, trialEndsAt: parsedEnd },
   });

+  revalidateTag('stores', { expire: 0 });
   return { storeId, trialEndsAt, trialStartsAt };
 }

```

### src/server/services/orders.ts

```diff
--- a/src/server/services/orders.ts
+++ b/src/server/services/orders.ts
@@ -69,15 +69,23 @@
     .optional(),
 });

+const includeForList = {
+  lines: true,
+  payments: { orderBy: { paidAt: "asc" } },
+  statusEvents: { orderBy: { at: "asc" } },
+} satisfies Prisma.OrderInclude;
+
 const includeForDTO = {
   lines: true,
   payments: { orderBy: { paidAt: "asc" } },
-  statusEvents: { orderBy: { at: "asc" }, include: { byUser: true } },
+  statusEvents: { orderBy: { at: "asc" }, include: { byUser: { select: { name: true } } } },
 } satisfies Prisma.OrderInclude;

 type OrderRow = Prisma.OrderGetPayload<{ include: typeof includeForDTO }>;

-function toOrderDTO(row: OrderRow): Order {
+type OrderListRow = Prisma.OrderGetPayload<{ include: typeof includeForList }>;
+
+function toOrderDTO(row: OrderRow | OrderListRow, actorNames?: Map<string, string>): Order {
   return {
     id: toOrderCode(row.orderNumber),
     offlineId: row.offlineId ?? undefined,
@@ -108,7 +116,7 @@
     history: row.statusEvents.map((event) => ({
       status: STATUS_FROM_DB[event.status],
       at: event.at.toISOString(),
-      by: event.byUser?.name ?? "System",
+      by: ("byUser" in event ? event.byUser?.name : actorNames?.get(event.byUserId ?? "")) ?? "System",
     })),
   };
 }
@@ -129,11 +137,14 @@
       legacyCancelled: false,
       ...(options?.outletId ? { outletId: options.outletId } : {}),
     },
-    include: includeForDTO,
+    include: includeForList,
     orderBy: { orderNumber: "desc" },
     ...(options?.limit ? { take: options.limit } : {}),
   });
-  return rows.map(toOrderDTO);
+  const actorIds = [...new Set(rows.flatMap(row => row.statusEvents.flatMap(event => event.byUserId ? [event.byUserId] : [])))];
+  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
+  const actorNames = new Map(actors.map(actor => [actor.id, actor.name]));
+  return rows.map(row => toOrderDTO(row, actorNames));
 }

 /**
```

### src/server/services/platform-users.ts

```diff
--- a/src/server/services/platform-users.ts
+++ b/src/server/services/platform-users.ts
@@ -2,6 +2,7 @@
 import { normalizePhone, isValidPhone } from '@/lib/contactValidation';
 import crypto from 'node:crypto';
 import { z } from 'zod';
+import { revalidateTag } from 'next/cache';
 import { prisma } from '@/server/db';
 import { hashPassword } from '@/server/auth/password';
 import { revokeAllSessionsForUser } from '@/server/auth/session';
@@ -35,7 +36,7 @@
 export async function listStoreMembers(storeId: string): Promise<{ userId: string; name: string; phone: string; active: boolean; role: 'OWNER' | 'EMPLOYEE' }[]> {
   const rows = await prisma.storeMembership.findMany({
     where: { storeId },
-    include: { user: true },
+    select: { userId: true, active: true, role: true, user: { select: { name: true, phone: true } } },
     orderBy: { createdAt: 'asc' },
   });
   // active here is the per-store StoreMembership flag (see Item 1 in
@@ -101,6 +102,7 @@
     return user.id;
   });

+  revalidateTag('stores', { expire: 0 });
   const created = await getUser(userId);
   if (!created) throw new Error('User not found after creation.');
   return created;
@@ -147,6 +149,7 @@
   });

   if (phoneChanged) await revokeAllSessionsForUser(userId);
+  revalidateTag('stores', { expire: 0 });
   const updated = await getUser(userId);
   if (!updated) throw new Error('User not found after update.');
   return updated;
@@ -179,6 +182,7 @@
   if (!existing) throw new ValidationError('User not found.');
   await prisma.user.update({ where: { id: userId }, data: { active, credentialVersion: { increment: 1 } } });
   await revokeAllSessionsForUser(userId);
+  revalidateTag('stores', { expire: 0 });
   const updated = await getUser(userId);
   if (!updated) throw new Error('User not found after update.');
   return updated;
```

### src/server/services/subscription-plans.ts

```diff
--- a/src/server/services/subscription-plans.ts
+++ b/src/server/services/subscription-plans.ts
@@ -91,6 +91,7 @@
   const data = { ...parsed.data, depositAmount: parsed.data.depositWaivedByDefault ? 0 : parsed.data.depositAmount };
   const row = await prisma.subscriptionPlan.create({ data, include: { _count: { select: { subscriptions: true } } } });
   revalidateTag('plans', { expire: 0 });
+  revalidateTag('stores', { expire: 0 });
   return toDTO(row);
 }

@@ -102,6 +103,7 @@
   if (!existing || existing.archivedAt) throw new ValidationError('Plan not found.');
   const row = await prisma.subscriptionPlan.update({ where: { id: planId }, data, include: { _count: { select: { subscriptions: true } } } });
   revalidateTag('plans', { expire: 0 });
+  revalidateTag('stores', { expire: 0 });
   return toDTO(row);
 }

@@ -122,6 +124,7 @@
     include: { _count: { select: { subscriptions: true } } },
   });
   revalidateTag('plans', { expire: 0 });
+  revalidateTag('stores', { expire: 0 });
   return toDTO(row);
 }

@@ -134,6 +137,7 @@
   if (existing._count.subscriptions > 0) throw new ValidationError('Move every store off this plan before deleting it.');
   await prisma.subscriptionPlan.delete({ where: { id: planId } });
   revalidateTag('plans', { expire: 0 });
+  revalidateTag('stores', { expire: 0 });
 }

 export async function archivePlan(planId: string, reassignToPlanId?: string): Promise<void> {
@@ -156,6 +160,7 @@
     await tx.subscriptionPlan.update({ where: { id: planId }, data: { archivedAt: new Date() } });
   });
   revalidateTag('plans', { expire: 0 });
+  revalidateTag('stores', { expire: 0 });
 }

 const changeStorePlanSchema = z.object({
@@ -205,4 +210,5 @@
     },
   });
   revalidateTag('plans', { expire: 0 });
-}
+  revalidateTag('stores', { expire: 0 });
+}
```

### src/server/services/outlets.ts

```diff
--- a/src/server/services/outlets.ts
+++ b/src/server/services/outlets.ts
@@ -1,4 +1,5 @@
 import 'server-only';
+import { revalidateTag } from 'next/cache';
 import { hasCurrentAccess } from '@/lib/subscriptionAccess';
 import { isValidPhone } from '@/lib/contactValidation';
 import { todayIST, formatCalendarDate } from '@/server/dates';
@@ -59,6 +60,7 @@
     },
   });

+  revalidateTag('stores', { expire: 0 });
   return outlet;
 }

```

### src/server/services/profile.ts

```diff
--- a/src/server/services/profile.ts
+++ b/src/server/services/profile.ts
@@ -1,4 +1,5 @@
 import 'server-only';
+import { revalidateTag } from 'next/cache';
 import { isValidPhone } from '@/lib/contactValidation';
 import { z } from 'zod';
 import { prisma } from '@/server/db';
@@ -44,6 +45,7 @@
     // Keep the owner's login display name in sync with the profile name shown in the UI.
     prisma.user.update({ where: { id: ownerId }, data: { name: data.name } }),
   ]);
+  revalidateTag('stores', { expire: 0 });
   return toDTO(store, data.name);
 }

```

### src/server/api/handler.ts

```diff
--- a/src/server/api/handler.ts
+++ b/src/server/api/handler.ts
@@ -134,10 +134,18 @@
   return requireOutletSession(storeId, outletId, role, session, options);
 }

-export async function handleApiRoute(handler: () => Promise<Response>): Promise<Response> {
+export async function handleApiRoute(
+  handler: () => Promise<Response>,
+  options?: { request: Request; cacheTtlSeconds: number },
+): Promise<Response> {
   try {
     const res = await handler();
-    if (!res.headers.has('Cache-Control')) {
+    if (options?.request.method === 'GET' && res.ok && Number.isSafeInteger(options.cacheTtlSeconds) && options.cacheTtlSeconds > 0) {
+      res.headers.set('Cache-Control', `private, max-age=${options.cacheTtlSeconds}`);
+      const vary = new Set((res.headers.get('Vary') ?? '').split(',').map(value => value.trim()).filter(Boolean));
+      for (const header of ['Authorization', 'Cookie', 'X-Store-Id', 'X-Outlet-Id']) vary.add(header);
+      res.headers.set('Vary', [...vary].join(', '));
+    } else if (!res.headers.has('Cache-Control')) {
       res.headers.set('Cache-Control', 'private, no-store');
     }
     return res;
```

### src/app/api/v1/products/route.ts

```diff
--- a/src/app/api/v1/products/route.ts
+++ b/src/app/api/v1/products/route.ts
@@ -9,7 +9,7 @@
     const session = await requireApiStoreSession(req);
     const products = await listProducts(session.storeId);
     return jsonResponse(products);
-  });
+  }, { request: req, cacheTtlSeconds: 30 });
 }

 export async function POST(req: NextRequest) {
```

### src/app/api/v1/payment-methods/route.ts

```diff
--- a/src/app/api/v1/payment-methods/route.ts
+++ b/src/app/api/v1/payment-methods/route.ts
@@ -18,7 +18,7 @@
     const includeDisabled = searchParams.get('all') === 'true';
     const methods = await listOrganizationPaymentMethods(session.storeId);
     return jsonResponse(includeDisabled ? methods : methods.filter(method => method.enabled));
-  });
+  }, { request: req, cacheTtlSeconds: 30 });
 }

 // The global catalogue is Super Admin territory; an owner only enables or
```

### next.config.ts

```diff
--- a/next.config.ts
+++ b/next.config.ts
@@ -1,3 +1,8 @@
 import type { NextConfig } from 'next';
-const nextConfig: NextConfig = { turbopack: { root: process.cwd() } };
+const nextConfig: NextConfig = {
+  turbopack: { root: process.cwd() },
+  serverExternalPackages: ['bcryptjs', '@react-pdf/renderer', '@prisma/client', '@prisma/adapter-neon', '@neondatabase/serverless'],
+  compress: true,
+  poweredByHeader: false,
+};
 export default nextConfig;
```

### vercel.json

```diff
--- a/vercel.json
+++ b/vercel.json
@@ -5,5 +5,8 @@
   "buildCommand": "npm run vercel-build",
   "git": {
     "deploymentEnabled": false
-  }
+  },
+  "regions": [
+    "sin1"
+  ]
 }
```

### src/server/services/employees.ts

```diff
--- a/src/server/services/employees.ts
+++ b/src/server/services/employees.ts
@@ -1,4 +1,5 @@
 import 'server-only';
+import { revalidateTag } from 'next/cache';
 import { normalizePhone, isValidPhone } from '@/lib/contactValidation';
 import { z } from 'zod';
 import { prisma } from '@/server/db';
@@ -240,6 +241,7 @@
     });
   });

+  revalidateTag('stores', { expire: 0 });
   if (credentialsChanged) await revokeAllSessionsForUser(data.id);
   return toDTO(row);
 }
```

### prisma/migrations/20260926220000_add_perf_indexes/migration.sql

```diff
--- /dev/null
+++ b/prisma/migrations/20260926220000_add_perf_indexes/migration.sql
@@ -0,0 +1,15 @@
+-- CreateIndex
+CREATE INDEX "users_active_idx" ON "users"("active");
+
+-- CreateIndex
+CREATE INDEX "users_isSuperAdmin_idx" ON "users"("isSuperAdmin");
+
+-- CreateIndex
+CREATE INDEX "stores_deletedAt_idx" ON "stores"("deletedAt");
+
+-- CreateIndex
+CREATE INDEX "orders_updatedAt_idx" ON "orders"("updatedAt");
+
+-- CreateIndex
+CREATE INDEX "orders_storeId_phone_orderDate_idx" ON "orders"("storeId", "phone", "orderDate");
+
```
