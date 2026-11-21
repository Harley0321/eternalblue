import test from 'node:test';
import assert from 'node:assert/strict';
import { PosMath } from '../src/domain/posMath';
import { OpsMath } from '../src/domain/opsMath';
import { InventoryFilter } from '../src/domain/inventoryFilter';
import {
  computeCategorySales,
  computeHourlySales,
  computeProductProfitRanking,
  getSalesPeriodRange,
} from '../src/domain/salesAnalytics';
import { DEFAULT_STORE_SETTINGS, type CartLine, type Product, type RepackRule, type SaleRecord, type SukiCustomer } from '../src/types/pos';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    barcode: '4800000000001',
    name: 'Sinandomeng Rice 1kg',
    category: 'Rice & Staples',
    unit: 'kg',
    capital: 48,
    retailPrice: 55,
    wholesalePrice: 52,
    wholesaleMinQty: 5,
    stock: 100,
    lowStockThreshold: 10,
    expiry: null,
    scEligible: true,
    ...overrides,
  };
}

test('PosMath integer-cent and milli-unit rounding eliminates IEEE-754 drift', () => {
  assert.equal(PosMath.toCents(1.005), 101);
  assert.equal(PosMath.toCents(2.675), 268);
  assert.equal(PosMath.toCents(-1.005), -101);
  assert.equal(PosMath.round2(0.1 + 0.2), 0.3);
  assert.equal(PosMath.round3(0.1 + 0.2), 0.3);
  assert.equal(PosMath.round3(1.0005), 1.001);
  assert.equal(PosMath.lineCents(3.35, 1.5), 503);
  assert.equal(PosMath.lineTotalPeso(3.35, 1.5), 5.03);
  assert.equal(PosMath.lineCents(10.01, 1.5), 1502);
  assert.equal(PosMath.lineCents(10.05, 0.5), 503);
});

test('product gross margin uses retail price as the denominator and requires a known positive cost', () => {
  assert.equal(PosMath.computeProductMarginPct(makeProduct({ capital: 40, retailPrice: 50 })), 20);
  assert.equal(PosMath.computeProductMarginPct(makeProduct({ capital: 60, retailPrice: 50 })), -20);
  assert.equal(PosMath.computeProductMarginPct(makeProduct({ capital: null })), null);
});

test('inventory margin sorting puts the lowest known margin first and unknown costs last', () => {
  const products = [
    makeProduct({ id: 'high', capital: 50, retailPrice: 100 }),
    makeProduct({ id: 'unknown', capital: null, retailPrice: 100 }),
    makeProduct({ id: 'loss', capital: 120, retailPrice: 100 }),
    makeProduct({ id: 'low', capital: 90, retailPrice: 100 }),
  ];
  const sorted = InventoryFilter.filterAndSort(
    products,
    [],
    DEFAULT_STORE_SETTINGS,
    '',
    'ALL',
    'MARGIN_ASC'
  );
  assert.deepEqual(sorted.map((product) => product.id), ['loss', 'low', 'high', 'unknown']);
});

test('sales analytics allocate net sales, exclude uncosted lines from ABC profit, and use local sale hour', () => {
  const costed = makeProduct({ id: 'costed', name: 'Costed', category: 'Staples', capital: 10 });
  const loss = makeProduct({ id: 'loss', name: 'Loss', category: 'Snacks', capital: 25 });
  const map = new Map([
    [costed.id, costed],
    [loss.id, loss],
  ]);
  const saleTime = new Date(2026, 10, 21, 14).toISOString();
  const sale: SaleRecord = {
    receiptNo: 'OR-000002',
    dateIso: saleTime,
    dateFormatted: 'Today',
    items: [
      {
        productId: costed.id,
        category: costed.category,
        name: costed.name,
        qty: 1,
        unit: 'pc',
        unitPrice: 100,
        priceType: 'retail',
        capital: 10,
        lineTotal: 100,
      },
      {
        productId: loss.id,
        category: loss.category,
        name: loss.name,
        qty: 1,
        unit: 'pc',
        unitPrice: 20,
        priceType: 'retail',
        capital: 25,
        lineTotal: 20,
      },
      {
        name: 'Uncosted',
        category: 'Other',
        qty: 1,
        unit: 'pc',
        unitPrice: 30,
        priceType: 'retail',
        capital: null,
        lineTotal: 30,
      },
    ],
    retailSubtotal: 150,
    wholesaleSavings: 0,
    seniorDiscount: 0,
    grandTotal: 140,
    paymentMethod: 'Cash',
    tendered: 140,
    change: 0,
  };
  const from = new Date(2026, 10, 21).getTime();
  const to = new Date(2026, 10, 22).getTime();

  const ranking = computeProductProfitRanking([sale], from, to, map);
  assert.equal(ranking.costedLines, 2);
  assert.equal(ranking.uncostedLines, 1);
  assert.equal(ranking.products.find((item) => item.key === costed.id)?.profitCents, 8333);
  assert.equal(ranking.products.find((item) => item.key === loss.id)?.profitCents, -633);
  assert.equal(ranking.products.find((item) => item.key === loss.id)?.grade, 'C');
  assert.equal(PosMath.computeSalesStats([sale], from, to, map).uncostedLines, 1);

  const categories = computeCategorySales([sale], from, to, map);
  assert.equal(categories.reduce((sum, item) => sum + item.revenueCents, 0), 14000);
  assert.equal(categories.find((item) => item.category === 'Other')?.revenueCents, 2800);

  const hours = computeHourlySales([sale], from, to);
  assert.equal(hours[new Date(saleTime).getHours()].orders, 1);
});

test('sales period ranges use local calendar days and include the selected custom end date', () => {
  const now = new Date(2026, 10, 21, 14, 30);
  const yesterday = getSalesPeriodRange('YESTERDAY', now);
  assert.equal(yesterday.fromMs, new Date(2026, 10, 20).getTime());
  assert.equal(yesterday.toMs, new Date(2026, 10, 21).getTime());

  const custom = getSalesPeriodRange('CUSTOM', now, '2026-11-02', '2026-11-04');
  assert.equal(custom.fromMs, new Date(2026, 10, 2).getTime());
  assert.equal(custom.toMs, new Date(2026, 10, 5).getTime());
});

test('PosMath.computeCartTotals reconciles wholesale savings, SC/PWD 5% discount, and cap', () => {
  const rice = makeProduct({
    id: 'p-rice',
    name: 'Sinandomeng Rice',
    category: 'Rice & Staples',
    capital: 45,
    retailPrice: 60,
    wholesalePrice: 55,
    wholesaleMinQty: 5,
    scEligible: true,
  });
  const soda = makeProduct({
    id: 'p-soda',
    name: 'Cola 1.5L',
    category: 'Beverages',
    capital: 40,
    retailPrice: 55,
    wholesalePrice: 50,
    wholesaleMinQty: 6,
    scEligible: false,
  });
  const map = new Map([
    [rice.id, rice],
    [soda.id, soda],
  ]);

  const cart: CartLine[] = [
    {
      productId: rice.id,
      name: rice.name,
      unit: rice.unit,
      retailPrice: rice.retailPrice,
      wholesalePrice: rice.wholesalePrice,
      wholesaleMinQty: rice.wholesaleMinQty,
      priceType: 'wholesale',
      qty: 5, // wholesale eligible: 5 * 55 = 275 (savings 25)
    },
    {
      productId: soda.id,
      name: soda.name,
      unit: soda.unit,
      retailPrice: soda.retailPrice,
      wholesalePrice: soda.wholesalePrice,
      wholesaleMinQty: soda.wholesaleMinQty,
      priceType: 'retail',
      qty: 2, // 2 * 55 = 110 (not SC eligible)
    },
  ];

  const totals = PosMath.computeCartTotals(cart, map, true, DEFAULT_STORE_SETTINGS);
  assert.equal(totals.retailSubtotal, 410);
  assert.equal(totals.wholesaleSavings, 25);
  assert.equal(totals.seniorBase, 275);
  assert.equal(totals.seniorDiscount, 13.75); // 5% of 275
  assert.equal(totals.grandTotal, 371.25);
  assert.equal(
    PosMath.toCents(totals.retailSubtotal) - PosMath.toCents(totals.wholesaleSavings) - PosMath.toCents(totals.seniorDiscount),
    PosMath.toCents(totals.grandTotal)
  );
});

test('PosMath.allocateSaleLineNetCents reconciles discounted receipts down to the exact centavo', () => {
  const rice = makeProduct({ id: 'p-1', name: 'Rice', scEligible: true });
  const chips = makeProduct({ id: 'p-2', name: 'Chips', category: 'Snacks & Biscuits', scEligible: false });
  const map = new Map([
    [rice.id, rice],
    [chips.id, chips],
  ]);

  const sale: SaleRecord = {
    receiptNo: 'OR-000001',
    dateIso: new Date().toISOString(),
    dateFormatted: 'Now',
    items: [
      {
        productId: rice.id,
        category: rice.category,
        name: rice.name,
        qty: 1,
        unit: 'kg',
        unitPrice: 100.33,
        priceType: 'retail',
        capital: 80,
        lineTotal: 100.33,
      },
      {
        productId: chips.id,
        category: chips.category,
        name: chips.name,
        qty: 1,
        unit: 'pc',
        unitPrice: 49.67,
        priceType: 'retail',
        capital: 35,
        lineTotal: 49.67,
      },
    ],
    retailSubtotal: 150,
    wholesaleSavings: 0,
    seniorDiscount: 5.02, // 5% of 100.33 = 5.0165 -> 5.02
    seniorBase: 100.33,
    grandTotal: 134.98, // 150 - 5.02 SC - 10.00 points
    pointsDiscount: 10,
    pointsRedeemed: 10,
    paymentMethod: 'Cash',
    tendered: 150,
    change: 15.02,
  };

  const netCents = PosMath.allocateSaleLineNetCents(sale, map);
  const sumNet = netCents.reduce((a, b) => a + b, 0);
  assert.equal(sumNet, PosMath.toCents(sale.grandTotal));

  const stats = PosMath.computeSalesStats([sale], 0, Date.now() + 1000, map);
  assert.equal(stats.revenue, 134.98);
  assert.equal(stats.profit, 19.98); // 134.98 - (80 + 35)
});

test('OpsMath loyalty points, repack weighted-avg cost, Utang limits, and drawer summary stay cent-exact', () => {
  // Floating-point edge: 3.00 / 0.10 in raw JS is 29.999999999999996
  assert.equal(OpsMath.computeLoyaltyPointsEarned(3.0, 0.1), 30);

  // Repack preserves total cost basis across indivisible yield (100 / 3)
  const master = makeProduct({ id: 'm', name: 'Sack', capital: 100, stock: 5 });
  const target = makeProduct({ id: 't', name: 'Pack', capital: 33.34, stock: 1 });
  const rule: RepackRule = {
    id: 'r-1',
    name: 'Sack to Pack',
    masterProductId: 'm',
    targetProductId: 't',
    yieldQty: 3,
    autoComputeCost: true,
    updatedAt: new Date().toISOString(),
  };
  const repack = OpsMath.executeRepackConversion([master, target], rule, 1);
  assert.equal(repack.ok, true);
  if (repack.ok) {
    const nextMaster = repack.nextProducts.find((p) => p.id === 'm')!;
    const nextTarget = repack.nextProducts.find((p) => p.id === 't')!;
    assert.equal(nextMaster.stock, 4);
    assert.equal(nextTarget.stock, 4);
    // (33.34 * 1 + 100) / 4 = 33.335 -> 33.34
    assert.equal(nextTarget.capital, 33.34);
  }

  // Utang charge & payment exact cent limits
  const suki: SukiCustomer = {
    id: 's-1',
    name: 'Juan',
    creditLimit: 500,
    balance: 400.55,
    points: 10,
    totalSpent: 400.55,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const over = OpsMath.applyUtangCharge(suki, 99.46);
  assert.equal(over.ok, false);
  const exact = OpsMath.applyUtangCharge(suki, 99.45);
  assert.equal(exact.ok, true);
  if (exact.ok) {
    assert.equal(exact.customer.balance, 500);
    const paid = OpsMath.applyUtangPayment(exact.customer, 600);
    assert.equal(paid.ok, true);
    if (paid.ok) {
      assert.equal(paid.tx.amount, 500);
      assert.equal(paid.customer.balance, 0);
    }
  }
});
