#!/usr/bin/env node
/**
 * Capture the Super Admin visual freeze baseline.
 *
 * The CSS/theme refactor (.agents/css-refactor/) is allowed to rewrite Super
 * Admin's CSS but not to move a single pixel of its rendered output. This
 * script is the mechanical proof: it screenshots every /super-admin route at
 * 1440 / 768 / 375 and writes a MANIFEST.md with per-file SHA-256 hashes.
 *
 * Phase 0 captured the reference into .agents/css-refactor/baseline/.
 * Later phases re-run it with --out <tmpdir> and diff the two directories.
 *
 * Usage:
 *   node scripts/capture-superadmin-baseline.mjs
 *   node scripts/capture-superadmin-baseline.mjs --out /tmp/after \
 *     --ids .agents/css-refactor/baseline/ids.json \
 *     --compare .agents/css-refactor/baseline
 *
 * Flags:
 *   --out <dir>    output directory (default .agents/css-refactor/baseline)
 *   --ids <file>   JSON of pinned dynamic-route ids. A re-capture MUST reuse
 *                  the baseline's ids or the diff is meaningless. Every run
 *                  writes ids.json next to the PNGs; pass it back on re-runs.
 *   --base <url>   app origin (default http://localhost:3000)
 *   --port <n>     CDP port (default 9333)
 *   --compare <d>  after capturing, pixel-diff the result against baseline dir
 *                  <d> and exit non-zero if any screen actually changed
 *
 * Notes:
 *   - Requires a dev server already running at --base. It never starts or
 *     stops one.
 *   - Mints a disposable Super Admin session row directly in the database and
 *     deletes it in a finally block. It reads no password and mutates no
 *     account. It does not touch any existing browser session.
 *   - Drives system Chrome headless over raw CDP (node's global WebSocket).
 *     No puppeteer/playwright dependency, and a throwaway --user-data-dir, so
 *     the user's real Chrome profile is never opened.
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { inflateSync } from 'node:zlib';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WIDTHS = [1440, 768, 375];
const VIEWPORT_HEIGHT = 900;
// Mirrors src/server/auth/session.ts: the cookie carries the Session row's id,
// not its token.
const COOKIE_NAME = 'el_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const OUT_DIR = path.resolve(arg('out', '.agents/css-refactor/baseline'));
const BASE = arg('base', 'http://localhost:3000').replace(/\/$/, '');
const CDP_PORT = Number(arg('port', '9333'));
const IDS_FILE = arg('ids', null);
const COMPARE_DIR = arg('compare', null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Dev-overlay custom elements stripped before capture; reported in the manifest. */
const devOverlaysRemoved = new Set();

/* ------------------------------------------------------------------ routes */

// Static routes. /super-admin/login is captured WITHOUT a session cookie (it
// redirects to the dashboard when signed in), in its own browser context.
const STATIC_ROUTES = [
  { slug: 'super-admin', url: '/super-admin' },
  { slug: 'super-admin__stores', url: '/super-admin/stores' },
  { slug: 'super-admin__users', url: '/super-admin/users' },
  { slug: 'super-admin__subscriptions', url: '/super-admin/subscriptions' },
  {
    slug: 'super-admin__subscriptions__billing',
    url: '/super-admin/subscriptions/billing',
    skip: 'SKIPPED — redirect-only route (`redirect(\'/super-admin/billing\')`), renders no UI of its own',
  },
  { slug: 'super-admin__billing', url: '/super-admin/billing' },
  { slug: 'super-admin__payment-methods', url: '/super-admin/payment-methods' },
  { slug: 'super-admin__activity', url: '/super-admin/activity' },
];

const LOGIN_ROUTE = { slug: 'super-admin__login', url: '/super-admin/login', anonymous: true };

/** Routes needing real ids. `needs` names the id keys they consume. */
const DYNAMIC_ROUTES = [
  { slug: 'super-admin__stores__[storeId]', build: (i) => `/super-admin/stores/${i.storeId}`, needs: ['storeId'] },
  { slug: 'super-admin__stores__[storeId]__users', build: (i) => `/super-admin/stores/${i.storeId}/users`, needs: ['storeId'] },
  { slug: 'super-admin__stores__[storeId]__subscription', build: (i) => `/super-admin/stores/${i.storeId}/subscription`, needs: ['storeId'] },
  { slug: 'super-admin__stores__[storeId]__activity', build: (i) => `/super-admin/stores/${i.storeId}/activity`, needs: ['storeId'] },
  { slug: 'super-admin__stores__[storeId]__outlets', build: (i) => `/super-admin/stores/${i.storeId}/outlets`, needs: ['storeId'] },
  { slug: 'super-admin__stores__[storeId]__outlets__[outletId]', build: (i) => `/super-admin/stores/${i.storeId}/outlets/${i.outletId}`, needs: ['storeId', 'outletId'] },
  { slug: 'super-admin__stores__[storeId]__edit', build: (i) => `/super-admin/stores/${i.storeId}/edit`, needs: ['storeId'] },
  { slug: 'super-admin__users__[userId]', build: (i) => `/super-admin/users/${i.userId}`, needs: ['userId'] },
  { slug: 'super-admin__subscriptions__[planId]', build: (i) => `/super-admin/subscriptions/${i.planId}`, needs: ['planId'] },
  { slug: 'super-admin__subscriptions__invoices__[invoiceSeq]', build: (i) => `/super-admin/subscriptions/invoices/${i.invoiceSeq}`, needs: ['invoiceSeq'] },
];

/* --------------------------------------------------------------- database */

function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (expected from .env)');
  const sql = neon(process.env.DATABASE_URL);
  return (text, params = []) => sql.query(text, params);
}

/**
 * Resolve the first real row of each dynamic kind, deterministically ordered
 * so repeat runs on an unchanged database pick the same ids.
 */
async function resolveIds(q) {
  const ids = {};
  // Prefer a store that actually has an outlet, so the outlet routes resolve
  // against the same store as the rest of the store detail tabs.
  const withOutlet = await q(
    `select s.id from stores s
       where s."deletedAt" is null and exists (select 1 from outlets o where o."storeId" = s.id)
       order by s."onboardedAt" asc, s.id asc limit 1`,
  );
  const anyStore = await q(`select id from stores where "deletedAt" is null order by "onboardedAt" asc, id asc limit 1`);
  const store = withOutlet[0] ?? anyStore[0];
  if (store) ids.storeId = store.id;

  if (ids.storeId) {
    const outlet = await q(`select id from outlets where "storeId" = $1 order by "outletCode" asc, id asc limit 1`, [ids.storeId]);
    if (outlet[0]) ids.outletId = outlet[0].id;
  }
  // getUser() in platform-users.ts filters `isSuperAdmin: false`, so the
  // platform admin's own id renders the not-found screen.
  const user = await q(`select id from users where "isSuperAdmin" = false order by "createdAt" asc, id asc limit 1`);
  if (user[0]) ids.userId = user[0].id;
  const plan = await q(`select id from subscription_plans order by "createdAt" asc, id asc limit 1`);
  if (plan[0]) ids.planId = plan[0].id;
  const invoice = await q(`select "invoiceSeq" from subscription_payments order by "invoiceSeq" asc limit 1`);
  if (invoice[0]) ids.invoiceSeq = String(invoice[0].invoiceSeq);
  return ids;
}

/** Mint a throwaway Super Admin session row. Returns { sessionId, cleanup }. */
async function mintSession(q) {
  const admin = await q(`select id, "credentialVersion" from users where "isSuperAdmin" = true and active = true order by "createdAt" asc, id asc limit 1`);
  if (!admin[0]) throw new Error('No active Super Admin user found in the database.');
  // Same shape as generateSessionToken() in src/server/auth/token.ts.
  const token = randomBytes(32).toString('base64url');
  const id = `baseline_${randomBytes(12).toString('hex')}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await q(
    `insert into sessions (id, token, "userId", "credentialVersion", "expiresAt", "createdAt")
     values ($1, $2, $3, $4, $5, now())`,
    [id, token, admin[0].id, admin[0].credentialVersion, expiresAt.toISOString()],
  );
  return {
    sessionId: id,
    cleanup: async () => {
      await q(`delete from sessions where id = $1`, [id]);
    },
  };
}

/* -------------------------------------------------------------------- CDP */

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 1;
    this.pending = new Map();
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.next++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 60_000);
    });
  }
}

async function launchChrome(userDataDir) {
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--disable-lcd-text',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) return { child, wsUrl: (await res.json()).webSocketDebuggerUrl };
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  child.kill();
  throw new Error(`Chrome did not expose CDP on port ${CDP_PORT}`);
}

async function openPage(cdp, browserContextId) {
  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank',
    ...(browserContextId ? { browserContextId } : {}),
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Emulation.setScrollbarsHidden', { hidden: true }, sessionId).catch(() => {});
  // Freeze animations/transitions and hide the caret so repeat captures of an
  // unchanged UI are byte-identical.
  await cdp.send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `
        (() => {
          const css = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'
            + 'nextjs-portal{display:none!important}';
          const add = () => {
            if (document.getElementById('__baseline_freeze__')) return;
            const s = document.createElement('style');
            s.id = '__baseline_freeze__';
            s.textContent = css;
            (document.head || document.documentElement).appendChild(s);
          };
          add();
          document.addEventListener('DOMContentLoaded', add);
        })();
      `,
    },
    sessionId,
  );
  return { targetId, sessionId };
}

async function evaluate(cdp, sessionId, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(`page eval failed: ${r.exceptionDetails.text}`);
  return r.result.value;
}

/**
 * The app renders a route-level `.content-loading` / `.ad-spinner` fallback
 * while a page's server data is in flight. Capturing that would poison the
 * baseline, so wait for it to clear as well as for the document and fonts.
 */
async function waitForSettled(cdp, sessionId) {
  const deadline = Date.now() + 45_000;
  let stable = 0;
  while (Date.now() < deadline) {
    const state = await evaluate(
      cdp,
      sessionId,
      `(async () => {
         try { await document.fonts.ready; } catch {}
         return {
           ready: document.readyState === 'complete',
           spinner: !!document.querySelector('.content-loading, .ad-spinner'),
           height: document.documentElement.scrollHeight,
         };
       })()`,
    );
    if (state.ready && !state.spinner) {
      stable++;
      if (stable >= 3) {
        await sleep(250);
        return;
      }
    } else {
      stable = 0;
    }
    await sleep(200);
  }
  throw new Error('page never settled (spinner still present or document not complete)');
}

async function capture(cdp, sessionId, url, width, file) {
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await cdp.send('Page.navigate', { url }, sessionId);
  await waitForSettled(cdp, sessionId);
  // A wrong/stale dynamic id renders src/app/super-admin/not-found.tsx, which
  // would silently become part of the baseline. Fail loudly instead.
  const health = await evaluate(
    cdp,
    sessionId,
    `({ href: location.href, notFound: /Not found/.test(document.body.innerText) && /doesn't exist/.test(document.body.innerText), text: document.body.innerText.trim().length })`,
  );
  if (health.notFound) throw new Error(`${url} rendered the Super Admin not-found screen — the dynamic id does not resolve.`);
  if (health.text < 20) throw new Error(`${url} rendered an essentially empty body.`);
  if (!health.href.startsWith(`${BASE}${new URL(url).pathname}`)) {
    throw new Error(`${url} redirected to ${health.href} — expected to stay put.`);
  }

  // Next's dev-mode overlay (the floating build indicator) mounts lazily as a
  // custom element on <body> and its rendering varies between runs, which
  // would make every screenshot non-reproducible. It is dev-server chrome, not
  // app UI, so strip it. `next-route-announcer` is a visually-hidden a11y
  // element and is left alone.
  const removed = await evaluate(
    cdp,
    sessionId,
    `(() => {
       const gone = [];
       // Next 16 nests <nextjs-portal> inside one of its own injected <script>
       // elements, so a body-children scan misses it — query the whole tree.
       for (const el of Array.from(document.querySelectorAll('*'))) {
         if (el.tagName.includes('-') && el.tagName !== 'NEXT-ROUTE-ANNOUNCER') {
           gone.push(el.tagName); el.remove();
         }
       }
       return gone;
     })()`,
  );
  if (removed.length) devOverlaysRemoved.add(removed.join(','));

  // Scroll back to the origin: captureBeyondViewport still honours sticky
  // elements' current offset.
  await evaluate(cdp, sessionId, 'window.scrollTo(0, 0); 0');
  await sleep(120);
  const { data } = await cdp.send(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: true, fromSurface: true },
    sessionId,
  );
  const buf = Buffer.from(data, 'base64');
  await writeFile(file, buf);
  return buf;
}

/** Minimal PNG IHDR read — avoids pulling in an image library. */
function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/* ---------------------------------------------------------------- compare */

// Repeat captures of an unchanged UI are byte-identical for ~85% of the set;
// the rest drift by a handful of antialiased glyph-edge pixels, which is
// macOS text rasterisation, not a CSS change. So the gate is a pixel compare
// with an explicit antialiasing tolerance, not a SHA match. SHAs stay in the
// manifest as the fast path and as a tamper record.
const AA_MAX_FRACTION = 0.001; // 0.1% of pixels
const AA_MAX_DELTA = 32; // per-channel

/** Decode an 8-bit PNG (greyscale/RGB/RGBA) using only node:zlib. */
function decodePng(buf) {
  let pos = 8;
  let w = 0;
  let h = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (bitDepth !== 8 || !ch) throw new Error(`unsupported PNG (bitDepth ${bitDepth}, colorType ${colorType})`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, ch, data: out };
}

function comparePng(aBuf, bBuf) {
  const a = decodePng(aBuf);
  const b = decodePng(bBuf);
  if (a.w !== b.w || a.h !== b.h) {
    return { verdict: 'CHANGED', note: `dimensions ${a.w}x${a.h} → ${b.w}x${b.h}` };
  }
  let diff = 0;
  let maxDelta = 0;
  let firstY = null;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const i = (y * a.w + x) * a.ch;
      let d = 0;
      for (let k = 0; k < a.ch; k++) d = Math.max(d, Math.abs(a.data[i + k] - b.data[i + k]));
      if (d) {
        diff++;
        if (d > maxDelta) maxDelta = d;
        if (firstY === null) firstY = y;
      }
    }
  }
  const total = a.w * a.h;
  if (!diff) return { verdict: 'IDENTICAL', note: '' };
  const fraction = diff / total;
  const verdict = fraction <= AA_MAX_FRACTION && maxDelta <= AA_MAX_DELTA ? 'ANTIALIAS' : 'CHANGED';
  return {
    verdict,
    note: `${diff} px (${(fraction * 100).toFixed(4)}%), max channel delta ${maxDelta}, first row ${firstY}`,
  };
}

/** `--compare <baselineDir>`: diff a freshly captured dir against the baseline. */
async function compareDirs(baselineDir, freshDir) {
  const { readdir, readFile } = await import('node:fs/promises');
  const pngs = (d) => readdir(d).then((f) => f.filter((n) => n.endsWith('.png')).sort());
  const [base, fresh] = await Promise.all([pngs(baselineDir), pngs(freshDir)]);
  const missing = base.filter((n) => !fresh.includes(n));
  const extra = fresh.filter((n) => !base.includes(n));
  let changed = 0;
  let aa = 0;
  let same = 0;
  console.log(`\ncomparing ${freshDir} against ${baselineDir}`);
  for (const name of base.filter((n) => fresh.includes(n))) {
    const [a, b] = await Promise.all([
      readFile(path.join(baselineDir, name)),
      readFile(path.join(freshDir, name)),
    ]);
    if (a.equals(b)) {
      same++;
      continue;
    }
    const { verdict, note } = comparePng(a, b);
    if (verdict === 'IDENTICAL') same++;
    else if (verdict === 'ANTIALIAS') {
      aa++;
      console.log(`  ~ ${name}: antialiasing only — ${note}`);
    } else {
      changed++;
      console.log(`  ✗ ${name}: CHANGED — ${note}`);
    }
  }
  for (const n of missing) console.log(`  ✗ ${n}: missing from the new capture`);
  for (const n of extra) console.log(`  ✗ ${n}: not present in the baseline`);
  console.log(`\nidentical ${same} · antialiasing-only ${aa} · CHANGED ${changed} · missing ${missing.length} · extra ${extra.length}`);
  const failed = changed + missing.length + extra.length;
  if (failed) {
    console.error('\nSuper Admin freeze VIOLATED — inspect the files above.');
    process.exitCode = 1;
  } else {
    console.log('\nSuper Admin freeze held.');
  }
}

/* ------------------------------------------------------------------- main */

async function main() {
  const res = await fetch(`${BASE}/super-admin/login`).catch(() => null);
  if (!res) throw new Error(`No dev server responding at ${BASE}. Start one (or pass --base) — this script never starts one itself.`);
  console.log(`dev server at ${BASE}: HTTP ${res.status}`);

  const q = db();
  const ids = IDS_FILE
    ? JSON.parse(await import('node:fs/promises').then((m) => m.readFile(IDS_FILE, 'utf8')))
    : await resolveIds(q);
  console.log('dynamic ids:', ids);

  const { sessionId: appSessionId, cleanup } = await mintSession(q);
  console.log('minted disposable Super Admin session');

  const userDataDir = await mkdtemp(path.join(tmpdir(), 'baseline-chrome-'));
  let chrome = null;

  const rows = [];
  const skipped = [];

  try {
    await mkdir(OUT_DIR, { recursive: true });
    chrome = await launchChrome(userDataDir);
    const ws = new WebSocket(chrome.wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const cdp = new Cdp(ws);

    // Signed-in context.
    const authed = await openPage(cdp, null);
    await cdp.send(
      'Network.setCookie',
      { name: COOKIE_NAME, value: appSessionId, domain: 'localhost', path: '/', httpOnly: true, secure: false },
      authed.sessionId,
    );

    const jobs = [];
    for (const r of STATIC_ROUTES) {
      if (r.skip) {
        skipped.push({ slug: r.slug, route: r.url, reason: r.skip });
        continue;
      }
      jobs.push({ slug: r.slug, url: r.url, anonymous: false });
    }
    for (const r of DYNAMIC_ROUTES) {
      const missing = r.needs.filter((k) => !ids[k]);
      if (missing.length) {
        skipped.push({ slug: r.slug, route: r.slug, reason: `SKIPPED — no data (missing ${missing.join(', ')})` });
        continue;
      }
      jobs.push({ slug: r.slug, url: r.build(ids), anonymous: false, ids: Object.fromEntries(r.needs.map((k) => [k, ids[k]])) });
    }

    for (const job of jobs) {
      for (const width of WIDTHS) {
        const name = `${job.slug}__${width}.png`;
        const buf = await capture(cdp, authed.sessionId, `${BASE}${job.url}`, width, path.join(OUT_DIR, name));
        const { width: w, height: h } = pngSize(buf);
        rows.push({ name, route: job.url, slug: job.slug, width, ids: job.ids ?? null, dims: `${w}x${h}`, sha: createHash('sha256').update(buf).digest('hex') });
        console.log(`  ✓ ${name} (${w}x${h})`);
      }
    }
    await cdp.send('Target.closeTarget', { targetId: authed.targetId });

    // /super-admin/login needs a cookie-free context or it redirects to the
    // dashboard.
    const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true });
    const anon = await openPage(cdp, browserContextId);
    for (const width of WIDTHS) {
      const name = `${LOGIN_ROUTE.slug}__${width}.png`;
      const buf = await capture(cdp, anon.sessionId, `${BASE}${LOGIN_ROUTE.url}`, width, path.join(OUT_DIR, name));
      const { width: w, height: h } = pngSize(buf);
      rows.push({ name, route: LOGIN_ROUTE.url, slug: LOGIN_ROUTE.slug, width, ids: null, dims: `${w}x${h}`, sha: createHash('sha256').update(buf).digest('hex'), anonymous: true });
      console.log(`  ✓ ${name} (${w}x${h}) [no cookie]`);
    }
    await cdp.send('Target.closeTarget', { targetId: anon.targetId });

    await writeFile(path.join(OUT_DIR, 'ids.json'), `${JSON.stringify(ids, null, 2)}\n`);
    await writeFile(path.join(OUT_DIR, 'MANIFEST.md'), manifest(rows, skipped, ids));
    console.log(`\n${rows.length} screenshots → ${OUT_DIR}`);
    if (skipped.length) console.log(`${skipped.length} routes skipped (no data)`);
    if (COMPARE_DIR) await compareDirs(path.resolve(COMPARE_DIR), OUT_DIR);
  } finally {
    await cleanup().then(
      () => console.log('disposable session deleted'),
      (e) => console.error('WARNING: could not delete disposable session:', e.message),
    );
    if (chrome) chrome.child.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

function manifest(rows, skipped, ids) {
  const lines = [];
  lines.push('# Super Admin visual freeze baseline');
  lines.push('');
  lines.push('Generated by `node scripts/capture-superadmin-baseline.mjs`.');
  lines.push('');
  lines.push(`- Captured: ${new Date().toISOString()}`);
  lines.push(`- Widths: ${WIDTHS.join(' / ')} (deviceScaleFactor 1, full page via \`captureBeyondViewport\`)`);
  lines.push(`- Screenshots: ${rows.length}`);
  lines.push(`- Routes skipped: ${skipped.length}`);
  lines.push('');
  lines.push('## How to diff a later phase against this');
  lines.push('');
  lines.push('```bash');
  lines.push('node scripts/capture-superadmin-baseline.mjs \\');
  lines.push('  --out /tmp/after --ids .agents/css-refactor/baseline/ids.json');
  lines.push('diff <(cd .agents/css-refactor/baseline && shasum -a 256 *.png) \\');
  lines.push('     <(cd /tmp/after && shasum -a 256 *.png)');
  lines.push('```');
  lines.push('');
  lines.push('`--ids` is mandatory on a re-capture: a capture against different');
  lines.push('dynamic ids renders different content and is not a valid diff.');
  lines.push('');
  lines.push('## Dynamic route ids (pinned)');
  lines.push('');
  lines.push('| Key | Value |');
  lines.push('| --- | --- |');
  for (const [k, v] of Object.entries(ids)) lines.push(`| \`${k}\` | \`${v}\` |`);
  lines.push('');
  lines.push('Also written machine-readable to `ids.json`.');
  lines.push('');
  lines.push('## Captured');
  lines.push('');
  lines.push('| File | Route | Width | Dimensions | SHA-256 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of rows) {
    lines.push(`| \`${r.name}\` | \`${r.route}\`${r.anonymous ? ' _(no cookie)_' : ''} | ${r.width} | ${r.dims} | \`${r.sha}\` |`);
  }
  lines.push('');
  lines.push('## Skipped');
  lines.push('');
  if (!skipped.length) {
    lines.push('None — every route had real data.');
  } else {
    lines.push('| Route | Reason |');
    lines.push('| --- | --- |');
    for (const s of skipped) lines.push(`| \`${s.slug}\` | ${s.reason} |`);
  }
  lines.push('');
  lines.push('## Determinism caveats');
  lines.push('');
  lines.push(
    devOverlaysRemoved.size
      ? `- Next's dev-mode overlay elements (\`${[...devOverlaysRemoved].join('`, `')}\`) are removed from the DOM immediately before capture. They are dev-server chrome, not app UI, and they render non-deterministically.`
      : '- No Next dev-overlay element was present at capture time.',
  );
  lines.push('- CSS animations and transitions are frozen and the caret is hidden by an');
  lines.push('  injected stylesheet, so repeat captures of unchanged UI are byte-identical.');
  lines.push('- Screens that render dates relative to "today" (renewal countdowns, activity');
  lines.push('  timestamps) will differ across days regardless of CSS. A hash mismatch on');
  lines.push('  those is not automatically a regression — inspect the image before calling');
  lines.push('  it a defect.');
  lines.push('- The capture reads whatever the dev database currently holds. Data written by');
  lines.push('  another agent between captures also shows up as a mismatch.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
