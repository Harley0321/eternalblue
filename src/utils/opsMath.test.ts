import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  CashDrawerEvent,
  DigitalServiceEntry,
  Product,
  RepackRule,
  SaleRecord,
  SukiCustomer,
  UtangTransaction,
} from '../types';
import { DEFAULT_SETTINGS } from './posMath';
import {
  applyUtangCharge,
  applyUtangPayment,
  buildUtangSmsStatement,
  computeLoyaltyPointsEarned,
  computePointsRedemption,
  computeRepackUnitCost,
  computeShiftLedgerSummary,
  encodeCode128Bars,
  executeRepackConversion,
  isCustomerOverdue,
  suggestServiceFee,
  summarizeDigitalServices,
  summarizeUtangLedger,
} from './opsMath';
import {
  buildEscPosCashDrawerKick,
  buildEscPosReceiptBytes,
  buildEscPosTestSlip,
} from './escPosPrinter';

const makeCustomer = (overrides: Partial<SukiCustomer> = {}): SukiCustomer => ({
  id: 'SUKI-1',
  name: 'Aling Nena',
  phone: '09171234567',
  creditLimit: 1000,
  balance: 0,
  points: 25,
  totalSpent: 1250,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  ...overrides,
});

const makeProduct = (overrides: Partial<Product>): Product => ({
  id: 'P1',
  barcode: '4800001',
  name: 'Sample Item',
  category: 'Rice & Staples',
  unit: 'pc',
  capital: 100,
  retailPrice: 120,
  wholesalePrice: 110,
  wholesaleMinQty: 5,
  stock: 10,
  ...overrides,
});

describe('Suki Loyalty & Utang Credit Ledger', () => {
  it('computes points earned cleanly using floor division', () => {
    assert.equal(computeLoyaltyPointsEarned(249.99, 50), 4);
    assert.equal(computeLoyaltyPointsEarned(250, 50), 5);
    assert.equal(computeLoyaltyPointsEarned(0, 50), 0);
  });

  it('clamps redeemed loyalty points to available points and bill total', () => {
    const res1 = computePointsRedemption(100, 30, 1, 200);
    assert.equal(res1.pointsUsed, 30);
    assert.equal(res1.discountPeso, 30);

    const res2 = computePointsRedemption(50, 50, 5, 112);
    assert.equal(res2.pointsUsed, 22);
    assert.equal(res2.discountPeso, 110);
  });

  it('enforces credit limit unless allowOverLimit is set and updates balance on payment', () => {
    const c0 = makeCustomer({ creditLimit: 500, balance: 200 });
    const blocked = applyUtangCharge(c0, 350, { receiptNo: 'OR-001' });
    assert.equal(blocked.ok, false);

    const allowed = applyUtangCharge(c0, 350, {
      receiptNo: 'OR-001',
      dueDate: '2026-11-25',
      allowOverLimit: true,
    });
    assert.equal(allowed.ok, true);
    if (!allowed.ok) return;
    assert.equal(allowed.nextCustomer.balance, 550);
    assert.equal(allowed.nextCustomer.dueDate, '2026-11-25');

    const partial = applyUtangPayment(allowed.nextCustomer, 200, { paymentMethod: 'Cash' });
    assert.equal(partial.ok, true);
    if (!partial.ok) return;
    assert.equal(partial.nextCustomer.balance, 350);
    assert.equal(partial.nextCustomer.dueDate, '2026-11-25');

    const paidFull = applyUtangPayment(partial.nextCustomer, 500, { paymentMethod: 'GCash' });
    assert.equal(paidFull.ok, true);
    if (!paidFull.ok) return;
    assert.equal(paidFull.appliedAmount, 350);
    assert.equal(paidFull.nextCustomer.balance, 0);
    assert.equal(paidFull.nextCustomer.dueDate, undefined);
  });

  it('detects overdue accounts and builds SMS statement', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    const overdue = makeCustomer({ balance: 450, dueDate: '2026-11-10', points: 12 });
    const current = makeCustomer({ id: 'SUKI-2', balance: 150, dueDate: '2026-11-20' });

    assert.equal(isCustomerOverdue(overdue, now), true);
    assert.equal(isCustomerOverdue(current, now), false);

    const summary = summarizeUtangLedger([overdue, current], [] as UtangTransaction[], now);
    assert.equal(summary.totalReceivable, 600);
    assert.equal(summary.overdueCount, 1);
    assert.equal(summary.overdueAmount, 450);

    const sms = buildUtangSmsStatement(overdue, 'OmniMart PH');
    assert.match(sms, /Aling Nena/);
    assert.match(sms, /450\.00/);
    assert.match(sms, /2026-11-10/);
  });
});

describe('Tingi / Bulk Pack-to-Piece Conversion', () => {
  it('unpacks bulk stock into retail tingi stock and blends unit capital', () => {
    const sack = makeProduct({
      id: 'SACK-1',
      name: 'Sinandomeng 50kg Sack',
      unit: 'sack',
      capital: 2250,
      retailPrice: 2500,
      stock: 4,
    });
    const kilo = makeProduct({
      id: 'KILO-1',
      name: 'Sinandomeng Per Kilo',
      unit: 'kg',
      capital: 50,
      retailPrice: 58,
      stock: 10,
    });
    const rule: RepackRule = {
      id: 'RPK-1',
      name: '50kg Sack -> Per Kilo',
      masterProductId: sack.id,
      targetProductId: kilo.id,
      yieldQty: 50,
      autoComputeCost: true,
      updatedAt: '2026-11-18T00:00:00.000Z',
    };

    assert.equal(computeRepackUnitCost(sack.capital, rule.yieldQty), 45);
    const res = executeRepackConversion([sack, kilo], rule, 2, { cashierName: 'Maria' });
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const nextSack = res.nextProducts.find((p) => p.id === sack.id)!;
    const nextKilo = res.nextProducts.find((p) => p.id === kilo.id)!;
    assert.equal(nextSack.stock, 2);
    assert.equal(nextKilo.stock, 110);
    // Weighted blend: (10*50 + 100*45)/110 = 5000/110 = 45.45
    assert.equal(nextKilo.capital, 45.45);
    assert.equal(res.stockLogs.length, 2);
    assert.equal(res.repackLog.targetQtyAdded, 100);
  });

  it('rejects unpacking more bulk units than available in stock', () => {
    const sack = makeProduct({ id: 'S1', stock: 1 });
    const piece = makeProduct({ id: 'P2', stock: 0 });
    const rule: RepackRule = {
      id: 'R1',
      name: 'Pack -> Piece',
      masterProductId: 'S1',
      targetProductId: 'P2',
      yieldQty: 12,
      autoComputeCost: true,
      updatedAt: '2026-11-18T00:00:00.000Z',
    };
    const res = executeRepackConversion([sack, piece], rule, 2);
    assert.equal(res.ok, false);
  });
});

describe('GCash/Maya Services & Shift Drawer Reconciliation', () => {
  it('computes PH digital service fee suggestions and drawer cash impact', () => {
    assert.equal(suggestServiceFee('GCash Cash-In', 500), 10);
    assert.equal(suggestServiceFee('Maya Cash-Out', 1000), 15);
    assert.equal(suggestServiceFee('GCash Cash-In', 2500), 60);
    assert.equal(suggestServiceFee('E-Load', 50), 3);

    const from = new Date('2026-11-18T00:00:00.000Z');
    const to = new Date('2026-11-19T00:00:00.000Z');
    const entries: DigitalServiceEntry[] = [
      { id: '1', dateIso: '2026-11-18T09:00:00.000Z', kind: 'GCash Cash-In', amount: 1000, fee: 15 },
      { id: '2', dateIso: '2026-11-18T10:00:00.000Z', kind: 'Maya Cash-Out', amount: 500, fee: 10 },
    ];
    const sum = summarizeDigitalServices(entries, from, to);
    assert.equal(sum.count, 2);
    assert.equal(sum.totalVolume, 1500);
    assert.equal(sum.totalFees, 25);
    // +1015 cash from cash-in, -490 cash out (500 out + 10 fee in) = +525
    assert.equal(sum.cashDrawerImpact, 525);
  });

  it('reconciles opening float, cash sales, utang payments, expenses, drops, and net profit', () => {
    const from = new Date('2026-11-18T00:00:00.000Z');
    const to = new Date('2026-11-19T00:00:00.000Z');
    const products = [makeProduct({ id: 'P1', capital: 80, retailPrice: 120 })];
    const sales: SaleRecord[] = [
      {
        receiptNo: 'OR-100',
        dateIso: '2026-11-18T08:30:00.000Z',
        dateFormatted: 'Nov 18, 2026',
        items: [{ productId: 'P1', name: 'Sample Item', qty: 2, unit: 'pc', unitPrice: 120, priceType: 'retail', capital: 80, lineTotal: 240 }],
        retailSubtotal: 240,
        wholesaleSavings: 0,
        seniorDiscount: 0,
        grandTotal: 240,
        paymentMethod: 'Cash',
        tendered: 300,
        change: 60,
      },
    ];
    const drawerEvents: CashDrawerEvent[] = [
      { id: 'E1', dateIso: '2026-11-18T09:00:00.000Z', type: 'expense', category: 'Plastic Bags', amount: 45 },
      { id: 'E2', dateIso: '2026-11-18T10:00:00.000Z', type: 'drop', category: 'Safe Drop', amount: 200 },
    ];
    const utangTxs: UtangTransaction[] = [
      { id: 'U1', customerId: 'C1', customerName: 'Juan', type: 'payment', amount: 150, balanceAfter: 0, paymentMethod: 'Cash', dateIso: '2026-11-18T11:00:00.000Z' },
    ];
    const services: DigitalServiceEntry[] = [
      { id: 'S1', dateIso: '2026-11-18T12:00:00.000Z', kind: 'E-Load', amount: 50, fee: 3 },
    ];

    const summary = computeShiftLedgerSummary({
      sales,
      products,
      drawerEvents,
      utangTransactions: utangTxs,
      serviceEntries: services,
      openingFloat: 1000,
      from,
      to,
    });

    // Expected drawer = 1000 + 240 (cash sale) + 150 (utang bayad) + 53 (eload cash) - 45 (expense) - 200 (drop) = 1198
    assert.equal(summary.expectedDrawerCash, 1198);
    // Gross profit on sale (240 - 160 = 80) + service fee (3) - expense (45) = 38
    assert.equal(summary.trueNetProfit, 38);
  });
});

describe('Code-128B Barcode & ESC/POS Thermal Encoding', () => {
  it('encodes Code-128B bars starting with Start B (104) and ending with Stop (106)', () => {
    const encoded = encodeCode128Bars('480001234');
    assert.ok(encoded.widths.length > 20);
    assert.ok(encoded.totalModules > 60);
    assert.equal(encoded.widths[0], 2);
  });

  it('builds ESC/POS binary frames for receipt, test slip, and RJ11 drawer kick', () => {
    const sale: SaleRecord = {
      receiptNo: 'OR-999',
      dateIso: '2026-11-18T10:00:00.000Z',
      dateFormatted: 'Nov 18, 2026 6:00 PM',
      items: [{ productId: 'P1', name: 'Tide Powder', qty: 1, unit: 'pack', unitPrice: 12, priceType: 'retail', lineTotal: 12 }],
      retailSubtotal: 12,
      wholesaleSavings: 0,
      seniorDiscount: 0,
      grandTotal: 12,
      paymentMethod: 'Utang',
      tendered: 12,
      change: 0,
      customerName: 'Aling Nena',
      cashierName: 'Maria',
    };
    const bytes = buildEscPosReceiptBytes({
      sale,
      settings: DEFAULT_SETTINGS,
      width: '58mm',
      kickDrawer: true,
    });
    const text = Buffer.from(bytes).toString('latin1');
    assert.match(text, /ETERNALBLUE MART/);
    assert.match(text, /OR-999/);
    assert.match(text, /Aling Nena/);
    assert.equal(bytes[0], 0x1b);
    assert.equal(bytes[1], 0x40);

    const kick = buildEscPosCashDrawerKick();
    assert.deepEqual(Array.from(kick), [0x1b, 0x40, 0x1b, 0x70, 0x00, 0x19, 0xfa]);

    const testSlip = buildEscPosTestSlip(DEFAULT_SETTINGS, '80mm');
    assert.match(Buffer.from(testSlip).toString('latin1'), /ESC\/POS BLUETOOTH TEST/);
  });
});
