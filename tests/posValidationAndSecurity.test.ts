import test from 'node:test';
import assert from 'node:assert/strict';
import { PosMath } from '../src/domain/posMath';
import {
  isSafeHttpUrl,
  reconcileCartWithProducts,
  sanitizeBackupPayload,
  validateCartStockForCheckout,
} from '../src/domain/posValidation';
import { SecurityManager } from '../src/security/securityManager';
import { DEFAULT_STORE_SETTINGS, type CartLine, type Product, type SaleRecord } from '../src/types/pos';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    barcode: '4800000000001',
    name: 'Sinandomeng Rice 1kg',
    category: 'Rice & Staples',
    unit: 'kg',
    capital: 45,
    retailPrice: 55,
    wholesalePrice: 50,
    wholesaleMinQty: 5,
    stock: 10,
    lowStockThreshold: 5,
    expiry: null,
    scEligible: true,
    ...overrides,
  };
}

function makeCartLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: 'p-1',
    name: 'Sinandomeng Rice 1kg',
    unit: 'kg',
    retailPrice: 55,
    wholesalePrice: 50,
    wholesaleMinQty: 5,
    priceType: 'retail',
    qty: 2,
    ...overrides,
  };
}

test('validateCartStockForCheckout rejects missing, zero-stock, and oversold items including milli-units', () => {
  const rice = makeProduct({ id: 'p-rice', name: 'Rice', stock: 2.5, unit: 'kg' });
  const map = new Map([[rice.id, rice]]);

  assert.equal(validateCartStockForCheckout([], map).ok, false);

  const deletedCheck = validateCartStockForCheckout([makeCartLine({ productId: 'p-gone', name: 'Old SKU' })], map);
  assert.equal(deletedCheck.ok, false);
  if (!deletedCheck.ok) assert.match(deletedCheck.error, /no longer in inventory/i);

  const zeroMap = new Map([[rice.id, { ...rice, stock: 0 }]]);
  const zeroCheck = validateCartStockForCheckout([makeCartLine({ productId: rice.id, qty: 1 })], zeroMap);
  assert.equal(zeroCheck.ok, false);
  if (!zeroCheck.ok) assert.match(zeroCheck.error, /out of stock/i);

  const overCheck = validateCartStockForCheckout([makeCartLine({ productId: rice.id, qty: 2.501 })], map);
  assert.equal(overCheck.ok, false);

  const exactCheck = validateCartStockForCheckout([makeCartLine({ productId: rice.id, qty: 2.5 })], map);
  assert.equal(exactCheck.ok, true);
});

test('reconcileCartWithProducts removes deleted SKUs, caps quantity to live stock, and refreshes automatic wholesale priceType', () => {
  const rice = makeProduct({
    id: 'p-1',
    name: 'Sinandomeng Rice (Updated)',
    retailPrice: 58,
    wholesalePrice: 52,
    wholesaleMinQty: 5,
    stock: 6,
  });
  const sugar = makeProduct({
    id: 'p-2',
    name: 'Sugar',
    retailPrice: 80,
    wholesalePrice: 72,
    wholesaleMinQty: 5,
    stock: 3,
  });

  const cart: CartLine[] = [
    makeCartLine({ productId: 'p-1', priceType: 'retail', qty: 8 }), // capped from 8 -> 6, stays wholesale (>=5)
    makeCartLine({ productId: 'p-2', priceType: 'wholesale', qty: 5 }), // capped from 5 -> 3, drops back to retail
    makeCartLine({ productId: 'p-deleted', name: 'Removed Item', qty: 2 }),
  ];

  const result = reconcileCartWithProducts(cart, [rice, sugar], 10);
  assert.deepEqual(result.removedNames, ['Removed Item']);
  assert.deepEqual(result.adjustedNames, ['Sinandomeng Rice (Updated)', 'Sugar']);
  assert.equal(result.nextCart.length, 2);

  assert.equal(result.nextCart[0].qty, 6);
  assert.equal(result.nextCart[0].priceType, 'wholesale');
  assert.equal(result.nextCart[0].retailPrice, 58);

  assert.equal(result.nextCart[1].qty, 3);
  assert.equal(result.nextCart[1].priceType, 'retail');
});

test('sanitizeBackupPayload validates JSON backups, strips prototype-pollution keys, clamps bounds, and isolates PINs', () => {
  assert.equal(sanitizeBackupPayload('').ok, false);
  assert.equal(sanitizeBackupPayload('{not json').ok, false);
  assert.equal(sanitizeBackupPayload('{"products":[]}').ok, false);

  const maliciousPayload = JSON.stringify({
    __proto__: { polluted: true },
    constructor: { prototype: { polluted: true } },
    products: [
      {
        id: 'p-1',
        barcode: '4800000000001',
        name: 'Kape\u0007 3-in-1',
        category: 'Beverages',
        unit: 'pc',
        capital: -10,
        retailPrice: 12.345,
        wholesalePrice: -5,
        wholesaleMinQty: 0,
        stock: -3,
      },
      {
        id: 'p-bad',
        name: 'Zero Price Bad',
        retailPrice: 0,
        stock: 5,
      },
    ],
    sales: [],
    settings: {
      ...DEFAULT_STORE_SETTINGS,
      storeName: 'Sanitized Store',
      githubRepo: 'https://evil.example/repo?x=1',
      scDiscountCap: -50,
      lowStockThreshold: 0,
      defaultWholesaleMinQty: -2,
      adminPinHash: 'attacker-hash',
      adminPinSalt: 'attacker-salt',
      adminPinIter: 1,
    },
    cashiers: [{ id: 'c1', name: 'Maria', role: 'cashier', pinHash: 'secret' }],
  });

  const res = sanitizeBackupPayload(maliciousPayload);
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.equal(Object.prototype.hasOwnProperty.call(res.payload, '__proto__'), false);
  assert.equal(res.payload.products.length, 1);
  assert.equal(res.payload.products[0].name, 'Kape 3-in-1');
  assert.equal(res.payload.products[0].capital, null);
  assert.equal(res.payload.products[0].retailPrice, 12.35);
  assert.equal(res.payload.products[0].wholesalePrice, 12.35);
  assert.equal(res.payload.products[0].stock, 0);

  assert.equal(res.payload.settings.githubRepo, DEFAULT_STORE_SETTINGS.githubRepo);
  assert.equal(res.payload.settings.scDiscountCap, DEFAULT_STORE_SETTINGS.scDiscountCap);
  assert.equal(res.payload.settings.lowStockThreshold, DEFAULT_STORE_SETTINGS.lowStockThreshold);
  assert.equal(res.payload.settings.defaultWholesaleMinQty, DEFAULT_STORE_SETTINGS.defaultWholesaleMinQty);
  assert.equal(res.payload.settings.adminPinHash, null);
  assert.equal(res.payload.settings.adminPinSalt, null);
  assert.equal('pinHash' in (res.payload.cashiers?.[0] ?? {}), false);
  assert.deepEqual(res.payload.repackLog, []);
});

test('isSafeHttpUrl allows only http/https schemes and rejects dangerous schemes', () => {
  assert.equal(isSafeHttpUrl('https://github.com/Harley0321/eternalblue/releases/latest'), true);
  assert.equal(isSafeHttpUrl('http://localhost:3000'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeHttpUrl('file:///etc/passwd'), false);
  assert.equal(isSafeHttpUrl('   '), false);
  assert.equal(isSafeHttpUrl(null), false);
});

test('SecurityManager rejects weak/repeated PINs and blocks PBKDF2 iteration downgrades', async () => {
  assert.equal(SecurityManager.isPinWeak('0000'), true);
  assert.equal(SecurityManager.isPinWeak('9999'), true);
  assert.equal(SecurityManager.isPinWeak('0123'), true);
  assert.equal(SecurityManager.isPinWeak('9876'), true);
  assert.equal(SecurityManager.isPinWeak('777777'), true);
  assert.equal(SecurityManager.isPinWeak('2580'), false);
  assert.equal(SecurityManager.isPinWeak('849271'), false);

  const [hash, salt] = await SecurityManager.hashPin('849271');
  assert.equal(
    await SecurityManager.verifyPin('849271', hash, salt, SecurityManager.DEFAULT_PBKDF2_ITER),
    true
  );
  assert.equal(await SecurityManager.verifyPin('849271', hash, salt, 1000), false);
  assert.equal(await SecurityManager.verifyPin('849271', hash, salt, 99_999), false);
  assert.equal(await SecurityManager.verifyPin('849271', hash, salt, 1_000_001), false);
});

test('PosMath.nextReceiptNo handles prefixed years cleanly and avoids collisions', () => {
  const sales: SaleRecord[] = [
    {
      receiptNo: 'OR-2026-0005',
      dateIso: '2026-11-25T00:00:00.000Z',
      dateFormatted: 'Nov 25, 2026 08:00 AM',
      items: [],
      retailSubtotal: 0,
      wholesaleSavings: 0,
      seniorDiscount: 0,
      grandTotal: 0,
      paymentMethod: 'Cash',
      tendered: 0,
      change: 0,
    },
    {
      receiptNo: 'OR-000006',
      dateIso: '2026-11-25T00:01:00.000Z',
      dateFormatted: 'Nov 25, 2026 08:01 AM',
      items: [],
      retailSubtotal: 0,
      wholesaleSavings: 0,
      seniorDiscount: 0,
      grandTotal: 0,
      paymentMethod: 'Cash',
      tendered: 0,
      change: 0,
    },
  ];
  assert.equal(PosMath.nextReceiptNo(sales), 'OR-000007');
});
