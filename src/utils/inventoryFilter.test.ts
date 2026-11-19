import test from 'node:test';
import assert from 'node:assert/strict';
import type { Product, SaleRecord } from '../types';
import {
  buildDefaultCatalog,
  computeProductVelocities,
  computeStockHealthSummary,
  parseInventoryCsv,
} from './posMath';
import {
  applyCsvImportToCatalog,
  buildExpiryStatusMap,
  filterAndSortInventory,
  matchesInventorySearch,
} from './inventoryFilter';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'SKU-TEST',
    barcode: '004800016644801',
    name: 'Test Item',
    category: 'Beverages',
    unit: 'pc',
    retailPrice: 50,
    wholesalePrice: 45,
    wholesaleMinQty: 6,
    stock: 20,
    ...overrides,
  };
}

test('matchesInventorySearch handles leading-zero barcodes and cashier qty*barcode syntax', () => {
  const item = makeProduct({ name: 'Coca-Cola 1.5L', barcode: '04800024556011' });

  assert.equal(matchesInventorySearch(item, '4800024556011'), true);
  assert.equal(matchesInventorySearch(item, '5*4800024556011'), true);
  assert.equal(matchesInventorySearch(item, 'coca'), true);
  assert.equal(matchesInventorySearch(item, 'beverages'), true);
  assert.equal(matchesInventorySearch(item, 'missing-sku'), false);
});

test('filterAndSortInventory applies per-product lowStockThreshold, status filters, and sorts accurately', () => {
  const products: Product[] = [
    makeProduct({ id: 'A', name: 'Alpha', stock: 25, retailPrice: 100, wholesalePrice: 90, lowStockThreshold: 30, capital: 80 }),
    makeProduct({ id: 'B', name: 'Beta', stock: 0, retailPrice: 50, wholesalePrice: 0, capital: 60 }),
    makeProduct({ id: 'C', name: 'Gamma', stock: 12, retailPrice: 40, wholesalePrice: 0, capital: 0, expiry: '2020-01-01' }),
    makeProduct({ id: 'D', name: 'Delta', stock: 5, retailPrice: 200, wholesalePrice: 180, capital: 150 }),
  ];

  const now = new Date('2026-11-19T10:00:00.000Z');
  const sales: SaleRecord[] = [
    {
      receiptNo: 'OR-1',
      dateIso: '2026-11-18T10:00:00.000Z',
      dateFormatted: 'Nov 18',
      items: [{ productId: 'D', name: 'Delta', unit: 'pc', qty: 10, priceType: 'retail', unitPrice: 200, lineTotal: 2000 }],
      retailSubtotal: 2000,
      wholesaleSavings: 0,
      seniorDiscount: 0,
      grandTotal: 2000,
      paymentMethod: 'Cash',
      tendered: 2000,
      change: 0,
    },
  ];

  const vel = computeProductVelocities(products, sales, now.getTime());
  const expMap = buildExpiryStatusMap(products, 30, now);

  const lowOnly = filterAndSortInventory({
    products,
    searchQuery: '',
    stockFilter: 'LOW',
    selectedCategory: 'All',
    sortBy: 'stock-asc',
    lowStockThreshold: 10,
    coverWarnDays: 5,
    expiryMap: expMap,
    velocityById: vel.byId,
  });
  assert.deepEqual(lowOnly.map((p) => p.id), ['D', 'A']);

  const outOnly = filterAndSortInventory({
    products,
    searchQuery: '',
    stockFilter: 'OUT',
    selectedCategory: 'All',
    sortBy: 'default',
    lowStockThreshold: 10,
    coverWarnDays: 5,
    expiryMap: expMap,
    velocityById: vel.byId,
  });
  assert.deepEqual(outOnly.map((p) => p.id), ['B']);

  const lossOnly = filterAndSortInventory({
    products,
    searchQuery: '',
    stockFilter: 'LOSS',
    selectedCategory: 'All',
    sortBy: 'default',
    lowStockThreshold: 10,
    coverWarnDays: 5,
    expiryMap: expMap,
    velocityById: vel.byId,
  });
  assert.deepEqual(lossOnly.map((p) => p.id), ['B']);

  const expiredOnly = filterAndSortInventory({
    products,
    searchQuery: '',
    stockFilter: 'EXPIRED',
    selectedCategory: 'All',
    sortBy: 'default',
    lowStockThreshold: 10,
    coverWarnDays: 5,
    expiryMap: expMap,
    velocityById: vel.byId,
  });
  assert.deepEqual(expiredOnly.map((p) => p.id), ['C']);

  const healthReuse = computeStockHealthSummary(
    products,
    sales,
    { lowStockThreshold: 10, expiryWarnDays: 30, reorderLeadDays: 3, reorderSafetyDays: 2 },
    now,
    vel,
  );
  const healthFresh = computeStockHealthSummary(
    products,
    sales,
    { lowStockThreshold: 10, expiryWarnDays: 30, reorderLeadDays: 3, reorderSafetyDays: 2 },
    now,
  );
  assert.deepEqual(healthReuse, healthFresh);
});

test('parseInventoryCsv uses indexed barcode matching and supports Low Alert threshold column', () => {
  const catalog = buildDefaultCatalog();
  const csv = [
    'Barcode,Name,Category,Unit,Capital,Retail Price,Stock,Low Alert',
    `${catalog[0].barcode},${catalog[0].name},${catalog[0].category},${catalog[0].unit},150,195,22,25`,
    '4809998887771,New Vinegar 1L,Condiments & Cooking,pc,32,45,18,6',
  ].join('\n');

  const parsed = parseInventoryCsv(csv, catalog);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].action, 'update');
  assert.equal(parsed.rows[0].data?.lowStockThreshold, 25);
  assert.equal(parsed.rows[1].action, 'create');
  assert.equal(parsed.rows[1].data?.lowStockThreshold, 6);
});

test('applyCsvImportToCatalog preserves catalog integrity when new rows precede updated rows', () => {
  const existing = [
    makeProduct({ id: 'SKU-1', barcode: '4800001', name: 'Coffee Twin', stock: 8, lowStockThreshold: 12 }),
    makeProduct({ id: 'SKU-2', barcode: '4800002', name: 'Hotdog 1kg', stock: 30 }),
  ];
  const csv = [
    'Barcode,Name,Category,Unit,Capital,Retail Price,Stock,Low Alert',
    '4809999,Tuna 155g,Canned & Noodles,pc,20,28,15,20',
    '4800002,Hotdog 1kg,Frozen Meat,pack,150,195,35,12',
  ].join('\n');

  const parsed = parseInventoryCsv(csv, existing);
  assert.equal(parsed.error, undefined);
  const applied = applyCsvImportToCatalog(existing, parsed.rows, 'merge', '2026-11-19T12:00:00.000Z', 1000);

  assert.equal(applied.created, 1);
  assert.equal(applied.updated, 1);
  assert.equal(applied.nextProducts.length, 3);
  assert.ok(applied.nextProducts.some((p) => p.id === 'SKU-1' && p.name === 'Coffee Twin' && p.stock === 8));
  assert.ok(applied.nextProducts.some((p) => p.id === 'SKU-2' && p.stock === 35 && p.lowStockThreshold === 12));
  assert.ok(applied.nextProducts.some((p) => p.name === 'Tuna 155g' && p.stock === 15 && p.lowStockThreshold === 20));
  assert.deepEqual(
    applied.newLogs.map((l) => [l.productName, l.prevStock, l.newStock, l.delta]),
    [
      ['Tuna 155g', 0, 15, 15],
      ['Hotdog 1kg', 30, 35, 5],
    ],
  );
});
