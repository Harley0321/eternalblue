import test from 'node:test';
import assert from 'node:assert/strict';
import type { Product } from '../types';
import {
  buildStockAlertNotificationPayload,
  computeLowStockAlerts,
  detectNewlyLowStockProducts,
  getEffectiveLowStockThreshold,
  isProductLowStock,
} from './stockAlerts';

function makeProduct(overrides: Partial<Product> & { id: string; name: string }): Product {
  return {
    barcode: '480000000001',
    category: 'Beverages',
    unit: 'pc',
    retailPrice: 25,
    wholesalePrice: 22,
    wholesaleMinQty: 6,
    stock: 20,
    ...overrides,
  };
}

test('getEffectiveLowStockThreshold honors per-product override and global fallback including 0', () => {
  assert.equal(getEffectiveLowStockThreshold({ lowStockThreshold: undefined }, 10), 10);
  assert.equal(getEffectiveLowStockThreshold({ lowStockThreshold: 5 }, 10), 5);
  assert.equal(getEffectiveLowStockThreshold({ lowStockThreshold: 0 }, 10), 0);
  assert.equal(getEffectiveLowStockThreshold({ lowStockThreshold: undefined }, 0), 0);
  assert.equal(getEffectiveLowStockThreshold({ lowStockThreshold: -2 }, 12), 12);
});

test('isProductLowStock and computeLowStockAlerts respect per-product and global thresholds', () => {
  const products: Product[] = [
    makeProduct({ id: '1', name: 'Healthy Item', stock: 15 }),
    makeProduct({ id: '2', name: 'Global Low Item', stock: 8 }),
    makeProduct({ id: '3', name: 'Custom Low Item', stock: 18, lowStockThreshold: 20 }),
    makeProduct({ id: '4', name: 'Out Item', stock: 0 }),
    makeProduct({ id: '5', name: 'Custom Tight Threshold', stock: 4, lowStockThreshold: 3 }),
  ];

  assert.equal(isProductLowStock(products[0], 10), false);
  assert.equal(isProductLowStock(products[1], 10), true);
  assert.equal(isProductLowStock(products[2], 10), true);
  assert.equal(isProductLowStock(products[3], 10), true);
  assert.equal(isProductLowStock(products[4], 10), false);

  const summary = computeLowStockAlerts(products, 10);
  assert.equal(summary.lowCount, 2);
  assert.equal(summary.outCount, 1);
  assert.equal(summary.totalAlertCount, 3);
  assert.deepEqual(
    summary.lowStockItems.map((p) => p.id),
    ['2', '3'],
  );
  assert.deepEqual(
    summary.outOfStockItems.map((p) => p.id),
    ['4'],
  );
});

test('detectNewlyLowStockProducts triggers only on threshold crossing or hitting out-of-stock', () => {
  const prev: Product[] = [
    makeProduct({ id: 'A', name: 'Coke 1.5L', stock: 12 }),
    makeProduct({ id: 'B', name: 'Milo 300g', stock: 5 }), // already low
    makeProduct({ id: 'C', name: 'Sugar 1kg', stock: 3 }), // already low, will hit 0
  ];

  const next: Product[] = [
    makeProduct({ id: 'A', name: 'Coke 1.5L', stock: 9 }), // crossed below 10 -> trigger!
    makeProduct({ id: 'B', name: 'Milo 300g', stock: 4 }), // was already low (>0) -> no duplicate spam
    makeProduct({ id: 'C', name: 'Sugar 1kg', stock: 0 }), // dropped to 0 -> trigger!
    makeProduct({ id: 'D', name: 'New Low SKU', stock: 2 }), // newly added low -> trigger!
    makeProduct({ id: 'E', name: 'New Healthy SKU', stock: 50 }), // healthy -> ignore
  ];

  const triggered = detectNewlyLowStockProducts(prev, next, 10);
  assert.deepEqual(
    triggered.map((p) => p.id),
    ['A', 'C', 'D'],
  );

  const thresholdRaised = detectNewlyLowStockProducts(prev, prev, 15, 10);
  assert.deepEqual(
    thresholdRaised.map((p) => p.id),
    ['A'],
  );
});

test('buildStockAlertNotificationPayload formats single, multi, and out-of-stock summaries', () => {
  const single = buildStockAlertNotificationPayload(
    [makeProduct({ id: '1', name: 'Milo 300g', unit: 'pack', stock: 4 })],
    10,
    'EternalBlue Mart',
  );
  assert.equal(single.title, 'Low Stock Alert · EternalBlue Mart');
  assert.match(single.body, /Milo 300g \(4 pack left, min 10\)/);
  assert.equal(single.itemsCount, 1);

  const outOnly = buildStockAlertNotificationPayload(
    [makeProduct({ id: '2', name: 'Piattos 85g', unit: 'pc', stock: 0 })],
    10,
    'EternalBlue Mart',
  );
  assert.equal(outOnly.title, 'Out of Stock Alert · EternalBlue Mart');
  assert.match(outOnly.body, /OUT OF STOCK/);

  const multi = buildStockAlertNotificationPayload(
    [
      makeProduct({ id: '1', name: 'Item 1', stock: 3 }),
      makeProduct({ id: '2', name: 'Item 2', stock: 0 }),
      makeProduct({ id: '3', name: 'Item 3', stock: 5 }),
      makeProduct({ id: '4', name: 'Item 4', stock: 1 }),
    ],
    10,
    'EternalBlue Mart',
  );
  assert.match(multi.body, /4 products need restock/);
  assert.match(multi.body, /\+1 more/);
});
