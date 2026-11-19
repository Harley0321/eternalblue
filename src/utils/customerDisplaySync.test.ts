import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCustomerDisplaySnapshot,
  buildCustomerDisplayUrl,
  isCustomerDisplayMode,
} from './customerDisplaySync';
import { buildMerchantQrPhString } from './paymentQr';
import { buildDefaultCatalog, buildProductMap, computeCartTotals, DEFAULT_SETTINGS } from './posMath';
import type { CartLine, SaleRecord, StoreSettings } from '../types';

test('isCustomerDisplayMode detects query param and hash variants safely', () => {
  assert.equal(isCustomerDisplayMode('?display=customer', ''), true);
  assert.equal(isCustomerDisplayMode('?foo=1&display=CUSTOMER', ''), true);
  assert.equal(isCustomerDisplayMode('', '#customer-display'), true);
  assert.equal(isCustomerDisplayMode('', '#/customer-display'), true);
  assert.equal(isCustomerDisplayMode('?display=pos', ''), false);
  assert.equal(isCustomerDisplayMode('', ''), false);
});

test('buildCustomerDisplayUrl preserves origin and sets display=customer param', () => {
  const url = buildCustomerDisplayUrl('http://localhost:3000/?foo=bar');
  assert.equal(url, 'http://localhost:3000/?foo=bar&display=customer');
});

test('buildCustomerDisplaySnapshot covers idle, scanning, checkout QR, Split QR, and completed states', () => {
  const products = buildDefaultCatalog();
  const productMap = buildProductMap(products);
  const emv = buildMerchantQrPhString({
    merchantName: 'ETERNALBLUE MART',
    merchantAccount: '09171234567',
  });
  const settings: StoreSettings = {
    ...DEFAULT_SETTINGS,
    qrEmvPayload: emv,
    qrPayLabel: 'QR Ph',
    customerDisplayGreeting: 'Mabuhay! Ready to scan.',
  };

  // 1. Idle state
  const emptyTotals = computeCartTotals([], productMap, false, settings);
  const idleSnap = buildCustomerDisplaySnapshot({
    storeName: settings.storeName,
    settings,
    priceMode: 'retail',
    isSeniorPwd: false,
    cart: [],
    productMap,
    totals: emptyTotals,
  });
  assert.equal(idleSnap.status, 'idle');
  assert.equal(idleSnap.greeting, 'Mabuhay! Ready to scan.');
  assert.equal(idleSnap.items.length, 0);

  // 2. Scanning state
  const firstProd = products[0];
  const cart: CartLine[] = [
    {
      productId: firstProd.id,
      name: firstProd.name,
      unit: firstProd.unit,
      retailPrice: firstProd.retailPrice,
      wholesalePrice: firstProd.wholesalePrice,
      wholesaleMinQty: firstProd.wholesaleMinQty,
      priceType: 'retail',
      qty: 2,
    },
  ];
  const totals = computeCartTotals(cart, productMap, false, settings);
  const scanSnap = buildCustomerDisplaySnapshot({
    storeName: settings.storeName,
    settings,
    priceMode: 'retail',
    isSeniorPwd: false,
    cart,
    productMap,
    totals,
  });
  assert.equal(scanSnap.status, 'scanning');
  assert.equal(scanSnap.items.length, 1);
  assert.equal(scanSnap.items[0].lineTotal, 390);
  assert.equal(scanSnap.totals.grandTotal, 390);

  // 3. Checkout GCash dynamic exact amount QR
  const qrCheckoutSnap = buildCustomerDisplaySnapshot({
    storeName: settings.storeName,
    settings,
    priceMode: 'retail',
    isSeniorPwd: false,
    cart,
    productMap,
    totals,
    checkoutDraft: {
      open: true,
      method: 'GCash',
      finalDue: 390,
      cashTendered: 0,
      cashChange: 0,
      splitCash: 0,
      splitDigital: 0,
      splitDigitalMethod: 'GCash',
      pointsDiscount: 0,
    },
  });
  assert.equal(qrCheckoutSnap.status, 'checkout');
  assert.equal(qrCheckoutSnap.checkout?.showQr, true);
  assert.equal(qrCheckoutSnap.checkout?.qr.mode, 'emvco');
  assert.equal(qrCheckoutSnap.checkout?.qr.amount, 390);
  assert.ok(qrCheckoutSnap.checkout?.qr.qrPayload?.includes('5406390.00'));

  // 4. Split Payment encodes ONLY the digital portion in dynamic QR
  const splitCheckoutSnap = buildCustomerDisplaySnapshot({
    storeName: settings.storeName,
    settings,
    priceMode: 'retail',
    isSeniorPwd: false,
    cart,
    productMap,
    totals,
    checkoutDraft: {
      open: true,
      method: 'Split',
      finalDue: 390,
      cashTendered: 0,
      cashChange: 0,
      splitCash: 100,
      splitDigital: 290,
      splitDigitalMethod: 'GCash',
      pointsDiscount: 0,
    },
  });
  assert.equal(splitCheckoutSnap.checkout?.showQr, true);
  assert.equal(splitCheckoutSnap.checkout?.qr.amount, 290);
  assert.ok(splitCheckoutSnap.checkout?.qr.qrPayload?.includes('5406290.00'));

  // 5. Completed sale thank-you state
  const sale: SaleRecord = {
    receiptNo: 'EB-20261119-001',
    dateIso: new Date().toISOString(),
    dateFormatted: 'Nov 19, 2026, 2:00 PM',
    items: [],
    retailSubtotal: 390,
    wholesaleSavings: 0,
    seniorDiscount: 0,
    grandTotal: 390,
    paymentMethod: 'Cash',
    tendered: 500,
    change: 110,
  };
  const completedSnap = buildCustomerDisplaySnapshot({
    storeName: settings.storeName,
    settings,
    priceMode: 'retail',
    isSeniorPwd: false,
    cart: [],
    productMap,
    totals: emptyTotals,
    lastCompletedSale: sale,
  });
  assert.equal(completedSnap.status, 'completed');
  assert.equal(completedSnap.completedSale?.receiptNo, 'EB-20261119-001');
  assert.equal(completedSnap.completedSale?.change, 110);
});
