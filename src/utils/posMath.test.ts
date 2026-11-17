import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultCatalog,
  computeCartTotals,
  computeProfitRanking,
  computeReorderList,
  computeSalesStats,
  DEFAULT_SETTINGS,
  eanCheckOk,
  escapeCsvCell,
  expiryInfo,
  extractGs1Gtin,
  findProductByBarcode,
  fromCents,
  getLinePrice,
  isStrongRead,
  lineCents,
  lineTotalPeso,
  nextReceiptNo,
  normBarcode,
  round2,
  saleProfitCalc,
  scEligibleProduct,
  scSuggest,
  sumPeso,
  toCents,
  validateBackupPayload,
  wholesaleBlock,
} from './posMath';
import { isWeakPin, safeEqual } from './pinSecurity';
import { OfflineAssistant } from './assistantEngine';
import type { CartLine, Product, SaleRecord } from '../types';

test('centavo math avoids floating point drift', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(round2(10.0 - 9.9), 0.1);
  assert.equal(lineCents(15.35, 0.333), 511);
  assert.equal(lineTotalPeso(15.35, 0.333), 5.11);
  assert.equal(sumPeso([0.1, 0.2, 0.3]), 0.6);
  assert.equal(fromCents(toCents(125.99) - toCents(125.0)), 0.99);
});

test('wholesale rules enforce valid discount, above-capital safety, and minQty', () => {
  const products: Product[] = [
    {
      id: 'P1',
      barcode: '480001',
      name: 'Canton',
      category: 'Canned & Noodles',
      unit: 'pc',
      capital: 12,
      retailPrice: 15,
      wholesalePrice: 13.5,
      wholesaleMinQty: 12,
      stock: 100,
    },
    {
      id: 'P2',
      barcode: '480002',
      name: 'BadWhsle',
      category: 'Beverages',
      unit: 'pc',
      capital: 50,
      retailPrice: 60,
      wholesalePrice: 45, // below capital!
      wholesaleMinQty: 6,
      stock: 20,
    },
  ];

  const lineBelowMin: CartLine = {
    productId: 'P1',
    name: 'Canton',
    unit: 'pc',
    retailPrice: 15,
    wholesalePrice: 13.5,
    wholesaleMinQty: 12,
    priceType: 'wholesale',
    qty: 5,
  };
  assert.equal(wholesaleBlock(lineBelowMin, products), 'qty');
  assert.equal(getLinePrice(lineBelowMin, products), 15);

  const lineAtMin = { ...lineBelowMin, qty: 12 };
  assert.equal(wholesaleBlock(lineAtMin, products), null);
  assert.equal(getLinePrice(lineAtMin, products), 13.5);

  const lineBelowCost: CartLine = {
    productId: 'P2',
    name: 'BadWhsle',
    unit: 'pc',
    retailPrice: 60,
    wholesalePrice: 45,
    wholesaleMinQty: 6,
    priceType: 'wholesale',
    qty: 10,
  };
  assert.equal(wholesaleBlock(lineBelowCost, products), 'cost');
  assert.equal(getLinePrice(lineBelowCost, products), 60);
});

test('Senior/PWD 5% applies only to eligible essentials and respects cap', () => {
  const products = buildDefaultCatalog();
  const rice = products.find((p) => p.name.includes('Sinandomeng'))!;
  const chips = products.find((p) => p.name.includes('Piattos'))!;

  assert.equal(scSuggest(rice), true);
  assert.equal(scSuggest(chips), false);
  assert.equal(scEligibleProduct({ ...chips, scEligible: true }), true);

  const cart: CartLine[] = [
    {
      productId: rice.id,
      name: rice.name,
      unit: rice.unit,
      retailPrice: rice.retailPrice,
      wholesalePrice: rice.wholesalePrice,
      wholesaleMinQty: rice.wholesaleMinQty,
      priceType: 'retail',
      qty: 10, // 10 * 54 = 540 -> 5% = 27.00
    },
    {
      productId: chips.id,
      name: chips.name,
      unit: chips.unit,
      retailPrice: chips.retailPrice,
      wholesalePrice: chips.wholesalePrice,
      wholesaleMinQty: chips.wholesaleMinQty,
      priceType: 'retail',
      qty: 2, // 2 * 39 = 78 -> NOT eligible
    },
  ];

  const totals = computeCartTotals(cart, products, true, DEFAULT_SETTINGS);
  assert.equal(totals.retailSubtotal, 618);
  assert.equal(totals.seniorBase, 540);
  assert.equal(totals.seniorDiscount, 27);
  assert.equal(totals.grandTotal, 591);
  assert.equal(totals.scKinds, 1);
  assert.equal(totals.scOtherLines, 1);

  // Test cap at 125
  const bigCart: CartLine[] = [{ ...cart[0], qty: 100 }]; // 5400 * 5% = 270 -> capped at 125
  const capped = computeCartTotals(bigCart, products, true, DEFAULT_SETTINGS);
  assert.equal(capped.seniorDiscount, 125);
  assert.equal(capped.seniorCapped, true);
});

test('profit calculation distributes SC/PWD discount only across eligible lines', () => {
  const products: Product[] = [
    {
      id: 'R1',
      barcode: '1',
      name: 'Rice',
      category: 'Rice & Staples',
      unit: 'kg',
      capital: 40,
      retailPrice: 50,
      wholesalePrice: 48,
      wholesaleMinQty: 25,
      stock: 100,
      scEligible: true,
    },
    {
      id: 'C1',
      barcode: '2',
      name: 'Cola',
      category: 'Beverages',
      unit: 'pc',
      capital: 40,
      retailPrice: 50,
      wholesalePrice: 48,
      wholesaleMinQty: 6,
      stock: 50,
      scEligible: false,
    },
  ];
  const sale: SaleRecord = {
    receiptNo: 'OR-261117-0001',
    dateIso: new Date().toISOString(),
    dateFormatted: 'now',
    items: [
      { productId: 'R1', name: 'Rice', qty: 2, unit: 'kg', unitPrice: 50, priceType: 'retail', capital: 40, lineTotal: 100 },
      { productId: 'C1', name: 'Cola', qty: 2, unit: 'pc', unitPrice: 50, priceType: 'retail', capital: 40, lineTotal: 100 },
    ],
    retailSubtotal: 200,
    wholesaleSavings: 0,
    seniorDiscount: 5, // 5% on 100 Rice
    grandTotal: 195,
    paymentMethod: 'Cash',
    tendered: 200,
    change: 5,
  };
  // Total rev 195, total capital 80+80 = 160 -> profit = 35
  assert.equal(saleProfitCalc(sale, undefined, products), 35);
  const { ranked } = computeProfitRanking([sale], products);
  const riceRank = ranked.find((r) => r.name === 'Rice')!;
  const colaRank = ranked.find((r) => r.name === 'Cola')!;
  assert.equal(round2(riceRank.profit), 15); // 95 - 80
  assert.equal(round2(colaRank.profit), 20); // 100 - 80
});

test('barcode validation, GS1 GTIN extraction, and expiry status work accurately', () => {
  assert.equal(normBarcode('04800016644801'), normBarcode('4800016644801'));
  assert.equal(eanCheckOk('4800016644801'), true);
  assert.equal(eanCheckOk('4800016644802'), false);
  assert.equal(isStrongRead('4800016644801', 'ean_13'), true);
  assert.equal(extractGs1Gtin('(01)04800016644801(17)271231'), '4800016644801');

  const catalog = buildDefaultCatalog();
  assert.ok(findProductByBarcode('04800016644801', catalog));

  const today = new Date(2026, 10, 17);
  assert.equal(expiryInfo({ expiry: '2026-11-17' }, 30, today).status, 'expired');
  assert.equal(expiryInfo({ expiry: '2026-11-25' }, 30, today).status, 'soon');
  assert.equal(expiryInfo({ expiry: '2027-05-01' }, 30, today).status, 'ok');
});

test('security helpers: weak PIN detection, safeEqual, CSV escaping, backup validation', () => {
  assert.equal(isWeakPin('1234'), true);
  assert.equal(isWeakPin('0000'), true);
  assert.equal(isWeakPin('4829'), false);
  assert.equal(safeEqual('4829', '4829'), true);
  assert.equal(safeEqual('4829', '4820'), false);
  assert.equal(escapeCsvCell('=CMD()'), '"\'=CMD()"');

  assert.equal(validateBackupPayload({ app: 'other' }).ok, false);
  const valid = validateBackupPayload({
    app: 'omnimart-ph-pos',
    version: 1,
    products: [{ id: 'SKU-1', name: 'Test' }],
    sales: [{ receiptNo: 'OR-1', items: [{ name: 'Test' }] }],
  });
  assert.equal(valid.ok, true);
});

test('offline AI assistant answers in English and Tagalog without mutating data', () => {
  const products = buildDefaultCatalog();
  const now = new Date(2026, 10, 17, 14, 0, 0);
  const sales: SaleRecord[] = [
    {
      receiptNo: nextReceiptNo([], now),
      dateIso: now.toISOString(),
      dateFormatted: 'now',
      items: [
        {
          productId: products[0].id,
          name: products[0].name,
          qty: 2,
          unit: 'pack',
          unitPrice: 195,
          priceType: 'retail',
          lineTotal: 390,
        },
      ],
      retailSubtotal: 390,
      wholesaleSavings: 0,
      seniorDiscount: 0,
      grandTotal: 390,
      paymentMethod: 'GCash',
      tendered: 390,
      change: 0,
    },
  ];

  const bot = new OfflineAssistant();
  const snapProducts = JSON.stringify(products);
  const snapSales = JSON.stringify(sales);

  const r1 = bot.ask("Today's sales", { products, sales, heldOrders: [], settings: DEFAULT_SETTINGS, now });
  assert.equal(r1.lang, 'en');
  assert.match(r1.text, /390\.00/);

  const r2 = bot.ask('magkano ang Milo', { products, sales, heldOrders: [], settings: DEFAULT_SETTINGS, now });
  assert.equal(r2.lang, 'tl');
  assert.match(r2.text, /Milo/);
  assert.match(r2.text, /108\.00/);

  const r3 = bot.ask('benta kahapon', { products, sales, heldOrders: [], settings: DEFAULT_SETTINGS, now });
  assert.equal(r3.lang, 'tl');
  assert.match(r3.text, /Wala pang naitalang benta/);

  assert.equal(JSON.stringify(products), snapProducts);
  assert.equal(JSON.stringify(sales), snapSales);
});

test('reorder suggestions calculate order quantities based on recent sales', () => {
  const products = buildDefaultCatalog();
  products[0].stock = 2;
  products[0].capital = 150;
  const now = Date.now();
  const sales: SaleRecord[] = [
    {
      receiptNo: 'OR-1',
      dateIso: new Date(now - 3600 * 1000).toISOString(),
      dateFormatted: 'now',
      items: [
        {
          productId: products[0].id,
          name: products[0].name,
          qty: 10,
          unit: 'pack',
          unitPrice: 195,
          priceType: 'retail',
          lineTotal: 1950,
        },
      ],
      retailSubtotal: 1950,
      wholesaleSavings: 0,
      seniorDiscount: 0,
      grandTotal: 1950,
      paymentMethod: 'Cash',
      tendered: 2000,
      change: 50,
    },
  ];
  const ro = computeReorderList(products, sales, DEFAULT_SETTINGS, now);
  assert.equal(ro.hasSales, true);
  assert.ok(ro.rows.some((r) => r.p.id === products[0].id));
  const stats = computeSalesStats(sales, products);
  assert.equal(stats.net, 1950);
});

test('config snapshot strips PIN secrets and diffs changed settings cleanly', async () => {
  const { sanitizeConfigForSnapshot, diffConfigFields } = await import('./posMath');
  const s1 = {
    ...DEFAULT_SETTINGS,
    adminPin: '2468',
    adminPinHash: 'hash-abc',
    adminPinSalt: 'salt-xyz',
  };
  const snap1 = sanitizeConfigForSnapshot(s1);
  assert.equal('adminPin' in snap1, false);
  assert.equal('adminPinHash' in snap1, false);
  const snap2 = sanitizeConfigForSnapshot({
    ...s1,
    storeName: 'Tindahan ni Maria',
    receiptWidth: '58mm',
  });
  const changed = diffConfigFields(snap1, snap2);
  assert.deepEqual(changed, ['storeName', 'receiptWidth']);
});

test('computeLast7DaysNetSales aggregates valid net sales across 7 chronological days', async () => {
  const { computeLast7DaysNetSales, summarize7DayTrend } = await import('./posMath');
  const now = new Date(2026, 10, 17, 15, 30, 0); // Nov 17, 2026
  const makeSale = (daysAgo: number, grandTotal: number, voided = false): SaleRecord => {
    const d = new Date(2026, 10, 17 - daysAgo, 11, 15, 0);
    return {
      receiptNo: `OR-${daysAgo}-${grandTotal}`,
      dateIso: d.toISOString(),
      dateFormatted: d.toLocaleString('en-PH'),
      items: [],
      retailSubtotal: grandTotal,
      wholesaleSavings: 0,
      seniorDiscount: 0,
      grandTotal,
      paymentMethod: 'Cash',
      tendered: grandTotal,
      change: 0,
      voided,
    };
  };

  const sales: SaleRecord[] = [
    makeSale(0, 1250.5),
    makeSale(0, 249.5),
    makeSale(0, 500.0, true), // voided — must be excluded
    makeSale(2, 840.25),
    makeSale(6, 400.0), // oldest day inside 7-day window (Nov 11)
    makeSale(7, 9999.0), // 8 days ago (Nov 10) — outside 7-day window
  ];

  const points = computeLast7DaysNetSales(sales, now);
  assert.equal(points.length, 7);
  assert.equal(points[0].dateKey, '2026-11-11');
  assert.equal(points[0].netSales, 400);
  assert.equal(points[0].orders, 1);

  assert.equal(points[1].dateKey, '2026-11-12');
  assert.equal(points[1].netSales, 0);
  assert.equal(points[1].orders, 0);

  assert.equal(points[4].dateKey, '2026-11-15');
  assert.equal(points[4].netSales, 840.25);
  assert.equal(points[4].orders, 1);

  assert.equal(points[6].dateKey, '2026-11-17');
  assert.equal(points[6].netSales, 1500);
  assert.equal(points[6].orders, 2);

  const summary = summarize7DayTrend(points);
  assert.equal(summary.total, 2740.25);
  assert.equal(summary.average, 391.46);
  assert.equal(summary.activeDays, 3);
  assert.equal(summary.bestDay?.dateKey, '2026-11-17');
});

test('upgraded barcode helpers handle ZXing formats, UPC-E expansion, and scan consensus cleanly', async () => {
  const {
    createScanConsensusState,
    evaluateScanCandidate,
    expandUpcE,
    normalizeBarcodeFormat,
  } = await import('./posMath');

  assert.equal(normalizeBarcodeFormat('EAN-13'), 'ean_13');
  assert.equal(normalizeBarcodeFormat('UPCE'), 'upc_e');
  assert.equal(normalizeBarcodeFormat('QRCode'), 'qr_code');
  assert.equal(normalizeBarcodeFormat('DataBarExp'), 'gs1_databar');

  // UPC-E 04252614 -> UPC-A 042100005264
  assert.equal(expandUpcE('04252614'), '042100005264');
  assert.equal(expandUpcE('04252619'), null);

  const upcaCatalog: Product[] = [
    {
      id: 'U1',
      barcode: '042100005264',
      name: 'Sample Drink',
      category: 'Beverages',
      unit: 'pc',
      retailPrice: 25,
      wholesalePrice: 23,
      wholesaleMinQty: 6,
      stock: 10,
    },
  ];
  assert.equal(findProductByBarcode('04252614', upcaCatalog)?.id, 'U1');

  // Strong checksum formats work on 1st camera read; UPC-E (ZXing "UPCE") and Code-128 require 2-frame camera consensus
  assert.equal(isStrongRead('4800016644801', 'EAN-13'), true);
  assert.equal(isStrongRead('04252614', 'UPCE'), false);
  assert.equal(isStrongRead('https://omnimart.ph/item/1', 'QRCode'), true);

  const state = createScanConsensusState();
  // Weak Code128 camera read needs 2 frames within window
  const w1 = evaluateScanCandidate(state, 'SKU-9988', { format: 'Code128', source: 'camera', nowMs: 1000 });
  assert.equal(w1.accept, false);
  assert.equal(w1.reason, 'need_vote');

  const w2 = evaluateScanCandidate(state, 'SKU-9988', { format: 'Code128', source: 'camera', nowMs: 1200 });
  assert.equal(w2.accept, true);
  assert.equal(w2.code, 'SKU-9988');

  // Same code inside cooldown is blocked on camera, but different code succeeds immediately
  const cd = evaluateScanCandidate(state, 'SKU-9988', { format: 'Code128', source: 'camera', nowMs: 1500 });
  assert.equal(cd.accept, false);
  assert.equal(cd.reason, 'cooldown');

  const strong = evaluateScanCandidate(state, ']C1010480001664480117271231', {
    format: 'Code128',
    source: 'camera',
    nowMs: 1600,
  });
  assert.equal(strong.accept, true);
  assert.equal(strong.code, '4800016644801');

  // Manual or photo entry NEVER requires 2 votes even for unchecksummed custom codes
  const manualState = createScanConsensusState();
  const man = evaluateScanCandidate(manualState, 'CUSTOM-1', { source: 'manual', nowMs: 2000 });
  assert.equal(man.accept, true);
  assert.equal(man.code, 'CUSTOM-1');
});

test('stock intelligence: velocities, days of cover, dead stock, and health summary', async () => {
  const {
    computeProductVelocities,
    computeStockHealthSummary,
    computeWeightedAverageCapital,
  } = await import('./posMath');

  const now = new Date(2026, 10, 17, 12, 0, 0);
  const products: Product[] = [
    {
      id: 'A',
      barcode: '4800001000011',
      name: 'Fast Coffee',
      category: 'Beverages',
      unit: 'pc',
      capital: 8,
      retailPrice: 12,
      wholesalePrice: 11,
      wholesaleMinQty: 12,
      stock: 15, // 30 sold in 10d = 3/day -> 5d cover (fastLow <= 3+2)
    },
    {
      id: 'B',
      barcode: '4800001000028',
      name: 'Dead Soap',
      category: 'Personal Care',
      unit: 'pc',
      capital: 25,
      retailPrice: 20, // Below capital!
      wholesalePrice: 20,
      wholesaleMinQty: 6,
      stock: 10, // 0 sold -> dead stock & lossMargin
    },
    {
      id: 'C',
      barcode: '4800001000035',
      name: 'No Capital Oil',
      category: 'Cooking Essentials',
      unit: 'pc',
      capital: 0,
      retailPrice: 60,
      wholesalePrice: 55,
      wholesaleMinQty: 6,
      stock: 0, // Out of stock & missing capital
    },
  ];

  const sales: SaleRecord[] = [
    {
      receiptNo: 'OR-261107-0001',
      dateIso: new Date(now.getTime() - 9.5 * 24 * 3600 * 1000).toISOString(),
      dateFormatted: '10d ago',
      items: [
        {
          productId: 'A',
          name: 'Fast Coffee',
          qty: 30,
          unit: 'pc',
          unitPrice: 12,
          priceType: 'retail',
          capital: 8,
          lineTotal: 360,
        },
      ],
      retailSubtotal: 360,
      wholesaleSavings: 0,
      seniorDiscount: 0,
      grandTotal: 360,
      paymentMethod: 'Cash',
      tendered: 400,
      change: 40,
    },
    {
      receiptNo: 'OR-261117-0002',
      dateIso: now.toISOString(),
      dateFormatted: 'today',
      items: [
        {
          productId: 'B',
          name: 'Dead Soap',
          qty: 5,
          unit: 'pc',
          unitPrice: 20,
          priceType: 'retail',
          capital: 25,
          lineTotal: 100,
        },
      ],
      retailSubtotal: 100,
      wholesaleSavings: 0,
      seniorDiscount: 0,
      grandTotal: 100,
      paymentMethod: 'Cash',
      tendered: 100,
      change: 0,
      voided: true, // Voided sale must NOT count toward velocity
    },
  ];

  const vel = computeProductVelocities(products, sales, now.getTime());
  assert.equal(vel.hasSalesInWindow, true);
  assert.equal(vel.windowDays, 10);
  const velA = vel.byId.get('A')!;
  assert.equal(velA.soldQty, 30);
  assert.equal(velA.avgDaily, 3);
  assert.equal(velA.daysOfCover, 5);
  assert.equal(velA.isDeadStock, false);

  const velB = vel.byId.get('B')!;
  assert.equal(velB.soldQty, 0);
  assert.equal(velB.isDeadStock, true);

  const summary = computeStockHealthSummary(products, sales, DEFAULT_SETTINGS, now);
  assert.equal(summary.totalSkus, 3);
  assert.equal(summary.stockRetailValue, 380); // 15*12 + 10*20 + 0*60
  assert.equal(summary.capitalInStock, 370); // 15*8 + 10*25 + 0
  assert.equal(summary.missingCapitalCount, 1);
  assert.equal(summary.lossMarginCount, 1);
  assert.equal(summary.outCount, 1);
  assert.equal(summary.fastLowCount, 1);
  assert.equal(summary.deadStockCount, 1);

  // Weighted average capital: 10 pcs @ 10 + 10 pcs @ 14 = 12
  assert.equal(computeWeightedAverageCapital(10, 10, 10, 14), 12);
  // Zero existing stock takes new cost directly
  assert.equal(computeWeightedAverageCapital(0, 10, 5, 16.5), 16.5);
});

test('applyBatchStockUpdates handles atomic delta/set updates and parseInventoryCsv handles safe preview diffs', async () => {
  const { applyBatchStockUpdates, parseCsvRows, parseInventoryCsv } = await import('./posMath');

  const initial: Product[] = [
    {
      id: 'SKU-1',
      barcode: '4800016644801',
      name: 'Lucky Me! Pancit Canton',
      category: 'Canned & Noodles',
      unit: 'pc',
      capital: 11,
      retailPrice: 15,
      wholesalePrice: 13.5,
      wholesaleMinQty: 12,
      stock: 20,
    },
    {
      id: 'SKU-2',
      barcode: '4800016644818',
      name: 'Argentina Corned Beef',
      category: 'Canned & Noodles',
      unit: 'pc',
      capital: 31,
      retailPrice: 38,
      wholesalePrice: 36,
      wholesaleMinQty: 6,
      stock: 5,
    },
  ];
  const initialJson = JSON.stringify(initial);

  const batch = applyBatchStockUpdates(
    initial,
    [
      { productId: 'SKU-1', mode: 'delta', value: 24, reason: 'Restock', note: 'DR-101', newCapital: 11.5 },
      { productId: 'SKU-2', mode: 'set', value: 3, reason: 'Count Correction', note: 'Shelf count' },
    ],
    '2026-11-17T08:00:00.000Z',
  );
  assert.equal(batch.changedCount, 2);
  assert.equal(batch.nextProducts[0].stock, 44);
  assert.equal(batch.nextProducts[0].capital, 11.5);
  assert.equal(batch.nextProducts[1].stock, 3);
  assert.equal(batch.logEntries.length, 2);
  assert.equal(batch.logEntries[0].delta, 24);
  assert.equal(batch.logEntries[1].delta, -2);
  assert.equal(JSON.stringify(initial), initialJson); // Immutable original

  // CSV RFC-4180 + BOM parsing & preview matching
  const csv = [
    '\uFEFFBarcode,Name,Category,Unit,Capital,Retail Price,Stock',
    '"04800016644801","Lucky Me! Pancit Canton","Canned & Noodles","pc","11.50","16.00","50"',
    '"4809998887771","Kopiko ""Black"" 3-in-1, Twin","Beverages","pack","9.00","12.50","30"',
    '"4801112223334","Incomplete Bad Row","Beverages","pc","5","0","10"',
  ].join('\r\n');

  const matrix = parseCsvRows(csv);
  assert.equal(matrix.length, 4);
  assert.equal(matrix[2][1], 'Kopiko "Black" 3-in-1, Twin');

  const preview = parseInventoryCsv(csv, initial);
  assert.equal(preview.error, undefined);
  assert.equal(preview.rows.length, 3);
  assert.equal(preview.rows[0].action, 'update');
  assert.equal(preview.rows[0].existing?.id, 'SKU-1');
  assert.equal(preview.rows[0].data?.retailPrice, 16);
  assert.equal(preview.rows[1].action, 'create');
  assert.equal(preview.rows[1].data?.name, 'Kopiko "Black" 3-in-1, Twin');
  assert.equal(preview.rows[2].action, 'skip');
});




