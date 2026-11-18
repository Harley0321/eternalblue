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

test('buildGithubIntegrationBundleFiles outputs config.toml, migration SQL, seed.sql, and workflow', () => {
  const files = buildGithubIntegrationBundleFiles();
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  assert.equal(byPath.get('supabase/config.toml')?.includes('project_id = "xahsyugciihrrnchufwo"'), true);
  assert.equal(
    byPath.get('supabase/migrations/20261118000001_omnimart_pos_schema.sql')?.includes('create table if not exists public.pos_stores'),
    true,
  );
  assert.equal(byPath.get('.github/workflows/supabase-sync.yml')?.includes('supabase db push'), true);
  assert.equal(byPath.has('supabase/seed.sql'), true);
});

