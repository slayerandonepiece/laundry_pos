# Client cache and sync implementation

Working tree, 2026-09-27. No deployment or commits.

| Request | Implemented behavior |
| --- | --- |
| B1 | Extended existing orders sync endpoint: ISO `since`, existing composite continuation cursor, default 100/max 500, malformed dates return 400, live store/outlet authorization, no-store responses. |
| B2 | SHA-1-derived weak JSON ETags for successful cache-enabled GETs; matching `If-None-Match` returns bodyless 304 only after auth. Cache/Vary headers preserved. |
| B3 | Authenticated uncached store-local product/order maximum-update timestamps at `/api/v1/sync/status`. |
| F1 | Guarded localStorage session mirror with store context from login/status actions; removal/clear events log out other tabs, clear data caches and invalidate pending work. Store changes trigger server reconciliation. |
| F2 | Employee POS products/methods caches use five-minute TTL, store keys, API adaptation, status-driven product invalidation, cross-tab storage updates, online/focus refresh and Web Locks where available. SessionStorage draft behavior retained. |
| F3 | Owner Orders cache seeds repeat visits for 60 seconds and refreshes every mount; deltas upsert by ID/remove cancellation tombstones, drain every page and persist a server-time checkpoint. Owner sale creation writes through without moving that checkpoint. |
| F4 | Public manifest, 192/512 blue EL PNG icons, manifest/Apple metadata. |

SSR remains the initial render. Browser storage is optional: malformed JSON, wrong shapes, blocked reads/writes and quota errors fall back to server/in-memory data. Orders and expenses have no new server cache. API requests send the explicit verified store header; employee sync retains its explicit outlet authorization. Owner order caches are not consumed by employee views. Logout clears caches and prevents old network responses from restoring them.

The implementation preserves composite continuation cursors because multiple orders may share the same update timestamp. It adds `syncedAt` to sync responses and records the first page's server request time only after all pages succeed. Using device `Date.now()` as the next `since` could miss updates on a device with a fast clock. Cache writes still use `Date.now()` for local expiry, as requested.

An initial cache written through from New sale is marked partial and merged with SSR; completed sync caches are authoritative snapshots. This prevents a lone optimistic order from hiding the rest of the register on repeat navigation. Native Web Locks serialize sync across tabs where supported; storage events distribute completed data updates. Browsers without Web Locks retain safe cache fallbacks, but may make redundant requests.

## Verification

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed; two existing unused-catch warnings in `scripts/qa_audit.mjs`.
- `LC_ALL=C npm run test:subscription-payments`: 78 passed, including new equal-timestamp pagination/tombstones, conditional ETags/tenant authorization and sync-status tests. Disposable local PostgreSQL; no shared Neon data mutations.
- `node --import tsx --test tests/client-cache.test.ts`: four passed, covering StorageEvent logout/update/cleanup, stale/future timestamps, delta merge, optimistic write-through, store isolation, corrupt JSON and blocked storage.
- Production webpack build passed in an isolated `/tmp` copy without environment files or changes to the running dev server's `.next` output.
- Static icon dimensions verified: 192×192 and 512×512 PNG.
- Logged-in owner Profile reload, Orders navigation and a fresh authenticated Orders tab succeeded; no captured browser console errors. The running page includes the manifest link. Direct browser navigation to the API URL was blocked by the browser; API contracts were verified in integration tests instead.

## Limits

No live logout was performed on the existing owner session; cross-tab logout was tested with StorageEvents. Employee POS cache mounting was source/type tested, not exercised with a live employee account. No sales, payments, employees or other business records were created during live checks. No navigation latency improvement was measured.

The manifest supplies installation metadata. There is no service worker, offline route shell, offline authentication, offline order submission or write queue. Cached data can remain usable in an already loaded verified workspace; a disconnected hard refresh is not promised.
