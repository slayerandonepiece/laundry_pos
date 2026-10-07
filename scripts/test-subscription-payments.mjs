import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Always create our own Unix-socket-only PostgreSQL cluster. Never load .env
// or accept DATABASE_URL: neither migrations nor fixtures can reach Neon.
const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = mkdtempSync('/tmp/el-subscription-test-');
const data = join(temporary, 'data');
const socket = join(temporary, 'socket');
const username = 'subscription_test';
let started = false;

function run(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

try {
  mkdirSync(socket, { mode: 0o700 });
  run('initdb', ['-D', data, '--username', username, '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  appendFileSync(join(data, 'postgresql.conf'), `\nlisten_addresses = ''\nunix_socket_directories = '${socket}'\nfsync = off\n`);
  run('pg_ctl', ['-D', data, '-l', join(temporary, 'postgres.log'), '-w', 'start']);
  started = true;
  for (const migration of readdirSync(join(root, 'prisma/migrations')).filter(name => /^\d/.test(name)).sort()) {
    run('psql', ['-X', '-h', socket, '-p', '5432', '-U', username, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(root, 'prisma/migrations', migration, 'migration.sql')]);
  }
  const result = spawnSync(process.execPath, ['--conditions=react-server', '--experimental-test-module-mocks', '--import', 'tsx', '--import', './tests/next-cache.mock.mjs', '--test',
    'tests/subscription-payments.integration.test.ts',
    'tests/customer-invoices-and-payment-methods.integration.test.ts',
    'tests/mobile-api.integration.test.ts',
    'tests/outlet-auth.integration.test.ts',
    'tests/outlet-operational.integration.test.ts',
    'tests/platform-payment-methods.integration.test.ts',
    'tests/subscription-restrictions.integration.test.ts',
    'tests/dashboard-rollups.integration.test.ts',
    'tests/api-hardening.integration.test.ts',
    'tests/expense-routes.integration.test.ts',
    'tests/per-tenant-idempotency.integration.test.ts',
    'tests/billing-pending.integration.test.ts',
    'tests/auth-hardening.integration.test.ts',
    'tests/token.test.ts',
    'tests/employee-outlet-assignment.integration.test.ts',
    'tests/invoice-outlet-access.integration.test.ts',
    'tests/multi-outlet-lifecycle.integration.test.ts',
    'tests/super-admin-profile.integration.test.ts',
    'tests/workspace-announcements.integration.test.ts',
    'tests/account-deletion.integration.test.ts',
    'tests/document-numbering.integration.test.ts',
    'tests/org-settings.integration.test.ts',
    'tests/order-flow.integration.test.ts',
    'tests/order-import.integration.test.ts',
    'tests/order-corrections.integration.test.ts',
    'tests/sales-search.integration.test.ts',
    'tests/subscription-terms.integration.test.ts',
    'tests/sync-status-templates.integration.test.ts',
    'tests/subscription-plan-mobile.integration.test.ts',
  ], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, QA_SUBSCRIPTION_PG_SOCKET: socket },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  // @react-pdf/renderer does not load under tsx or the react-server condition above, but
  // Next bundles it fine. Bundle the database-free PDF test the same way and run it.
  run('npx', ['esbuild', 'tests/order-pdf.test.mts', '--bundle', '--platform=node', '--format=esm', '--jsx=automatic', '--alias:@=./src',
    '--external:pdfjs-dist', '--external:pdfkit', '--outfile=node_modules/.cache/pdf-test/order-pdf.test.mjs',
    '--banner:js=import { createRequire as __cr } from "module"; const require = __cr(import.meta.url);']);
  const pdf = spawnSync(process.execPath, ['--test', join(root, 'node_modules/.cache/pdf-test/order-pdf.test.mjs')], { cwd: root, stdio: 'inherit' });
  if (pdf.error) throw pdf.error;
  if (pdf.status) process.exitCode = pdf.status;
} catch (error) {
  console.error('Local subscription integration test failed:', error.message);
  if (error.stderr) console.error(String(error.stderr));
  process.exitCode = 1;
} finally {
  if (started) {
    // A failure to stop is an error; keep the directory so a running server
    // is never orphaned by deleting its data files.
    try {
      run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
      started = false;
    } catch {
      console.error(`Could not stop test PostgreSQL; data retained at ${data}`);
      process.exitCode = 1;
    }
  }
  if (!started) rmSync(temporary, { recursive: true, force: true });
}
