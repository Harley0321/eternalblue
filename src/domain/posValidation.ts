import { DEFAULT_STORE_SETTINGS } from '../types/pos';
import type {
  ActiveShiftState,
  CartLine,
  CashDrawerEvent,
  CashierAccount,
  DigitalServiceEntry,
  HeldOrder,
  PosBackupPayload,
  PriceType,
  Product,
  RepackLogEntry,
  RepackRule,
  SaleItem,
  SaleRecord,
  StockLogEntry,
  StoreSettings,
  SukiCustomer,
  UtangTransaction,
} from '../types/pos';
import { PosMath } from './posMath';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, fallback = '', maxLen = 200): string {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function cleanOptionalText(value: unknown, maxLen = 200): string | null {
  const txt = cleanText(value, '', maxLen);
  return txt.length > 0 ? txt : null;
}

function nonNegativeRound2(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return PosMath.round2(num);
}

function nonNegativeRound3(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return PosMath.round3(num);
}

function positiveInt(value: unknown, fallback: number, max = 1_000_000): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.min(max, Math.floor(num));
}

function stripForbiddenKeys(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return raw.map(stripForbiddenKeys);
  }
  if (!isPlainRecord(raw)) return raw;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    out[key] = stripForbiddenKeys(val);
  }
  return out;
}

export function isSafeHttpUrl(rawUrl?: string | null): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export type CheckoutStockValidation = { ok: true } | { ok: false; error: string };

export function validateCartStockForCheckout(
  cart: CartLine[],
  productMap: Map<string, Product>
): CheckoutStockValidation {
  if (cart.length === 0) {
    return { ok: false, error: 'Cart is empty.' };
  }
  for (const line of cart) {
    const prod = productMap.get(line.productId);
    if (!prod) {
      return { ok: false, error: `"${line.name}" is no longer in inventory. Remove it from the cart.` };
    }
    const reqMilli = PosMath.toMilli(line.qty);
    const availMilli = PosMath.toMilli(prod.stock);
    if (reqMilli <= 0) {
      return { ok: false, error: `Invalid quantity for "${prod.name}".` };
    }
    if (availMilli <= 0) {
      return { ok: false, error: `"${prod.name}" is out of stock.` };
    }
    if (reqMilli > availMilli) {
      return {
        ok: false,
        error: `Only ${PosMath.formatQty(prod.stock, prod.unit)} of "${prod.name}" available in stock.`,
      };
    }
  }
  return { ok: true };
}

export interface ReconcileCartResult {
  nextCart: CartLine[];
  removedNames: string[];
  adjustedNames: string[];
}

export function reconcileCartWithProducts(
  cart: CartLine[],
  products: Product[],
  defaultWholesaleMinQty = 10
): ReconcileCartResult {
  const map = new Map(products.map((p) => [p.id, p]));
  const nextCart: CartLine[] = [];
  const removedNames: string[] = [];
  const adjustedNames: string[] = [];

  for (const line of cart) {
    const live = map.get(line.productId);
    if (!live) {
      removedNames.push(line.name);
      continue;
    }
    const availMilli = PosMath.toMilli(live.stock);
    const reqMilli = PosMath.toMilli(line.qty);
    if (availMilli <= 0 || reqMilli <= 0) {
      removedNames.push(live.name);
      continue;
    }
    const cappedQty = PosMath.fromMilli(Math.min(reqMilli, availMilli));
    if (reqMilli > availMilli) {
      adjustedNames.push(live.name);
    }
    const draft: CartLine = {
      productId: live.id,
      name: live.name,
      unit: live.unit,
      retailPrice: live.retailPrice,
      wholesalePrice: live.wholesalePrice,
      wholesaleMinQty: live.wholesaleMinQty,
      priceType: 'retail',
      qty: cappedQty,
    };
    const isWs = PosMath.isWholesaleLine(draft, map, defaultWholesaleMinQty);
    nextCart.push({
      ...draft,
      priceType: (isWs ? 'wholesale' : 'retail') as PriceType,
    });
  }

  return { nextCart, removedNames, adjustedNames };
}

function sanitizeProduct(raw: unknown, idx: number): Product | null {
  if (!isPlainRecord(raw)) return null;
  const name = cleanText(raw.name, '', 160);
  if (!name) return null;
  const id = cleanText(raw.id, `p-imp-${idx}`, 80);
  const retailPrice = nonNegativeRound2(raw.retailPrice, -1);
  if (retailPrice <= 0) return null;
  const capitalRaw = raw.capital;
  const capital =
    capitalRaw == null || capitalRaw === ''
      ? null
      : Number.isFinite(Number(capitalRaw)) && Number(capitalRaw) >= 0
      ? PosMath.round2(Number(capitalRaw))
      : null;
  const wholesalePrice = nonNegativeRound2(raw.wholesalePrice, retailPrice);
  const wholesaleMinQty =
    Number.isFinite(Number(raw.wholesaleMinQty)) && Number(raw.wholesaleMinQty) > 0
      ? PosMath.round3(Number(raw.wholesaleMinQty))
      : DEFAULT_STORE_SETTINGS.defaultWholesaleMinQty;
  const lowThreshRaw = raw.lowStockThreshold;
  const lowStockThreshold =
    lowThreshRaw == null || lowThreshRaw === ''
      ? null
      : Number.isFinite(Number(lowThreshRaw)) && Number(lowThreshRaw) >= 0
      ? PosMath.round3(Number(lowThreshRaw))
      : null;

  return {
    id,
    barcode: cleanText(raw.barcode, '', 64),
    name,
    category: cleanText(raw.category, 'General', 80) || 'General',
    unit: cleanText(raw.unit, 'pc', 24) || 'pc',
    capital,
    retailPrice,
    wholesalePrice,
    wholesaleMinQty,
    stock: nonNegativeRound3(raw.stock, 0),
    lowStockThreshold,
    expiry: cleanOptionalText(raw.expiry, 20),
    scEligible: typeof raw.scEligible === 'boolean' ? raw.scEligible : undefined,
    icon: cleanOptionalText(raw.icon, 40),
    iconColor: cleanOptionalText(raw.iconColor, 30),
    updatedAt: cleanOptionalText(raw.updatedAt, 40) ?? undefined,
  };
}

function sanitizeSaleItem(raw: unknown): SaleItem | null {
  if (!isPlainRecord(raw)) return null;
  const name = cleanText(raw.name, '', 160);
  if (!name) return null;
  const qty = nonNegativeRound3(raw.qty, 0);
  if (qty <= 0) return null;
  const unitPrice = nonNegativeRound2(raw.unitPrice, 0);
  const capital =
    raw.capital == null || raw.capital === ''
      ? null
      : Number.isFinite(Number(raw.capital)) && Number(raw.capital) >= 0
      ? PosMath.round2(Number(raw.capital))
      : null;
  const lineTotal = nonNegativeRound2(raw.lineTotal, PosMath.lineTotalPeso(unitPrice, qty));

  return {
    productId: cleanOptionalText(raw.productId, 80),
    category: cleanOptionalText(raw.category, 80),
    name,
    qty,
    unit: cleanText(raw.unit, 'pc', 24) || 'pc',
    unitPrice,
    priceType: raw.priceType === 'wholesale' ? 'wholesale' : 'retail',
    capital,
    lineTotal,
  };
}

function sanitizeSaleRecord(raw: unknown, idx: number): SaleRecord | null {
  if (!isPlainRecord(raw)) return null;
  const receiptNo = cleanText(raw.receiptNo, '', 60);
  if (!receiptNo) return null;
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items = itemsRaw.map(sanitizeSaleItem).filter((item): item is SaleItem => item !== null);
  if (items.length === 0) return null;

  const dateIso = cleanText(raw.dateIso, new Date().toISOString(), 40) || new Date().toISOString();
  let splitDetails: SaleRecord['splitDetails'] = null;
  if (isPlainRecord(raw.splitDetails)) {
    splitDetails = {
      cash: nonNegativeRound2(raw.splitDetails.cash, 0),
      digital: nonNegativeRound2(raw.splitDetails.digital, 0),
      digitalMethod: cleanText(raw.splitDetails.digitalMethod, 'GCash', 30) || 'GCash',
    };
  }

  return {
    receiptNo,
    dateIso,
    dateFormatted: cleanText(raw.dateFormatted, PosMath.formatDateTime(dateIso), 60),
    items,
    retailSubtotal: nonNegativeRound2(raw.retailSubtotal, 0),
    wholesaleSavings: nonNegativeRound2(raw.wholesaleSavings, 0),
    seniorDiscount: nonNegativeRound2(raw.seniorDiscount, 0),
    grandTotal: nonNegativeRound2(raw.grandTotal, 0),
    paymentMethod: cleanText(raw.paymentMethod, 'Cash', 30) || 'Cash',
    tendered: nonNegativeRound2(raw.tendered, 0),
    change: nonNegativeRound2(raw.change, 0),
    refNo: cleanOptionalText(raw.refNo, 80),
    splitDetails,
    seniorId: cleanOptionalText(raw.seniorId, 60),
    seniorBase: raw.seniorBase != null ? nonNegativeRound2(raw.seniorBase, 0) : null,
    seniorCapped: typeof raw.seniorCapped === 'boolean' ? raw.seniorCapped : null,
    customerId: cleanOptionalText(raw.customerId, 80),
    customerName: cleanOptionalText(raw.customerName, 120),
    pointsEarned: raw.pointsEarned != null ? positiveInt(raw.pointsEarned, 0) : null,
    pointsRedeemed: raw.pointsRedeemed != null ? positiveInt(raw.pointsRedeemed, 0) : null,
    pointsDiscount: raw.pointsDiscount != null ? nonNegativeRound2(raw.pointsDiscount, 0) : null,
    utangDueDate: cleanOptionalText(raw.utangDueDate, 20),
    cashierName: cleanOptionalText(raw.cashierName, 80),
    shiftId: cleanOptionalText(raw.shiftId, 80),
    voided: raw.voided === true,
    voidedAt: cleanOptionalText(raw.voidedAt, 40),
    voidReason: cleanOptionalText(raw.voidReason, 200),
    _idx: idx,
  } as SaleRecord & { _idx?: number };
}

function sanitizeCartLine(raw: unknown): CartLine | null {
  if (!isPlainRecord(raw)) return null;
  const productId = cleanText(raw.productId, '', 80);
  const name = cleanText(raw.name, '', 160);
  const qty = nonNegativeRound3(raw.qty, 0);
  if (!productId || !name || qty <= 0) return null;
  const retailPrice = nonNegativeRound2(raw.retailPrice, 0);
  const wholesalePrice = nonNegativeRound2(raw.wholesalePrice, retailPrice);
  const wholesaleMinQty =
    Number.isFinite(Number(raw.wholesaleMinQty)) && Number(raw.wholesaleMinQty) > 0
      ? PosMath.round3(Number(raw.wholesaleMinQty))
      : DEFAULT_STORE_SETTINGS.defaultWholesaleMinQty;
  return {
    productId,
    name,
    unit: cleanText(raw.unit, 'pc', 24) || 'pc',
    retailPrice,
    wholesalePrice,
    wholesaleMinQty,
    priceType: raw.priceType === 'wholesale' ? 'wholesale' : 'retail',
    qty,
  };
}

function sanitizeHeldOrders(raw: unknown): HeldOrder[] {
  if (!Array.isArray(raw)) return [];
  const out: HeldOrder[] = [];
  raw.forEach((item, idx) => {
    if (!isPlainRecord(item)) return;
    const lines = Array.isArray(item.items)
      ? item.items.map(sanitizeCartLine).filter((c): c is CartLine => c !== null)
      : [];
    if (lines.length === 0) return;
    out.push({
      id: cleanText(item.id, `HOLD-${idx}`, 80) || `HOLD-${idx}`,
      label: cleanText(item.label, `Customer #${idx + 1}`, 120),
      time: cleanText(item.time, '', 60),
      items: lines,
      total: nonNegativeRound2(item.total, 0),
      isSeniorPwd: Boolean(item.isSeniorPwd),
      priceMode: item.priceMode === 'wholesale' ? 'wholesale' : 'retail',
    });
  });
  return out;
}

function sanitizeSukiCustomers(raw: unknown): SukiCustomer[] {
  if (!Array.isArray(raw)) return [];
  const out: SukiCustomer[] = [];
  raw.forEach((item, idx) => {
    if (!isPlainRecord(item)) return;
    const name = cleanText(item.name, '', 120);
    if (!name) return;
    const now = new Date().toISOString();
    out.push({
      id: cleanText(item.id, `suki-${idx}`, 80) || `suki-${idx}`,
      name,
      phone: cleanOptionalText(item.phone, 40),
      address: cleanOptionalText(item.address, 200),
      creditLimit: nonNegativeRound2(item.creditLimit, 0),
      balance: nonNegativeRound2(item.balance, 0),
      dueDate: cleanOptionalText(item.dueDate, 20),
      points: positiveInt(item.points, 0),
      totalSpent: nonNegativeRound2(item.totalSpent, 0),
      createdAt: cleanText(item.createdAt, now, 40) || now,
      updatedAt: cleanText(item.updatedAt, now, 40) || now,
    });
  });
  return out;
}

function sanitizeUtangTx(raw: unknown): UtangTransaction[] {
  if (!Array.isArray(raw)) return [];
  const out: UtangTransaction[] = [];
  raw.forEach((item, idx) => {
    if (!isPlainRecord(item)) return;
    const customerId = cleanText(item.customerId, '', 80);
    if (!customerId) return;
    out.push({
      id: cleanText(item.id, `UTX-${idx}`, 80) || `UTX-${idx}`,
      customerId,
      customerName: cleanText(item.customerName, 'Customer', 120),
      type: item.type === 'payment' ? 'payment' : 'charge',
      amount: nonNegativeRound2(item.amount, 0),
      balanceAfter: nonNegativeRound2(item.balanceAfter, 0),
      receiptNo: cleanOptionalText(item.receiptNo, 60),
      paymentMethod: cleanOptionalText(item.paymentMethod, 40),
      note: cleanOptionalText(item.note, 200),
      dateIso: cleanText(item.dateIso, new Date().toISOString(), 40) || new Date().toISOString(),
      cashierName: cleanOptionalText(item.cashierName, 80),
    });
  });
  return out;
}

function sanitizeRepackRules(raw: unknown): RepackRule[] {
  if (!Array.isArray(raw)) return [];
  const out: RepackRule[] = [];
  raw.forEach((item, idx) => {
    if (!isPlainRecord(item)) return;
    const masterProductId = cleanText(item.masterProductId, '', 80);
    const targetProductId = cleanText(item.targetProductId, '', 80);
    const yieldQty = nonNegativeRound3(item.yieldQty, 0);
    if (!masterProductId || !targetProductId || yieldQty <= 0) return;
    out.push({
      id: cleanText(item.id, `rpk-${idx}`, 80) || `rpk-${idx}`,
      name: cleanText(item.name, 'Bulk → Tingi', 120) || 'Bulk → Tingi',
      masterProductId,
      targetProductId,
      yieldQty,
      autoComputeCost: typeof item.autoComputeCost === 'boolean' ? item.autoComputeCost : true,
      updatedAt: cleanText(item.updatedAt, new Date().toISOString(), 40) || new Date().toISOString(),
    });
  });
  return out;
}

function sanitizeRepackLog(raw: unknown): RepackLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RepackLogEntry[] = [];
  raw.forEach((item, idx) => {
    if (!isPlainRecord(item)) return;
    const masterProductId = cleanText(item.masterProductId, '', 80);
    const targetProductId = cleanText(item.targetProductId, '', 80);
    if (!masterProductId || !targetProductId) return;
    out.push({
      id: cleanText(item.id, `RPK-${idx}`, 80) || `RPK-${idx}`,
      dateIso: cleanText(item.dateIso, new Date().toISOString(), 40) || new Date().toISOString(),
      ruleId: cleanText(item.ruleId, '', 80),
      masterProductId,
      masterName: cleanText(item.masterName, masterProductId, 160),
      masterQtyUsed: nonNegativeRound3(item.masterQtyUsed, 0),
      targetProductId,
      targetName: cleanText(item.targetName, targetProductId, 160),
      targetQtyAdded: nonNegativeRound3(item.targetQtyAdded, 0),
      unitCost: nonNegativeRound2(item.unitCost, 0),
      cashierName: cleanOptionalText(item.cashierName, 80),
    });
  });
  return out;
}

function sanitizeDrawerEvents(raw: unknown): CashDrawerEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: CashDrawerEvent[] = [];
  raw.forEach((item, idx) => {
    if (!isPlainRecord(item)) return;
    const amount = nonNegativeRound2(item.amount, 0);
    if (amount <= 0) return;
    out.push({
      id: cleanText(item.id, `DRW-${idx}`, 80) || `DRW-${idx}`,
      dateIso: cleanText(item.dateIso, new Date().toISOString(), 40) || new Date().toISOString(),
      type: cleanText(item.type, 'expense', 30) || 'expense',
      category: cleanText(item.category, 'EXPENSE', 60) || 'EXPENSE',
      amount,
      note: cleanOptionalText(item.note, 200),
      cashierName: cleanOptionalText(item.cashierName, 80),
      shiftId: cleanOptionalText(item.shiftId, 80),
    });
  });
  return out;
}

function sanitizeDigitalServices(raw: unknown): DigitalServiceEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: DigitalServiceEntry[] = [];
  raw.forEach((item, idx) => {
    if (!isPlainRecord(item)) return;
    const amount = nonNegativeRound2(item.amount, 0);
    if (amount <= 0) return;
    out.push({
      id: cleanText(item.id, `DIG-${idx}`, 80) || `DIG-${idx}`,
      dateIso: cleanText(item.dateIso, new Date().toISOString(), 40) || new Date().toISOString(),
      kind: cleanText(item.kind, 'GCASH_IN', 40) || 'GCASH_IN',
      amount,
      fee: nonNegativeRound2(item.fee, 0),
      reference: cleanOptionalText(item.reference, 80),
      customerPhone: cleanOptionalText(item.customerPhone, 40),
      cashierName: cleanOptionalText(item.cashierName, 80),
    });
  });
  return out;
}

function sanitizeStockLog(raw: unknown): StockLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: StockLogEntry[] = [];
  raw.forEach((item, idx) => {
    if (!isPlainRecord(item)) return;
    const productId = cleanText(item.productId, '', 80);
    if (!productId) return;
    const delta = Number.isFinite(Number(item.delta)) ? PosMath.round3(Number(item.delta)) : 0;
    out.push({
      id: cleanText(item.id, `LOG-${idx}`, 80) || `LOG-${idx}`,
      dateIso: cleanText(item.dateIso, new Date().toISOString(), 40) || new Date().toISOString(),
      productId,
      productName: cleanText(item.productName, productId, 160),
      delta,
      prevStock: nonNegativeRound3(item.prevStock, 0),
      newStock: nonNegativeRound3(item.newStock, 0),
      reason: cleanText(item.reason, 'Adjustment', 60) || 'Adjustment',
      note: cleanOptionalText(item.note, 200),
    });
  });
  return out;
}

function sanitizeCashiers(raw: unknown): CashierAccount[] {
  if (!Array.isArray(raw)) return [];
  const out: CashierAccount[] = [];
  raw.forEach((item, idx) => {
    if (!isPlainRecord(item)) return;
    const name = cleanText(item.name, '', 80);
    if (!name) return;
    out.push({
      id: cleanText(item.id, `cashier-${idx}`, 80) || `cashier-${idx}`,
      name,
      role: cleanText(item.role, 'cashier', 20) || 'cashier',
      active: typeof item.active === 'boolean' ? item.active : true,
      createdAt: cleanText(item.createdAt, new Date().toISOString(), 40) || new Date().toISOString(),
    });
  });
  return out;
}

function sanitizeActiveShift(raw: unknown): ActiveShiftState | null {
  if (!isPlainRecord(raw)) return null;
  const cashierId = cleanText(raw.cashierId, '', 80);
  const cashierName = cleanText(raw.cashierName, '', 80);
  if (!cashierId || !cashierName) return null;
  return {
    shiftId: cleanText(raw.shiftId, `SHIFT-${Date.now()}`, 80),
    cashierId,
    cashierName,
    cashierRole: cleanText(raw.cashierRole, 'cashier', 20) || 'cashier',
    openedAt: cleanText(raw.openedAt, new Date().toISOString(), 40) || new Date().toISOString(),
    openingFloat: nonNegativeRound2(raw.openingFloat, 0),
  };
}

function sanitizeSettings(raw: Record<string, unknown>): StoreSettings {
  const repoRaw = cleanText(raw.githubRepo, DEFAULT_STORE_SETTINGS.githubRepo, 120);
  const repoValid = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoRaw)
    ? repoRaw
    : DEFAULT_STORE_SETTINGS.githubRepo;

  const capNum = Number(raw.scDiscountCap);
  const scDiscountCap =
    Number.isFinite(capNum) && capNum >= 1 ? PosMath.round2(capNum) : DEFAULT_STORE_SETTINGS.scDiscountCap;
  const lowNum = Number(raw.lowStockThreshold);
  const lowStockThreshold =
    Number.isFinite(lowNum) && lowNum >= 1 ? PosMath.round3(lowNum) : DEFAULT_STORE_SETTINGS.lowStockThreshold;
  const wsNum = Number(raw.defaultWholesaleMinQty);
  const defaultWholesaleMinQty =
    Number.isFinite(wsNum) && wsNum >= 1
      ? PosMath.round3(wsNum)
      : DEFAULT_STORE_SETTINGS.defaultWholesaleMinQty;

  return {
    ...DEFAULT_STORE_SETTINGS,
    storeName: cleanText(raw.storeName, DEFAULT_STORE_SETTINGS.storeName, 80) || DEFAULT_STORE_SETTINGS.storeName,
    storeAddress: cleanText(raw.storeAddress, DEFAULT_STORE_SETTINGS.storeAddress, 160),
    storeTin: cleanText(raw.storeTin, DEFAULT_STORE_SETTINGS.storeTin, 60),
    storePhone: cleanText(raw.storePhone, DEFAULT_STORE_SETTINGS.storePhone, 40),
    receiptFooter: cleanText(raw.receiptFooter, DEFAULT_STORE_SETTINGS.receiptFooter, 160),
    receiptWidth: raw.receiptWidth === '58mm' ? '58mm' : '80mm',
    storeIcon: cleanText(raw.storeIcon, DEFAULT_STORE_SETTINGS.storeIcon, 30) || DEFAULT_STORE_SETTINGS.storeIcon,
    scDiscountCap,
    lowStockThreshold,
    defaultWholesaleMinQty,
    beep: typeof raw.beep === 'boolean' ? raw.beep : DEFAULT_STORE_SETTINGS.beep,
    vibrateOnScan:
      typeof raw.vibrateOnScan === 'boolean' ? raw.vibrateOnScan : DEFAULT_STORE_SETTINGS.vibrateOnScan,
    lockWholePos:
      typeof raw.lockWholePos === 'boolean' ? raw.lockWholePos : DEFAULT_STORE_SETTINGS.lockWholePos,
    autoLockMinutes: positiveInt(raw.autoLockMinutes, DEFAULT_STORE_SETTINGS.autoLockMinutes, 1440),
    qrPayLabel: cleanOptionalText(raw.qrPayLabel, 60),
    qrAccountNumber: cleanOptionalText(raw.qrAccountNumber, 60),
    qrMerchantName: cleanOptionalText(raw.qrMerchantName, 100),
    qrEmvPayload: cleanOptionalText(raw.qrEmvPayload, 600),
    githubRepo: repoValid,
    autoUpdateEnabled:
      typeof raw.autoUpdateEnabled === 'boolean'
        ? raw.autoUpdateEnabled
        : DEFAULT_STORE_SETTINGS.autoUpdateEnabled,
    zCount: positiveInt(raw.zCount, DEFAULT_STORE_SETTINGS.zCount),
    expiryWarnDays: Math.max(1, positiveInt(raw.expiryWarnDays, DEFAULT_STORE_SETTINGS.expiryWarnDays, 3650)),
    reorderLeadDays: Math.max(1, positiveInt(raw.reorderLeadDays, DEFAULT_STORE_SETTINGS.reorderLeadDays, 365)),
    reorderSafetyDays: Math.max(1, positiveInt(raw.reorderSafetyDays, DEFAULT_STORE_SETTINGS.reorderSafetyDays, 365)),
    loyaltyPesoPerPoint: Math.max(
      1,
      nonNegativeRound2(raw.loyaltyPesoPerPoint, DEFAULT_STORE_SETTINGS.loyaltyPesoPerPoint) || 50
    ),
    loyaltyPointValue: Math.max(
      0.01,
      nonNegativeRound2(raw.loyaltyPointValue, DEFAULT_STORE_SETTINGS.loyaltyPointValue) || 1
    ),
    // PIN credentials are always retained from the active device vault
    adminPinHash: null,
    adminPinSalt: null,
    adminPinIter: DEFAULT_STORE_SETTINGS.adminPinIter,
  };
}

export type SanitizeBackupResult =
  | { ok: true; payload: PosBackupPayload }
  | { ok: false; error: string };

export function sanitizeBackupPayload(rawJson: string): SanitizeBackupResult {
  if (typeof rawJson !== 'string' || !rawJson.trim()) {
    return { ok: false, error: 'Backup file is empty.' };
  }
  let decoded: unknown;
  try {
    decoded = stripForbiddenKeys(JSON.parse(rawJson));
  } catch {
    return { ok: false, error: 'Invalid or corrupted JSON backup file.' };
  }
  if (
    !isPlainRecord(decoded) ||
    !Array.isArray(decoded.products) ||
    !Array.isArray(decoded.sales) ||
    !isPlainRecord(decoded.settings)
  ) {
    return { ok: false, error: 'Invalid backup structure (requires products, sales, and settings).' };
  }

  const products = decoded.products
    .map((item, idx) => sanitizeProduct(item, idx))
    .filter((p): p is Product => p !== null);

  if (decoded.products.length > 0 && products.length === 0) {
    return { ok: false, error: 'Backup contains no valid products.' };
  }

  const sales = decoded.sales
    .map((item, idx) => {
      const rec = sanitizeSaleRecord(item, idx);
      if (!rec) return null;
      const { _idx: _, ...clean } = rec as SaleRecord & { _idx?: number };
      return clean as SaleRecord;
    })
    .filter((s): s is SaleRecord => s !== null);

  const customCategories = Array.isArray(decoded.customCategories)
    ? Array.from(
        new Set(
          decoded.customCategories
            .map((c) => cleanText(c, '', 60))
            .filter((c) => c.length > 0)
        )
      )
    : [];

  return {
    ok: true,
    payload: {
      app: 'eternalblue-pos',
      version: cleanText(decoded.version, PosMath.APP_VERSION, 30) || PosMath.APP_VERSION,
      exportedAt: cleanText(decoded.exportedAt, new Date().toISOString(), 40),
      sourceDeviceId: cleanOptionalText(decoded.sourceDeviceId, 80) ?? undefined,
      sourceDeviceLabel: cleanOptionalText(decoded.sourceDeviceLabel, 40) ?? undefined,
      settings: sanitizeSettings(decoded.settings),
      products,
      sales,
      heldOrders: sanitizeHeldOrders(decoded.heldOrders),
      sukiCustomers: sanitizeSukiCustomers(decoded.sukiCustomers),
      utangTransactions: sanitizeUtangTx(decoded.utangTransactions),
      repackRules: sanitizeRepackRules(decoded.repackRules),
      repackLog: sanitizeRepackLog(decoded.repackLog),
      drawerEvents: sanitizeDrawerEvents(decoded.drawerEvents),
      digitalServices: sanitizeDigitalServices(decoded.digitalServices),
      stockLog: sanitizeStockLog(decoded.stockLog),
      cashiers: sanitizeCashiers(decoded.cashiers),
      activeShift: sanitizeActiveShift(decoded.activeShift),
      customCategories,
    },
  };
}
