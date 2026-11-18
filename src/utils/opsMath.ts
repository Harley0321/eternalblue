import type {
  CashDrawerEvent,
  DigitalServiceEntry,
  DigitalServiceKind,
  Product,
  RepackLogEntry,
  RepackRule,
  SaleRecord,
  StockLogEntry,
  SukiCustomer,
  UtangTransaction,
} from '../types';
import { computeSalesStats, inRange, round2, sumPeso, toCents } from './posMath';

// ============================================================================
// 1. Suki Loyalty & Digital Utang Ledger
// ============================================================================

export function computeLoyaltyPointsEarned(grandTotal: number, pesoPerPoint = 50): number {
  const rate = Number(pesoPerPoint) > 0 ? Number(pesoPerPoint) : 50;
  const amt = Math.max(0, Number(grandTotal) || 0);
  return Math.floor(amt / rate);
}

export function computePointsRedemption(
  requestedPoints: number,
  availablePoints: number,
  pesoPerRedeemedPoint = 1,
  maxBillAmount = 0,
): { pointsUsed: number; discountPeso: number } {
  const avail = Math.max(0, Math.floor(Number(availablePoints) || 0));
  const req = Math.max(0, Math.floor(Number(requestedPoints) || 0));
  const pointVal = Number(pesoPerRedeemedPoint) > 0 ? Number(pesoPerRedeemedPoint) : 1;
  const maxBill = Math.max(0, round2(maxBillAmount));
  if (avail <= 0 || req <= 0 || maxBill <= 0) {
    return { pointsUsed: 0, discountPeso: 0 };
  }
  const maxPointsForBill = Math.floor(maxBill / pointVal);
  const pointsUsed = Math.min(req, avail, maxPointsForBill);
  return {
    pointsUsed,
    discountPeso: round2(pointsUsed * pointVal),
  };
}

export function isCustomerOverdue(customer: SukiCustomer, now = new Date()): boolean {
  if (!(customer.balance > 0) || !customer.dueDate) return false;
  const dueMs = Date.parse(`${customer.dueDate}T23:59:59`);
  return Number.isFinite(dueMs) && now.getTime() > dueMs;
}

export function applyUtangCharge(
  customer: SukiCustomer,
  amount: number,
  meta: {
    receiptNo?: string;
    dueDate?: string;
    note?: string;
    cashierName?: string;
    allowOverLimit?: boolean;
    nowIso?: string;
  } = {},
):
  | { ok: true; nextCustomer: SukiCustomer; transaction: UtangTransaction }
  | { ok: false; error: string } {
  const charge = round2(amount);
  if (!(charge > 0)) {
    return { ok: false, error: 'Charge amount must be greater than ₱0.00' };
  }
  const nextBalance = round2((customer.balance || 0) + charge);
  if (!meta.allowOverLimit && customer.creditLimit > 0 && nextBalance > customer.creditLimit + 1e-6) {
    return {
      ok: false,
      error: `Exceeds credit limit (${customer.creditLimit.toFixed(2)}). Available credit: ${Math.max(
        0,
        round2(customer.creditLimit - customer.balance),
      ).toFixed(2)}.`,
    };
  }
  const nowIso = meta.nowIso || new Date().toISOString();
  const nextCustomer: SukiCustomer = {
    ...customer,
    balance: nextBalance,
    dueDate: meta.dueDate !== undefined ? meta.dueDate || undefined : customer.dueDate,
    totalSpent: round2((customer.totalSpent || 0) + charge),
    updatedAt: nowIso,
  };
  const transaction: UtangTransaction = {
    id: `UTX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    customerId: customer.id,
    customerName: customer.name,
    type: 'charge',
    amount: charge,
    balanceAfter: nextBalance,
    receiptNo: meta.receiptNo,
    note: meta.note || (meta.receiptNo ? `POS Receipt ${meta.receiptNo}` : 'Store credit charge'),
    dateIso: nowIso,
    cashierName: meta.cashierName,
  };
  return { ok: true, nextCustomer, transaction };
}

export function applyUtangPayment(
  customer: SukiCustomer,
  amount: number,
  meta: {
    paymentMethod?: 'Cash' | 'GCash' | 'Card';
    note?: string;
    cashierName?: string;
    nowIso?: string;
  } = {},
):
  | { ok: true; nextCustomer: SukiCustomer; transaction: UtangTransaction; appliedAmount: number }
  | { ok: false; error: string } {
  const pay = round2(amount);
  if (!(pay > 0)) {
    return { ok: false, error: 'Payment amount must be greater than ₱0.00' };
  }
  const currentBal = round2(customer.balance || 0);
  if (currentBal <= 0) {
    return { ok: false, error: `${customer.name} has zero outstanding utang balance.` };
  }
  const applied = Math.min(currentBal, pay);
  const nextBalance = round2(Math.max(0, currentBal - applied));
  const nowIso = meta.nowIso || new Date().toISOString();

  const nextCustomer: SukiCustomer = {
    ...customer,
    balance: nextBalance,
    dueDate: nextBalance <= 0 ? undefined : customer.dueDate,
    updatedAt: nowIso,
  };
  const transaction: UtangTransaction = {
    id: `UPY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    customerId: customer.id,
    customerName: customer.name,
    type: 'payment',
    amount: applied,
    balanceAfter: nextBalance,
    paymentMethod: meta.paymentMethod || 'Cash',
    note: meta.note || `Bayad utang (${meta.paymentMethod || 'Cash'})`,
    dateIso: nowIso,
    cashierName: meta.cashierName,
  };
  return { ok: true, nextCustomer, transaction, appliedAmount: applied };
}

export function summarizeUtangLedger(
  customers: SukiCustomer[],
  transactions: UtangTransaction[],
  now = new Date(),
) {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endToday = startToday + 86400000;

  let totalReceivableCents = 0;
  let overdueCount = 0;
  let overdueAmountCents = 0;
  let totalPoints = 0;
  let activeDebtors = 0;

  for (const c of customers) {
    const balCents = toCents(c.balance);
    if (balCents > 0) {
      activeDebtors++;
      totalReceivableCents += balCents;
      if (isCustomerOverdue(c, now)) {
        overdueCount++;
        overdueAmountCents += balCents;
      }
    }
    totalPoints += Math.max(0, Math.floor(Number(c.points) || 0));
  }

  let collectedTodayCents = 0;
  let chargedTodayCents = 0;
  for (const tx of transactions) {
    const t = Date.parse(tx.dateIso);
    if (!Number.isFinite(t) || t < startToday || t >= endToday) continue;
    if (tx.type === 'payment') collectedTodayCents += toCents(tx.amount);
    else if (tx.type === 'charge') chargedTodayCents += toCents(tx.amount);
  }

  return {
    totalReceivable: totalReceivableCents / 100,
    overdueCount,
    overdueAmount: overdueAmountCents / 100,
    activeDebtors,
    totalPoints,
    collectedToday: collectedTodayCents / 100,
    chargedToday: chargedTodayCents / 100,
  };
}

export function buildUtangSmsStatement(customer: SukiCustomer, storeName: string): string {
  const bal = customer.balance.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const lines = [
    `[${storeName}] Suki Balance Reminder`,
    `Hi ${customer.name}, your current store utang balance is ₱${bal}.`,
  ];
  if (customer.dueDate) {
    lines.push(`Due date: ${customer.dueDate}`);
  }
  if (customer.points > 0) {
    lines.push(`Available Suki Points: ${customer.points} pts`);
  }
  lines.push('Maraming salamat po!');
  return lines.join('\n');
}

// ============================================================================
// 2. Tingi / Bulk Pack-to-Piece Unit Conversion (Unpack / Repack)
// ============================================================================

export function computeRepackUnitCost(masterCapital: number | undefined, yieldQty: number): number {
  const cap = Number(masterCapital) || 0;
  const y = Number(yieldQty) || 0;
  if (!(cap > 0) || !(y > 0)) return 0;
  return round2(cap / y);
}

export function executeRepackConversion(
  products: Product[],
  rule: RepackRule,
  masterQtyToUnpack: number,
  opts: { nowIso?: string; cashierName?: string } = {},
):
  | {
      ok: true;
      nextProducts: Product[];
      stockLogs: StockLogEntry[];
      repackLog: RepackLogEntry;
      addedQty: number;
      unitCost: number;
    }
  | { ok: false; error: string } {
  const unpackQty = Number((Number(masterQtyToUnpack) || 0).toFixed(3));
  if (!(unpackQty > 0)) {
    return { ok: false, error: 'Unpack quantity must be greater than 0.' };
  }
  if (!(rule.yieldQty > 0)) {
    return { ok: false, error: 'Conversion yield per bulk unit must be greater than 0.' };
  }
  if (rule.masterProductId === rule.targetProductId) {
    return { ok: false, error: 'Master bulk SKU and retail tingi SKU must be different products.' };
  }

  const master = products.find((p) => p.id === rule.masterProductId);
  const target = products.find((p) => p.id === rule.targetProductId);
  if (!master) return { ok: false, error: 'Master bulk SKU not found in inventory.' };
  if (!target) return { ok: false, error: 'Target retail/tingi SKU not found in inventory.' };

  if (master.stock + 1e-6 < unpackQty) {
    return {
      ok: false,
      error: `Not enough ${master.name} in stock (${master.stock} ${master.unit} available).`,
    };
  }

  const nowIso = opts.nowIso || new Date().toISOString();
  const addedQty = Number((unpackQty * rule.yieldQty).toFixed(3));
  const nextMasterStock = Math.max(0, Number((master.stock - unpackQty).toFixed(3)));
  const nextTargetStock = Number((target.stock + addedQty).toFixed(3));

  const derivedUnitCost = computeRepackUnitCost(master.capital, rule.yieldQty);
  let nextTargetCapital = target.capital;
  if (rule.autoComputeCost && derivedUnitCost > 0) {
    const existingStock = Math.max(0, Number(target.stock) || 0);
    const existingCap = Number(target.capital) || 0;
    if (existingStock > 0 && existingCap > 0 && nextTargetStock > 0) {
      nextTargetCapital = round2(
        (existingStock * existingCap + addedQty * derivedUnitCost) / nextTargetStock,
      );
    } else {
      nextTargetCapital = derivedUnitCost;
    }
  }

  const nextProducts = products.map((p) => {
    if (p.id === master.id) {
      return { ...p, stock: nextMasterStock, updatedAt: nowIso };
    }
    if (p.id === target.id) {
      return {
        ...p,
        stock: nextTargetStock,
        capital: nextTargetCapital,
        updatedAt: nowIso,
      };
    }
    return p;
  });

  const batchTag = Date.now().toString(36).toUpperCase();
  const stockLogs: StockLogEntry[] = [
    {
      id: `LOG-${batchTag}-OUT`,
      dateIso: nowIso,
      productId: master.id,
      productName: master.name,
      delta: -unpackQty,
      prevStock: master.stock,
      newStock: nextMasterStock,
      reason: 'Count Correction',
      note: `Unpacked ${unpackQty} ${master.unit} → +${addedQty} ${target.unit} (${target.name})`,
    },
    {
      id: `LOG-${batchTag}-IN`,
      dateIso: nowIso,
      productId: target.id,
      productName: target.name,
      delta: addedQty,
      prevStock: target.stock,
      newStock: nextTargetStock,
      reason: 'Restock',
      note: `Repack from ${master.name} (${unpackQty} ${master.unit})`,
    },
  ];

  const repackLog: RepackLogEntry = {
    id: `RPK-${batchTag}`,
    dateIso: nowIso,
    ruleId: rule.id,
    masterProductId: master.id,
    masterName: master.name,
    masterQtyUsed: unpackQty,
    targetProductId: target.id,
    targetName: target.name,
    targetQtyAdded: addedQty,
    unitCost: derivedUnitCost || Number(target.capital) || 0,
    cashierName: opts.cashierName,
  };

  return {
    ok: true,
    nextProducts,
    stockLogs,
    repackLog,
    addedQty,
    unitCost: repackLog.unitCost,
  };
}

// ============================================================================
// 3. Digital Services (GCash / Maya Cash-In, Cash-Out, E-Load)
// ============================================================================

export function suggestServiceFee(kind: DigitalServiceKind, amount: number): number {
  const amt = Math.max(0, Number(amount) || 0);
  if (amt <= 0) return 0;
  if (kind === 'E-Load') return amt >= 100 ? 5 : 3;
  if (kind === 'Bills Pay') return 15;
  // Standard PH sari-sari bracket (~₱10 for <=500, ₱15 for <=1000, ₱20/1000 above)
  if (amt <= 500) return 10;
  if (amt <= 1000) return 15;
  return Math.ceil(amt / 1000) * 20;
}

export function summarizeDigitalServices(entries: DigitalServiceEntry[], from: Date, to: Date) {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  let volumeCents = 0;
  let feesCents = 0;
  let cashDrawerImpactCents = 0;
  let count = 0;

  for (const entry of entries) {
    const t = Date.parse(entry.dateIso);
    if (!Number.isFinite(t) || t < fromMs || t >= toMs) continue;
    count++;
    const amtCents = toCents(entry.amount);
    const feeCents = toCents(entry.fee);
    volumeCents += amtCents;
    feesCents += feeCents;

    // Cash-In / E-Load / Bills Pay: customer gives store physical cash (amount + fee)
    // Cash-Out: store gives customer physical cash (-amount), earns +fee in cash
    if (entry.kind === 'GCash Cash-Out' || entry.kind === 'Maya Cash-Out') {
      cashDrawerImpactCents += feeCents - amtCents;
    } else {
      cashDrawerImpactCents += amtCents + feeCents;
    }
  }

  return {
    count,
    totalVolume: volumeCents / 100,
    totalFees: feesCents / 100,
    cashDrawerImpact: cashDrawerImpactCents / 100,
  };
}

// ============================================================================
// 4. Shift Cash Float, Gastos & Full Drawer / Profit Reconciliation
// ============================================================================

export function computeShiftLedgerSummary(params: {
  sales: SaleRecord[];
  products: Product[];
  drawerEvents: CashDrawerEvent[];
  utangTransactions: UtangTransaction[];
  serviceEntries: DigitalServiceEntry[];
  openingFloat: number;
  from: Date;
  to: Date;
}) {
  const { sales, products, drawerEvents, utangTransactions, serviceEntries, openingFloat, from, to } =
    params;

  const validSales = sales.filter((s) => !s.voided && inRange(s, from, to));
  const stats = computeSalesStats(validSales, products);

  const fromMs = from.getTime();
  const toMs = to.getTime();

  let expensesTotalCents = 0;
  let cashDropsCents = 0;
  let cashTopUpsCents = 0;

  for (const ev of drawerEvents) {
    const t = Date.parse(ev.dateIso);
    if (!Number.isFinite(t) || t < fromMs || t >= toMs) continue;
    const c = toCents(ev.amount);
    if (ev.type === 'expense') expensesTotalCents += c;
    else if (ev.type === 'drop') cashDropsCents += c;
    else if (ev.type === 'topup') cashTopUpsCents += c;
  }

  let utangCashCollectedCents = 0;
  for (const utx of utangTransactions) {
    if (utx.type !== 'payment') continue;
    const t = Date.parse(utx.dateIso);
    if (!Number.isFinite(t) || t < fromMs || t >= toMs) continue;
    if ((utx.paymentMethod || 'Cash') === 'Cash') {
      utangCashCollectedCents += toCents(utx.amount);
    }
  }

  let cashSalesCents = 0;
  for (const s of validSales) {
    if (s.paymentMethod === 'Cash') cashSalesCents += toCents(s.grandTotal);
    else if (s.paymentMethod === 'Split' && s.splitDetails) {
      cashSalesCents += toCents(s.splitDetails.cash);
    }
  }

  const servicesSummary = summarizeDigitalServices(serviceEntries, from, to);

  const expectedDrawerCashCents =
    toCents(openingFloat) +
    cashSalesCents +
    utangCashCollectedCents +
    cashTopUpsCents +
    toCents(servicesSummary.cashDrawerImpact) -
    expensesTotalCents -
    cashDropsCents;

  const expensesTotal = expensesTotalCents / 100;
  const trueNetProfit = round2(stats.profit + servicesSummary.totalFees - expensesTotal);

  return {
    salesCount: stats.count,
    grossProfit: stats.profit,
    netSales: stats.net,
    cashSales: cashSalesCents / 100,
    utangCashCollected: utangCashCollectedCents / 100,
    cashTopUps: cashTopUpsCents / 100,
    cashDrops: cashDropsCents / 100,
    expensesTotal,
    serviceFeesTotal: servicesSummary.totalFees,
    serviceCashImpact: servicesSummary.cashDrawerImpact,
    expectedDrawerCash: expectedDrawerCashCents / 100,
    trueNetProfit,
  };
}

// ============================================================================
// 5. Deterministic Code-128B Barcode Pattern Encoder (for crisp SVG Shelf Tags)
// ============================================================================

// Standard Code 128 module width patterns (indices 0..106)
const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

/**
 * Encodes printable ASCII text (chars 32..126) into an array of module widths
 * alternating bar / space starting with a bar, suitable for crisp SVG rendering.
 */
export function encodeCode128Bars(rawText: string): { widths: number[]; totalModules: number } {
  const sanitized = String(rawText || '0000')
    .replace(/[^\x20-\x7e]/g, '')
    .slice(0, 32) || '0000';

  const codes: number[] = [104]; // Start Code B
  let checksum = 104;
  for (let i = 0; i < sanitized.length; i++) {
    const val = sanitized.charCodeAt(i) - 32;
    codes.push(val);
    checksum += val * (i + 1);
  }
  codes.push(checksum % 103);
  codes.push(106); // Stop pattern

  const widths: number[] = [];
  let totalModules = 0;
  for (const code of codes) {
    const pat = CODE128_PATTERNS[code] || CODE128_PATTERNS[0];
    for (let i = 0; i < pat.length; i++) {
      const w = Number(pat[i]);
      widths.push(w);
      totalModules += w;
    }
  }
  return { widths, totalModules };
}

export { sumPeso };
