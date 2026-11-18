import test from 'node:test';
import assert from 'node:assert/strict';
import type { ConfigSnapshot, HeldOrder, Product, SaleRecord, StockLogEntry, StoreSettings } from '../types';
import { DEFAULT_SETTINGS } from './posMath';
import {
  buildGithubIntegrationBundleFiles,
  extractProjectRefFromUrl,
  mergeSettingsFromCloud,
  normalizeSyncStoreId,
  reconcileProducts,
  reconcileSales,
  reconcileStoreData,
  sanitizeSettingsForSync,
} from './supabaseSync';

const sampleProduct = (id: string, overrides: Partial<Product> = {}): Product => ({
  id,
  barcode: `48000000000${id}`,
  name: `Product ${id}`,
  category: 'Beverages',
  unit: 'pc',
  retailPrice: 25,
  wholesalePrice: 22,
  wholesaleMinQty: 10,
  stock: 20,
  updatedAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

const sampleSale = (receiptNo: string, overrides: Partial<SaleRecord> = {}): SaleRecord => ({
  receiptNo,
  dateIso: '2026-11-10T11:00:00.000Z',
  dateFormatted: 'Nov 10, 2026, 11:00 AM',
  items: [
    {
      productId: '1',
      category: 'Beverages',
      name: 'Product 1',
      qty: 2,
      unit: 'pc',
      unitPrice: 25,
      priceType: 'retail',
      lineTotal: 50,
    },
  ],
  retailSubtotal: 50,
  wholesaleSavings: 0,
  seniorDiscount: 0,
  grandTotal: 50,
  paymentMethod: 'Cash',
  tendered: 50,
  change: 0,
  ...overrides,
});

test('extractProjectRefFromUrl and normalizeSyncStoreId parse Supabase project URLs safely', () => {
  assert.equal(extractProjectRefFromUrl('https://xahsyugciihrrnchufwo.supabase.co'), 'xahsyugciihrrnchufwo');
  assert.equal(extractProjectRefFromUrl('https://example.com'), '');
  assert.equal(normalizeSyncStoreId('  Branch #01 / Main! '), 'branch-01-main');
  assert.equal(normalizeSyncStoreId(''), 'main-store');
});

test('sanitizeSettingsForSync strips local PIN hashes, salts, passkeys, and timestamps', () => {
  const dirty: StoreSettings = {
    ...DEFAULT_SETTINGS,
    storeName: 'Tindahan ni Maria',
    adminPin: '1234',
    adminPinHash: 'secret-hash',
    adminPinSalt: 'secret-salt',
    adminPinIter: 310000,
    adminPinAlgo: 'PBKDF2-SHA512',
    adminPinWeak: false,
    passkeyCredId: 'cred-1',
    passkeyPubKeySpki: 'spki-1',
    passkeyLabel: 'Touch ID',
    passkeyRegisteredAt: '2026-11-01T00:00:00.000Z',
    lastSyncedAt: '2026-11-10T00:00:00.000Z',
    lastBackup: '2026-11-09T00:00:00.000Z',
  };

  const sanitized = sanitizeSettingsForSync(dirty);
  assert.equal(sanitized.storeName, 'Tindahan ni Maria');
  assert.equal('adminPin' in sanitized, false);
  assert.equal('adminPinHash' in sanitized, false);
  assert.equal('adminPinSalt' in sanitized, false);
  assert.equal('passkeyCredId' in sanitized, false);
  assert.equal('passkeyPubKeySpki' in sanitized, false);
  assert.equal('lastSyncedAt' in sanitized, false);
  assert.equal('lastBackup' in sanitized, false);
});

test('mergeSettingsFromCloud preserves local credentials even in pull mode', () => {
  const local: StoreSettings = {
    ...DEFAULT_SETTINGS,
    storeName: 'Local Old Name',
    adminPinHash: 'local-pin-hash',
    adminPinSalt: 'local-salt',
    passkeyCredId: 'local-passkey',
    syncStoreId: 'branch-a',
  };
  const mergedPull = mergeSettingsFromCloud(
    local,
    { storeName: 'Cloud Store Name', lowStockThreshold: 15, adminPinHash: 'evil-override' },
    'pull',
  );
  assert.equal(mergedPull.storeName, 'Cloud Store Name');
  assert.equal(mergedPull.lowStockThreshold, 15);
  assert.equal(mergedPull.adminPinHash, 'local-pin-hash');
  assert.equal(mergedPull.passkeyCredId, 'local-passkey');
});

test('reconcileProducts merges newer updates and honors deletion tombstones', () => {
  const localProducts = [
    sampleProduct('1', { stock: 12, updatedAt: '2026-11-10T10:00:00.000Z' }),
    sampleProduct('2', { stock: 5, updatedAt: '2026-11-10T09:00:00.000Z' }),
  ];
  const cloudProducts = [
    sampleProduct('1', { stock: 18, updatedAt: '2026-11-10T12:00:00.000Z' }), // cloud newer
    sampleProduct('2', { stock: 9, updatedAt: '2026-11-10T08:00:00.000Z' }), // local newer
    sampleProduct('3', { stock: 30, updatedAt: '2026-11-10T11:00:00.000Z' }), // cloud only
    sampleProduct('4', { stock: 4, updatedAt: '2026-11-10T08:00:00.000Z' }), // deleted locally later
  ];
  const localDeleted = { '4': '2026-11-10T13:00:00.000Z' };

  const res = reconcileProducts(localProducts, localDeleted, cloudProducts, {}, 'merge');
  const byId = new Map(res.products.map((p) => [p.id, p]));
  assert.equal(byId.get('1')?.stock, 18);
  assert.equal(byId.get('2')?.stock, 5);
  assert.equal(byId.get('3')?.stock, 30);
  assert.equal(byId.has('4'), false);
  assert.equal(res.deletedProducts['4'], '2026-11-10T13:00:00.000Z');
});

test('reconcileSales deduplicates receipts and propagates voided status across terminals', () => {
  const localSales = [
    sampleSale('OR-001', { voided: false }),
    sampleSale('OR-002', { dateIso: '2026-11-10T12:00:00.000Z', voided: true, voidReason: 'Mistake' }),
  ];
  const cloudSales = [
    sampleSale('OR-001', { voided: true, voidReason: 'Customer cancelled' }),
    sampleSale('OR-002', { dateIso: '2026-11-10T12:00:00.000Z', voided: false }),
    sampleSale('OR-003', { dateIso: '2026-11-10T13:00:00.000Z' }),
  ];

  const merged = reconcileSales(localSales, cloudSales, 'merge');
  assert.equal(merged.length, 3);
  assert.equal(merged.find((s) => s.receiptNo === 'OR-001')?.voided, true);
  assert.equal(merged.find((s) => s.receiptNo === 'OR-002')?.voided, true);
  assert.equal(merged[2].receiptNo, 'OR-003');
});

test('reconcileStoreData combines held orders, stock logs, and config history cleanly', () => {
  const heldLocal: HeldOrder[] = [
    { id: 'HOLD-1', time: '10:00 AM', items: [], total: 100 },
  ];
  const heldCloud: HeldOrder[] = [
    { id: 'HOLD-2', time: '10:05 AM', items: [], total: 200 },
  ];
  const logsLocal: StockLogEntry[] = [
    {
      id: 'LOG-1',
      dateIso: '2026-11-10T10:00:00.000Z',
      productId: '1',
      productName: 'Product 1',
      delta: 5,
      prevStock: 10,
      newStock: 15,
      reason: 'Restock',
    },
  ];
  const logsCloud: StockLogEntry[] = [
    {
      id: 'LOG-2',
      dateIso: '2026-11-10T11:00:00.000Z',
      productId: '1',
      productName: 'Product 1',
      delta: -2,
      prevStock: 15,
      newStock: 13,
      reason: 'Damage',
    },
  ];
  const cfg: ConfigSnapshot = {
    id: 'CFG-1',
    version: '2.0.0',
    createdAt: '2026-11-10T09:00:00.000Z',
    label: 'Baseline',
    source: 'baseline',
    changedFields: [],
    config: {
      storeName: 'OmniMart',
      storeAddress: 'PH',
      storeTin: 'NON-VAT',
      storePhone: '',
      receiptFooter: 'Thanks',
      lowStockThreshold: 10,
      expiryWarnDays: 30,
      reorderLeadDays: 3,
      reorderSafetyDays: 2,
      beep: true,
      vibrate: true,
      scDiscountCap: 125,
      receiptWidth: '80mm',
    },
  };

  const result = reconcileStoreData({
    local: {
      products: [sampleProduct('1')],
      deletedProducts: {},
      sales: [sampleSale('OR-001')],
      heldOrders: heldLocal,
      stockLog: logsLocal,
      settings: { ...DEFAULT_SETTINGS },
      configHistory: [cfg],
    },
    cloud: {
      storeId: 'main-store',
      products: [sampleProduct('2')],
      sales: [sampleSale('OR-002')],
      heldOrders: heldCloud,
      stockLog: logsCloud,
      configHistory: [],
    },
    mode: 'merge',
  });

  assert.equal(result.stats.productsCount, 2);
  assert.equal(result.stats.salesCount, 2);
  assert.equal(result.stats.heldCount, 2);
  assert.equal(result.stats.stockLogCount, 2);
  assert.equal(result.stockLog[0].id, 'LOG-2');
});

import worker from '../../worker';
import { handleSyncApiRequest } from './syncApiHandler';

test('buildGithubIntegrationBundleFiles outputs Wrangler, Supabase, and GitHub CI workflow files', () => {
  const files = buildGithubIntegrationBundleFiles();
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  assert.equal(byPath.get('supabase/config.toml')?.includes('project_id = "xahsyugciihrrnchufwo"'), true);
  assert.equal(
    byPath.get('supabase/migrations/20261118000001_omnimart_pos_schema.sql')?.includes('create table if not exists public.pos_stores'),
    true,
  );
  assert.equal(byPath.get('.github/workflows/supabase-sync.yml')?.includes('supabase db push'), true);
  assert.equal(byPath.get('.github/workflows/cloudflare-deploy.yml')?.includes('wrangler-action'), true);
  assert.equal(byPath.has('supabase/seed.sql'), true);

  const wranglerParsed = JSON.parse(byPath.get('wrangler.jsonc') || '{}') as {
    name?: string;
    main?: string;
    assets?: { not_found_handling?: string; run_worker_first?: string[] };
  };
  assert.equal(wranglerParsed.name, 'eternalblue');
  assert.equal(wranglerParsed.main, 'worker.ts');
  assert.equal(wranglerParsed.assets?.not_found_handling, 'single-page-application');
  assert.deepEqual(wranglerParsed.assets?.run_worker_first, ['/api/*']);
  assert.equal(byPath.get('.dev.vars.example')?.includes('SUPABASE_SERVICE_ROLE_KEY='), true);
});

test('handleSyncApiRequest /api/sync/status reports unconfigured cleanly with Cloudflare & GitHub metadata', async () => {
  const res = await handleSyncApiRequest(
    new Request('https://eternalblue.workers.dev/api/sync/status'),
    { SUPABASE_URL: 'https://xahsyugciihrrnchufwo.supabase.co' },
    { runtime: 'cloudflare-worker' },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    configured: boolean;
    schemaReady: boolean;
    projectRef: string;
    cloudflareWorker?: { serviceName: string; runtime: string; dashboardUrl: string };
    githubIntegration?: { repo: string; branch: string };
  };
  assert.equal(body.configured, false);
  assert.equal(body.schemaReady, false);
  assert.equal(body.projectRef, 'xahsyugciihrrnchufwo');
  assert.equal(body.cloudflareWorker?.serviceName, 'eternalblue');
  assert.equal(body.cloudflareWorker?.runtime, 'cloudflare-worker');
  assert.equal(body.githubIntegration?.repo, 'Harley0321/eternalblue');
  assert.equal(body.githubIntegration?.branch, 'main');
});

test('handleSyncApiRequest /api/sync/status checks all 5 Supabase tables and detects missing schema', async () => {
  const readyFetch: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (/\/rest\/v1\/pos_(stores|products|sales|held_orders|stock_logs)/.test(url)) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not Found', { status: 404 });
  };

  const resReady = await handleSyncApiRequest(
    new Request('https://eternalblue.workers.dev/api/sync/status'),
    {
      SUPABASE_URL: 'https://xahsyugciihrrnchufwo.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    },
    { runtime: 'cloudflare-worker' },
    readyFetch,
  );
  assert.equal(resReady.status, 200);
  const bodyReady = (await resReady.json()) as { configured: boolean; schemaReady: boolean };
  assert.equal(bodyReady.configured, true);
  assert.equal(bodyReady.schemaReady, true);

  const missingTableFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        code: 'PGRST205',
        message: "Could not find the table 'public.pos_stores' in the schema cache",
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );

  const resMissing = await handleSyncApiRequest(
    new Request('https://eternalblue.workers.dev/api/sync/status'),
    {
      SUPABASE_URL: 'https://xahsyugciihrrnchufwo.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    },
    { runtime: 'cloudflare-worker' },
    missingTableFetch,
  );
  assert.equal(resMissing.status, 200);
  const bodyMissing = (await resMissing.json()) as {
    configured: boolean;
    schemaReady: boolean;
    error?: string;
  };
  assert.equal(bodyMissing.configured, true);
  assert.equal(bodyMissing.schemaReady, false);
  assert.equal(bodyMissing.error?.includes('pos_stores'), true);
});

test('handleSyncApiRequest /api/sync/github-check detects Supabase & Wrangler files in one tree scan', async () => {
  const mockFetch: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith('/repos/Harley0321/eternalblue')) {
      return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
    }
    if (url.includes('/git/trees/main')) {
      return new Response(
        JSON.stringify({
          tree: [
            { path: 'wrangler.jsonc', type: 'blob' },
            { path: 'worker.ts', type: 'blob' },
            { path: 'supabase/config.toml', type: 'blob' },
            { path: 'supabase/migrations/20261118000001_omnimart_pos_schema.sql', type: 'blob' },
            { path: '.github/workflows/supabase-sync.yml', type: 'blob' },
            { path: '.github/workflows/cloudflare-deploy.yml', type: 'blob' },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes('/commits/main')) {
      return new Response(
        JSON.stringify({
          sha: 'abcdef1234567890',
          commit: { message: 'Sync Cloudflare + Supabase + GitHub', author: { date: '2026-11-18T00:00:00Z' } },
        }),
        { status: 200 },
      );
    }
    return new Response('Not Found', { status: 404 });
  };

  const res = await handleSyncApiRequest(
    new Request('https://eternalblue.workers.dev/api/sync/github-check'),
    {},
    { runtime: 'cloudflare-worker' },
    mockFetch,
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    reachable: boolean;
    hasRemoteConfigToml: boolean;
    hasRemoteWranglerConfig: boolean;
    hasRemoteWorkerEntry: boolean;
    hasRemoteWorkflow: boolean;
    hasRemoteCloudflareWorkflow: boolean;
    remoteMigrations: string[];
    latestCommitSha: string;
  };
  assert.equal(body.reachable, true);
  assert.equal(body.hasRemoteConfigToml, true);
  assert.equal(body.hasRemoteWranglerConfig, true);
  assert.equal(body.hasRemoteWorkerEntry, true);
  assert.equal(body.hasRemoteWorkflow, true);
  assert.equal(body.hasRemoteCloudflareWorkflow, true);
  assert.deepEqual(body.remoteMigrations, ['20261118000001_omnimart_pos_schema.sql']);
  assert.equal(body.latestCommitSha, 'abcdef1');
});

test('worker.fetch routes /api/sync/status and delegates static assets cleanly', async () => {
  let assetFetchedUrl = '';
  const env = {
    SUPABASE_URL: 'https://xahsyugciihrrnchufwo.supabase.co',
    ASSETS: {
      async fetch(input: Request | URL | string) {
        assetFetchedUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        return new Response('<html>SPA</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
      },
    },
  };

  const apiRes = await worker.fetch(new Request('https://eternalblue.workers.dev/api/sync/status'), env);
  assert.equal(apiRes.status, 200);
  const apiJson = (await apiRes.json()) as { cloudflareWorker?: { runtime: string } };
  assert.equal(apiJson.cloudflareWorker?.runtime, 'cloudflare-worker');

  const spaRes = await worker.fetch(new Request('https://eternalblue.workers.dev/settings'), env);
  assert.equal(spaRes.status, 200);
  assert.equal(assetFetchedUrl, 'https://eternalblue.workers.dev/settings');

  const badApiRes = await worker.fetch(new Request('https://eternalblue.workers.dev/api/unknown', { method: 'POST', body: '{}' }), env);
  assert.equal(badApiRes.status, 404);
});

test('handleSyncApiRequest normalizes quoted, dashboard, bare-ref, and malformed SUPABASE_URL safely', async () => {
  const urlsSeen: string[] = [];
  const mockFetch: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    urlsSeen.push(url);
    return new Response(null, { status: 200, headers: { 'Content-Range': '0-0/0' } });
  };

  for (const rawUrl of [
    '"https://xahsyugciihrrnchufwo.supabase.co/"',
    'https://supabase.com/dashboard/project/xahsyugciihrrnchufwo/settings/general',
    'xahsyugciihrrnchufwo',
    'xahsyugciihrrnchufwo.supabase.co',
    '   ',
  ]) {
    const res = await handleSyncApiRequest(
      new Request('https://eternalblue.workers.dev/api/sync/status'),
      { SUPABASE_URL: rawUrl, SUPABASE_SERVICE_ROLE_KEY: 'test-key' },
      { runtime: 'cloudflare-worker' },
      mockFetch,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { projectUrl: string; projectRef: string; schemaReady: boolean };
    assert.equal(body.projectRef, 'xahsyugciihrrnchufwo');
    assert.equal(body.projectUrl, 'https://xahsyugciihrrnchufwo.supabase.co');
    assert.equal(body.schemaReady, true);
  }
  assert.equal(urlsSeen.every((u) => u.startsWith('https://xahsyugciihrrnchufwo.supabase.co/')), true);
});

test('handleSyncApiRequest accepts SUPABASE_SECRET_KEY and SUPABASE_KEY aliases', async () => {
  const okFetch: typeof fetch = async () =>
    new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });

  for (const env of [
    { SUPABASE_URL: 'https://xahsyugciihrrnchufwo.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' },
    { SUPABASE_URL: 'https://xahsyugciihrrnchufwo.supabase.co', SUPABASE_KEY: 'test_key' },
  ]) {
    const res = await handleSyncApiRequest(
      new Request('https://eternalblue.workers.dev/api/sync/status'),
      env,
      { runtime: 'cloudflare-worker' },
      okFetch,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { configured: boolean; schemaReady: boolean };
    assert.equal(body.configured, true);
    assert.equal(body.schemaReady, true);
  }
});

test('sanitizeSettingsForSync and mergeSettingsFromCloud keep syncStoreId and syncEnabled strictly per-device', () => {
  const local: StoreSettings = {
    ...DEFAULT_SETTINGS,
    syncStoreId: 'tablet-a1b2c3d4',
    syncStoreIdCustomized: true,
    syncEnabled: false,
  };

  const sanitized = sanitizeSettingsForSync(local);
  assert.equal('syncStoreId' in sanitized, false);
  assert.equal('syncStoreIdCustomized' in sanitized, false);
  assert.equal('syncEnabled' in sanitized, false);

  const merged = mergeSettingsFromCloud(
    local,
    {
      storeName: 'Remote Name',
      syncStoreId: 'pc-99999999',
      syncEnabled: true,
    },
    'pull',
  );
  assert.equal(merged.syncStoreId, 'tablet-a1b2c3d4');
  assert.equal(merged.syncEnabled, false);
});

test('handleSyncApiRequest flags anon/publishable keys on /api/sync/status before writes hit RLS', async () => {
  const okFetch: typeof fetch = async () =>
    new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
  const anonJwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ role: 'anon' })}.sig`;
  const serviceJwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ role: 'service_role' })}.sig`;

  for (const key of ['sb_publishable_demo123', anonJwt]) {
    const res = await handleSyncApiRequest(
      new Request('https://eternalblue.workers.dev/api/sync/status'),
      { SUPABASE_URL: 'https://xahsyugciihrrnchufwo.supabase.co', SUPABASE_KEY: key },
      { runtime: 'cloudflare-worker' },
      okFetch,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      configured: boolean;
      schemaReady: boolean;
      keyRole?: string;
      error?: string;
    };
    assert.equal(body.configured, true);
    assert.equal(body.schemaReady, false);
    assert.equal(body.keyRole, 'anon');
    assert.equal(Boolean(body.error?.includes('Row Level Security')), true);
  }

  for (const key of ['sb_secret_demo123', serviceJwt]) {
    const res = await handleSyncApiRequest(
      new Request('https://eternalblue.workers.dev/api/sync/status'),
      { SUPABASE_URL: 'https://xahsyugciihrrnchufwo.supabase.co', SUPABASE_SERVICE_ROLE_KEY: key },
      { runtime: 'cloudflare-worker' },
      okFetch,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { configured: boolean; schemaReady: boolean; keyRole?: string };
    assert.equal(body.configured, true);
    assert.equal(body.schemaReady, true);
    assert.equal(body.keyRole, 'service');
  }
});

test('handleSyncApiRequest /api/sync/push deduplicates duplicate IDs to avoid Postgres 21000 ON CONFLICT errors', async () => {
  const upsertedByTable = new Map<string, number>();
  const mockFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const match = url.match(/\/rest\/v1\/(pos_[a-z_]+)/);
    const table = match?.[1] || 'unknown';
    if (init?.method === 'POST' && init.body) {
      const parsed = JSON.parse(String(init.body)) as unknown;
      if (Array.isArray(parsed)) {
        upsertedByTable.set(table, parsed.length);
      }
      return new Response(null, { status: 201 });
    }
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const res = await handleSyncApiRequest(
    new Request('https://eternalblue.workers.dev/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: 'pc-dedup01',
        products: [sampleProduct('p1', { stock: 5 }), sampleProduct('p1', { stock: 9 })],
        sales: [sampleSale('OR-1'), sampleSale('OR-1')],
        heldOrders: [
          { id: 'H-1', time: '10:00', items: [], total: 10 },
          { id: 'H-1', time: '10:01', items: [], total: 20 },
        ],
        stockLog: [
          {
            id: 'L-1',
            dateIso: '2026-11-18T10:00:00.000Z',
            productId: 'p1',
            productName: 'Product p1',
            delta: 1,
            prevStock: 4,
            newStock: 5,
            reason: 'Restock',
          },
          {
            id: 'L-1',
            dateIso: '2026-11-18T10:00:00.000Z',
            productId: 'p1',
            productName: 'Product p1',
            delta: 4,
            prevStock: 5,
            newStock: 9,
            reason: 'Restock',
          },
        ],
        settings: { storeName: 'Dedup Store' },
      }),
    }),
    { SUPABASE_URL: 'https://xahsyugciihrrnchufwo.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' },
    { runtime: 'cloudflare-worker' },
    mockFetch,
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean };
  assert.equal(body.ok, true);
  assert.equal(upsertedByTable.get('pos_products'), 1);
  assert.equal(upsertedByTable.get('pos_sales'), 1);
  assert.equal(upsertedByTable.get('pos_held_orders'), 1);
  assert.equal(upsertedByTable.get('pos_stock_logs'), 1);
});
