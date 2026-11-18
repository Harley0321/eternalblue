import type {
  CartLine,
  CartTotals,
  ConfigSnapshot,
  HeldOrder,
  Product,
  SaleItem,
  SaleRecord,
  StockLogEntry,
  StoreSettings,
} from '../types';

export const STORAGE_KEYS = {
  PRODUCTS: 'omnimart_ph_products_v1',
  SALES: 'omnimart_ph_sales_v1',
  HELD: 'omnimart_ph_held_v1',
  SETTINGS: 'omnimart_ph_settings_v1',
  PINLOCK: 'omnimart_ph_pinlock_v1',
  SCANPREFS: 'omnimart_ph_scanprefs_v1',
  STOCKLOG: 'omnimart_ph_stocklog_v1', // strictly additive log; never modifies existing keys
  CONFIG_HISTORY: 'omnimart_ph_config_history_v1', // strictly additive configuration revision history
  SECURITY_LOG: 'omnimart_ph_seclog_v1', // strictly additive tamper-evident hash-chained audit ledger
  SYNC_TOMBSTONES: 'omnimart_ph_sync_tombstones_v1', // strictly additive cloud sync deletion tombstones
  DEVICE_SYNC_ID: 'omnimart_ph_device_id_v1', // unique persistent device ID separating mobile, tablet, and PC data
} as const;

export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'OmniMart PH Supermarket',
  storeAddress: 'Mangatarem, Pangasinan, Philippines',
  storeTin: 'NON-VAT / NON-BIR INVOICE',
  zCount: 0,
  storePhone: '',
  receiptFooter: 'Thank you for shopping with us!',
  lowStockThreshold: 10,
  expiryWarnDays: 30,
  reorderLeadDays: 3,
  reorderSafetyDays: 2,
  beep: true,
  vibrate: true,
  lastBackup: '',
  scDiscountCap: 125,
  receiptWidth: '80mm',
  autoLockMinutes: 5,
  lockWholePos: false,
  syncEnabled: false,
  syncStoreId: '',
  syncStoreIdCustomized: false,
  lastSyncedAt: '',
};

export type DeviceFormFactor = 'mobile' | 'tablet' | 'pc';

export function detectDeviceFormFactor(
  userAgent = '',
  maxTouchPoints = 0,
  screenWidth = 1024,
): DeviceFormFactor {
  const ua = String(userAgent || '').toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) {
    return 'tablet';
  }
  // iPadOS desktop-mode Safari reports Macintosh + touch points
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) {
    return 'tablet';
  }
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) {
    return 'mobile';
  }
  if (maxTouchPoints > 0 && screenWidth > 0 && screenWidth <= 767) {
    return 'mobile';
  }
  if (maxTouchPoints > 0 && screenWidth >= 768 && screenWidth <= 1180) {
    return 'tablet';
  }
  return 'pc';
}

export function generateDeviceSyncId(formFactor: DeviceFormFactor, randomHex?: string): string {
  const cleaned = String(randomHex || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);
  const token =
    cleaned ||
    (() => {
      if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(4);
        globalThis.crypto.getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      }
      return Math.floor(Math.random() * 0xffffffff)
        .toString(16)
        .padStart(8, '0');
    })();
  return `${formFactor}-${token}`;
}

export const BASE_CATEGORIES = [
  'Frozen Meat',
  'Rice & Staples',
  'Canned & Noodles',
  'Beverages',
  'Dairy & Bakery',
  'Condiments & Cooking',
  'Snacks & Biscuits',
  'Personal & Home',
];

export const DAY_MS = 86400000;

export function toCents(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(Number((x * 100).toPrecision(12)));
}

export function fromCents(c: number): number {
  return c / 100;
}

export function round2(n: unknown): number {
  return fromCents(toCents(n));
}

export function lineCents(unitPrice: unknown, qty: unknown): number {
  const q = Math.round((Number(qty) || 0) * 1000);
  return Math.round(Number(((toCents(unitPrice) * q) / 1000).toPrecision(12)));
}

export function lineTotalPeso(unitPrice: unknown, qty: unknown): number {
  return fromCents(lineCents(unitPrice, qty));
}

export function sumPeso<T>(list: T[], pick?: (item: T) => unknown): number {
  let c = 0;
  for (const x of list) {
    c += toCents(pick ? pick(x) : x);
  }
  return fromCents(c);
}

export function formatPeso(amount: unknown): string {
  const num = Number(amount) || 0;
  return '₱' + num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatQty(q: unknown, unit = ''): string {
  const n = Number((Number(q) || 0).toFixed(3));
  return unit ? `${n} ${unit}` : String(n);
}

export type ProductLookup = Product[] | Map<string, Product>;

export function buildProductMap(products: Product[]): Map<string, Product> {
  const map = new Map<string, Product>();
  for (const p of products) map.set(p.id, p);
  return map;
}

function lookupProduct(products: ProductLookup, productId: string): Product | undefined {
  return products instanceof Map ? products.get(productId) : products.find((x) => x.id === productId);
}

export function linePricing(
  item: Pick<CartLine, 'productId' | 'retailPrice' | 'wholesalePrice' | 'wholesaleMinQty'>,
  products: ProductLookup,
) {
  const p = lookupProduct(products, item.productId);
  const src = p || item;
  const minQty = Number(src.wholesaleMinQty) > 0 ? Number(src.wholesaleMinQty) : 10;
  return {
    retail: Number(src.retailPrice) || 0,
    wholesale: Number(src.wholesalePrice) || 0,
    capital: p && Number(p.capital) > 0 ? Number(p.capital) : 0,
    minQty,
  };
}

export type WholesaleBlockReason = null | 'none' | 'cost' | 'qty';

export function wholesaleBlock(
  item: Pick<CartLine, 'productId' | 'retailPrice' | 'wholesalePrice' | 'wholesaleMinQty' | 'qty'>,
  products: ProductLookup,
): WholesaleBlockReason {
  const pr = linePricing(item, products);
  if (!(pr.wholesale > 0) || !(pr.wholesale < pr.retail)) return 'none';
  if (pr.capital > 0 && pr.wholesale < pr.capital) return 'cost';
  if (!(Number(item.qty) + 1e-9 >= pr.minQty)) return 'qty';
  return null;
}

export function isWholesaleLine(
  item: Pick<CartLine, 'productId' | 'retailPrice' | 'wholesalePrice' | 'wholesaleMinQty' | 'qty' | 'priceType'>,
  products: ProductLookup,
): boolean {
  return item.priceType === 'wholesale' && wholesaleBlock(item, products) === null;
}

export function getLinePrice(
  item: Pick<CartLine, 'productId' | 'retailPrice' | 'wholesalePrice' | 'wholesaleMinQty' | 'qty' | 'priceType'>,
  products: ProductLookup,
): number {
  const pr = linePricing(item, products);
  return round2(isWholesaleLine(item, products) ? pr.wholesale : pr.retail);
}

// Senior / PWD 5% eligibility (only basic necessities & prime commodities)
const SC_EXCLUDE =
  /\b(chips|crisps|candy|candies|chocolate|biscuit|biscuits|cracker|crackers|cookie|cookies|wafer|cola|coke|sprite|pepsi|soda|juice|energy|beer|wine|gin|rum|whisky|whiskey|vodka|brandy|cigarette|cigarettes|tobacco|shampoo|conditioner|lotion|toothpaste|ice cream|cake|pastry|baby oil)\b/i;
const SC_NAME_YES =
  /\b(rice|bigas|sugar|asukal|salt|asin|cooking oil|egg|eggs|itlog|milk|gatas|coffee|kape|nescafe|kopiko|bread|pandesal|noodle|noodles|pancit|sardine|sardines|tuna|corned|luncheon|hotdog|tocino|longganisa|chicken|manok|pork|baboy|beef|meat|fish|isda|bangus|tilapia|galunggong|vegetable|vegetables|gulay|onion|sibuyas|garlic|bawang|flour|vinegar|suka|soy sauce|toyo|patis|detergent|laundry|soap|sabon|candle|candles|kandila|bottled water|mineral water|corn|mais)\b/i;
const SC_CAT_YES = /(meat|rice|staple|fish|seafood|egg|vegetable|fruit|noodle|canned)/i;

export function scSuggest(p: { name?: string; category?: string } | null | undefined): boolean {
  const name = String((p && p.name) || '');
  const cat = String((p && p.category) || '');
  if (SC_EXCLUDE.test(name)) return false;
  return SC_NAME_YES.test(name) || SC_CAT_YES.test(cat);
}

export function scEligibleProduct(p: { name?: string; category?: string; scEligible?: boolean } | null | undefined): boolean {
  if (p && typeof p.scEligible === 'boolean') return p.scEligible;
  return scSuggest(p);
}

export function scEligibleLine(item: Pick<CartLine, 'productId' | 'name'>, products: ProductLookup): boolean {
  const p = lookupProduct(products, item.productId);
  return scEligibleProduct(p || item);
}

export function scCapCents(settings: Pick<StoreSettings, 'scDiscountCap'>): number {
  const c = Number(settings.scDiscountCap);
  return toCents(c > 0 ? c : 125);
}

export function computeCartTotals(
  cart: CartLine[],
  products: ProductLookup,
  isSeniorPwd: boolean,
  settings: Pick<StoreSettings, 'scDiscountCap'>,
): CartTotals {
  let retailC = 0;
  let savingsC = 0;
  let eligC = 0;
  let eligKinds = 0;
  let otherLines = 0;

  for (const item of cart) {
    const pr = linePricing(item, products);
    const lineRetailC = lineCents(pr.retail, item.qty);
    const lineEffectiveC = lineCents(getLinePrice(item, products), item.qty);
    const lineSavingC = Math.max(0, lineRetailC - lineEffectiveC);
    retailC += lineRetailC;
    savingsC += lineSavingC;
    if (isSeniorPwd) {
      if (scEligibleLine(item, products)) {
        eligC += lineRetailC - lineSavingC;
        eligKinds++;
      } else {
        otherLines++;
      }
    }
  }

  const netC = retailC - savingsC;
  const rawSeniorC = isSeniorPwd ? Math.round((eligC * 5) / 100) : 0;
  const capC = scCapCents(settings);
  const seniorC = Math.min(rawSeniorC, capC);
  const grandC = Math.max(0, netC - seniorC);

  return {
    retailSubtotal: fromCents(retailC),
    wholesaleSavings: fromCents(savingsC),
    seniorDiscount: fromCents(seniorC),
    grandTotal: fromCents(grandC),
    isSeniorPwd,
    seniorBase: fromCents(eligC),
    seniorCapped: rawSeniorC > capC,
    seniorCap: fromCents(capC),
    scKinds: eligKinds,
    scOtherLines: otherLines,
  };
}

// Expiry helpers
export interface ExpiryStatus {
  status: 'none' | 'expired' | 'soon' | 'ok';
  days: number | null;
}

export function expiryInfo(
  p: Pick<Product, 'expiry'> | null | undefined,
  expiryWarnDays = 30,
  nowDate: Date = new Date(),
): ExpiryStatus {
  if (!p || !p.expiry || !/^\d{4}-\d{2}-\d{2}$/.test(p.expiry)) {
    return { status: 'none', days: null };
  }
  const [y, m, d] = p.expiry.split('-').map(Number);
  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const days = Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / DAY_MS);
  const warn = Number(expiryWarnDays) > 0 ? Number(expiryWarnDays) : 30;
  if (days <= 0) return { status: 'expired', days };
  if (days <= warn) return { status: 'soon', days };
  return { status: 'ok', days };
}

export function expiryLabel(
  p: Pick<Product, 'expiry'> | null | undefined,
  expiryWarnDays = 30,
  nowDate: Date = new Date(),
): string {
  const e = expiryInfo(p, expiryWarnDays, nowDate);
  if (e.status === 'expired') return e.days === 0 ? 'EXPIRES TODAY' : `EXPIRED ${-(e.days ?? 0)}d ago`;
  if (e.status === 'soon') return `Exp in ${e.days}d`;
  return '';
}

// Barcode helpers
export function normBarcode(c: unknown): string {
  const s = String(c == null ? '' : c).trim().toLowerCase().replace(/\s+/g, '');
  return /^\d+$/.test(s) ? s.replace(/^0+/, '') : s;
}

export function normalizeBarcodeFormat(format?: string): string {
  const raw = String(format || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!raw) return '';
  if (raw === 'ean13') return 'ean_13';
  if (raw === 'ean8') return 'ean_8';
  if (raw === 'upca') return 'upc_a';
  if (raw === 'upce') return 'upc_e';
  if (raw === 'code128') return 'code_128';
  if (raw === 'code39' || raw === 'code39std' || raw === 'code39ext') return 'code_39';
  if (raw === 'code93') return 'code_93';
  if (raw === 'itf' || raw === 'itf14') return 'itf';
  if (raw === 'qrcode' || raw === 'qrcodemodel1' || raw === 'qrcodemodel2' || raw === 'microqrcode') return 'qr_code';
  if (raw === 'datamatrix') return 'data_matrix';
  if (raw === 'aztec' || raw === 'azteccode') return 'aztec';
  if (raw === 'pdf417' || raw === 'compactpdf417') return 'pdf417';
  if (raw.startsWith('databar')) return 'gs1_databar';
  return String(format || '').trim().toLowerCase();
}

export function eanCheckOk(code: string): boolean {
  if (!/^\d+$/.test(code) || code.length < 2) return false;
  const d = code.split('').map(Number);
  const check = d.pop()!;
  let sum = 0;
  for (let i = d.length - 1, w = 3; i >= 0; i--, w = 4 - w) sum += d[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Expands an 8-digit UPC-E (number system 0/1 + 6 digits + check digit) into its 12-digit UPC-A equivalent.
 */
export function expandUpcE(code: string): string | null {
  const s = String(code || '').trim();
  if (!/^[01]\d{7}$/.test(s)) return null;
  const ns = s[0];
  const d1 = s[1];
  const d2 = s[2];
  const d3 = s[3];
  const d4 = s[4];
  const d5 = s[5];
  const d6 = s[6];
  const check = s[7];

  let body11 = '';
  if (d6 === '0' || d6 === '1' || d6 === '2') {
    body11 = `${ns}${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  } else if (d6 === '3') {
    body11 = `${ns}${d1}${d2}${d3}00000${d4}${d5}`;
  } else if (d6 === '4') {
    body11 = `${ns}${d1}${d2}${d3}${d4}00000${d5}`;
  } else {
    body11 = `${ns}${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  }

  const candidate = body11 + check;
  return eanCheckOk(candidate) ? candidate : null;
}

export function findProductByBarcode(code: string, products: Product[]): Product | undefined {
  const n = normBarcode(code);
  if (!n) return undefined;
  const direct = products.find((p) => normBarcode(p.barcode) === n);
  if (direct) return direct;

  // Try UPC-E (8-digit) -> UPC-A (12-digit) expansion
  const trimmed = String(code || '').trim();
  if (/^[01]\d{7}$/.test(trimmed)) {
    const upca = expandUpcE(trimmed);
    if (upca) {
      const expandedNorm = normBarcode(upca);
      return products.find((p) => normBarcode(p.barcode) === expandedNorm);
    }
  }
  return undefined;
}

export function isStrongRead(code: string, format?: string): boolean {
  const fmt = normalizeBarcodeFormat(format);
  if (fmt === 'qr_code' || fmt === 'data_matrix' || fmt === 'aztec' || fmt === 'pdf417') {
    return String(code || '').trim().length >= 3;
  }
  if (!/^\d+$/.test(code)) return false;
  if (code.length === 13 || code.length === 12 || code.length === 14) return eanCheckOk(code);
  if (code.length === 8) return fmt !== 'upc_e' && eanCheckOk(code);
  return false;
}

export function extractGs1Gtin(raw: string): string {
  const s = String(raw || '').trim();
  const m = /^(?:\][A-Za-z]\d)?\(?01\)?(\d{14})(?:$|[^\d]|\(\d{2}\)|\d{2})/.exec(s);
  if (!m) return '';
  const g = m[1];
  if (!eanCheckOk(g)) return '';
  return g.charAt(0) === '0' ? g.slice(1) : g;
}

export interface ScanConsensusState {
  voteCode: string;
  voteCount: number;
  voteTime: number;
  lastAcceptedCode: string;
  lastAcceptedTime: number;
}

export function createScanConsensusState(): ScanConsensusState {
  return {
    voteCode: '',
    voteCount: 0,
    voteTime: 0,
    lastAcceptedCode: '',
    lastAcceptedTime: 0,
  };
}

export function evaluateScanCandidate(
  state: ScanConsensusState,
  rawCode: string,
  options: {
    format?: string;
    source: 'camera' | 'photo' | 'manual';
    nowMs?: number;
    cooldownMs?: number;
    voteWindowMs?: number;
  },
): { accept: boolean; code: string; reason: 'accepted' | 'cooldown' | 'need_vote' | 'empty' } {
  const extracted = extractGs1Gtin(rawCode);
  const cleaned = extracted || String(rawCode || '').trim();
  if (!cleaned) {
    return { accept: false, code: '', reason: 'empty' };
  }

  const now = options.nowMs ?? Date.now();
  const cooldownMs = options.cooldownMs ?? 1350;
  const voteWindowMs = options.voteWindowMs ?? 900;

  if (options.source === 'camera') {
    if (state.lastAcceptedCode === cleaned && now - state.lastAcceptedTime < cooldownMs) {
      return { accept: false, code: cleaned, reason: 'cooldown' };
    }

    if (!isStrongRead(cleaned, options.format)) {
      if (state.voteCode === cleaned && now - state.voteTime <= voteWindowMs) {
        state.voteCount += 1;
      } else {
        state.voteCode = cleaned;
        state.voteCount = 1;
      }
      state.voteTime = now;
      if (state.voteCount < 2) {
        return { accept: false, code: cleaned, reason: 'need_vote' };
      }
    }
  }

  state.voteCode = '';
  state.voteCount = 0;
  state.voteTime = 0;
  state.lastAcceptedCode = cleaned;
  state.lastAcceptedTime = now;
  return { accept: true, code: cleaned, reason: 'accepted' };
}

// Date & Analytics helpers
export function startOfDay(d: Date | string | number): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function inRange(s: Pick<SaleRecord, 'dateIso'>, from: Date, to: Date): boolean {
  const t = new Date(s.dateIso).getTime();
  return t >= from.getTime() && t < to.getTime();
}

export function nextReceiptNo(sales: SaleRecord[], now: Date = new Date()): string {
  const prefix =
    'OR-' +
    now.getFullYear().toString().slice(-2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    '-';
  let seq = sales.filter((s) => s.receiptNo && s.receiptNo.startsWith(prefix)).length + 1;
  let no = prefix + String(seq).padStart(4, '0');
  while (sales.some((s) => s.receiptNo === no)) {
    seq++;
    no = prefix + String(seq).padStart(4, '0');
  }
  return no;
}

export function itemUnitCapital(it: SaleItem, prodById?: Map<string, Product>, products?: Product[]): number {
  let c = Number(it.capital) || 0;
  if (!(c > 0)) {
    const prod = prodById
      ? it.productId
        ? prodById.get(it.productId)
        : undefined
      : products?.find((x) => it.productId && x.id === it.productId);
    c = prod && Number(prod.capital) > 0 ? Number(prod.capital) : 0;
  }
  return c > 0 ? c : 0;
}

export function saleLineRevenueC(
  s: SaleRecord,
  prodById?: Map<string, Product>,
  products?: Product[],
): number[] {
  const items = s.items || [];
  const lineC = items.map((it) => toCents(it.lineTotal));
  const discC = toCents(s.seniorDiscount || 0);
  let rev = lineC.slice();

  if (discC > 0) {
    const elig = items.map((it) => {
      const p = prodById
        ? it.productId
          ? prodById.get(it.productId)
          : undefined
        : products?.find((x) => it.productId && x.id === it.productId);
      return scEligibleProduct(p || it);
    });
    const eligSum = lineC.reduce((a, c, i) => a + (elig[i] ? c : 0), 0);
    if (eligSum > 0) {
      rev = lineC.map((c, i) => (elig[i] ? c - (discC * c) / eligSum : c));
    }
  }

  const revSum = rev.reduce((a, b) => a + b, 0);
  const g = toCents(s.grandTotal);
  if (revSum > 0 && Math.abs(revSum - g) > 1) {
    rev = rev.map((r) => (r * g) / revSum);
  }
  return rev;
}

export function saleProfitCalc(
  s: SaleRecord,
  prodById?: Map<string, Product>,
  products?: Product[],
): number | null {
  const items = s.items || [];
  const revLines = saleLineRevenueC(s, prodById, products);
  let revC = 0;
  let costC = 0;
  let known = false;
  items.forEach((it, i) => {
    const c = itemUnitCapital(it, prodById, products);
    if (!(c > 0)) return;
    known = true;
    revC += revLines[i];
    costC += c * 100 * (Number(it.qty) || 0);
  });
  return known ? round2((revC - costC) / 100) : null;
}

export function profitLastDays(sales: SaleRecord[], products: Product[], days: number, nowMs = Date.now()): number | null {
  const cutoff = nowMs - days * DAY_MS;
  const prodById = new Map(products.map((p) => [p.id, p]));
  let total = 0;
  let known = false;
  for (const s of sales) {
    if (s.voided) continue;
    const t = new Date(s.dateIso).getTime();
    if (!(t >= cutoff)) continue;
    const pr = saleProfitCalc(s, prodById, products);
    if (pr !== null) {
      total += pr;
      known = true;
    }
  }
  return known ? round2(total) : null;
}

export interface SalesStats {
  profit: number;
  gross: number;
  net: number;
  count: number;
  items: number;
  seniorDisc: number;
  wholesaleDisc: number;
  tender: Record<string, { n: number; amt: number }>;
  hours: Record<number, number>;
  days: Record<string, number>;
  products: Record<string, { qty: number; amt: number; unit: string }>;
  cats: Record<string, number>;
}

export function computeSalesStats(list: SaleRecord[], products: Product[]): SalesStats {
  const prodById = new Map(products.map((p) => [p.id, p]));
  const prodByName = new Map<string, Product>();
  for (const p of products) {
    if (!prodByName.has(p.name)) prodByName.set(p.name, p);
  }

  const st: SalesStats = {
    profit: 0,
    gross: 0,
    net: 0,
    count: list.length,
    items: 0,
    seniorDisc: 0,
    wholesaleDisc: 0,
    tender: {},
    hours: {},
    days: {},
    products: {},
    cats: {},
  };

  for (const s of list) {
    st.net += Number(s.grandTotal) || 0;
    const sp = saleProfitCalc(s, prodById, products);
    if (sp !== null) st.profit += sp;
    st.gross += s.retailSubtotal != null ? Number(s.retailSubtotal) || 0 : Number(s.grandTotal) || 0;
    st.seniorDisc += Number(s.seniorDiscount) || 0;
    st.wholesaleDisc += Number(s.wholesaleSavings) || 0;

    const m = s.paymentMethod || 'Cash';
    if (!st.tender[m]) st.tender[m] = { n: 0, amt: 0 };
    st.tender[m].n++;
    st.tender[m].amt += Number(s.grandTotal) || 0;

    const dObj = new Date(s.dateIso);
    const hr = dObj.getHours();
    st.hours[hr] = (st.hours[hr] || 0) + (Number(s.grandTotal) || 0);
    const dayKey = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
    st.days[dayKey] = (st.days[dayKey] || 0) + (Number(s.grandTotal) || 0);

    for (const it of s.items || []) {
      st.items += it.unit === 'kg' ? 1 : Number(it.qty) || 0;
      const k = it.name;
      if (!st.products[k]) st.products[k] = { qty: 0, amt: 0, unit: it.unit };
      st.products[k].qty += Number(it.qty) || 0;
      st.products[k].amt += Number(it.lineTotal) || 0;

      const prod = (it.productId && prodById.get(it.productId)) || prodByName.get(it.name);
      const c = it.category || (prod ? prod.category : 'Uncategorized');
      st.cats[c] = (st.cats[c] || 0) + (Number(it.lineTotal) || 0);
    }
  }

  st.profit = round2(st.profit);
  st.gross = round2(st.gross);
  st.net = round2(st.net);
  st.seniorDisc = round2(st.seniorDisc);
  st.wholesaleDisc = round2(st.wholesaleDisc);
  Object.values(st.tender).forEach((v) => {
    v.amt = round2(v.amt);
  });
  Object.keys(st.hours).forEach((h) => {
    const k = Number(h);
    st.hours[k] = round2(st.hours[k]);
  });
  Object.keys(st.days).forEach((d) => {
    st.days[d] = round2(st.days[d]);
  });
  Object.values(st.products).forEach((v) => {
    v.amt = round2(v.amt);
  });
  Object.keys(st.cats).forEach((c) => {
    st.cats[c] = round2(st.cats[c]);
  });

  return st;
}

export interface DailySalesPoint {
  dateKey: string;
  label: string;
  shortDay: string;
  fullDate: string;
  netSales: number;
  orders: number;
}

function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function computeLast7DaysNetSales(
  sales: SaleRecord[],
  nowDate: Date = new Date(),
): DailySalesPoint[] {
  const todayStart = startOfDay(nowDate);
  const buckets = new Map<string, { cents: number; orders: number }>();
  const points: DailySalesPoint[] = [];

  for (let offset = 6; offset >= 0; offset--) {
    const day = new Date(todayStart.getTime() - offset * DAY_MS);
    const dateKey = toLocalDateKey(day);
    buckets.set(dateKey, { cents: 0, orders: 0 });
    points.push({
      dateKey,
      label: day.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
      shortDay: day.toLocaleDateString('en-PH', { weekday: 'short' }),
      fullDate: day.toLocaleDateString('en-PH', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      netSales: 0,
      orders: 0,
    });
  }

  for (const s of sales) {
    if (s.voided) continue;
    const dObj = new Date(s.dateIso);
    if (Number.isNaN(dObj.getTime())) continue;
    const key = toLocalDateKey(dObj);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.cents += toCents(s.grandTotal);
    bucket.orders += 1;
  }

  for (const pt of points) {
    const bucket = buckets.get(pt.dateKey);
    if (bucket) {
      pt.netSales = fromCents(bucket.cents);
      pt.orders = bucket.orders;
    }
  }

  return points;
}

export function summarize7DayTrend(points: DailySalesPoint[]): {
  total: number;
  average: number;
  bestDay: DailySalesPoint | null;
  activeDays: number;
} {
  const total = sumPeso(points, (p) => p.netSales);
  const daysCount = points.length || 7;
  const average = round2(total / daysCount);
  let bestDay: DailySalesPoint | null = null;
  let activeDays = 0;

  for (const p of points) {
    if (p.netSales > 0) activeDays++;
    if (!bestDay || p.netSales > bestDay.netSales) {
      bestDay = p;
    }
  }

  return {
    total,
    average,
    bestDay: bestDay && bestDay.netSales > 0 ? bestDay : null,
    activeDays,
  };
}

export interface RankedProductProfit {
  name: string;
  unit: string;
  qty: number;
  rev: number;
  profit: number;
  cls: 'A' | 'B' | 'C';
}

export function computeProfitRanking(
  list: SaleRecord[],
  products: Product[],
): { ranked: RankedProductProfit[]; unknownCount: number } {
  const prodById = new Map(products.map((p) => [p.id, p]));
  const map: Record<string, Omit<RankedProductProfit, 'cls'>> = {};
  const unknown = new Set<string>();

  for (const s of list) {
    const items = s.items || [];
    const revLines = saleLineRevenueC(s, prodById, products);
    items.forEach((it, idx) => {
      const c = itemUnitCapital(it, prodById, products);
      if (!(c > 0)) {
        unknown.add(it.name);
        return;
      }
      const key = it.productId || it.name;
      if (!map[key]) {
        map[key] = { name: it.name, unit: it.unit, qty: 0, rev: 0, profit: 0 };
      }
      const e = map[key];
      e.qty += Number(it.qty) || 0;
      const rev = revLines[idx] / 100;
      e.rev += rev;
      e.profit += rev - c * (Number(it.qty) || 0);
    });
  }

  const ranked: RankedProductProfit[] = Object.values(map)
    .sort((a, b) => b.profit - a.profit)
    .map((r) => ({ ...r, cls: 'C' as const }));

  const totalPos = ranked.reduce((a, r) => a + (r.profit > 0 ? r.profit : 0), 0);
  let cum = 0;
  for (const r of ranked) {
    if (r.profit > 0 && totalPos > 0) {
      r.cls = cum < totalPos * 0.7 ? 'A' : cum < totalPos * 0.9 ? 'B' : 'C';
      cum += r.profit;
    } else {
      r.cls = 'C';
    }
  }
  return { ranked, unknownCount: unknown.size };
}

export function reorderSettingNum(v: unknown, def: number): number {
  const n = Number(v);
  return v !== '' && v !== null && v !== undefined && Number.isFinite(n) && n >= 0 ? n : def;
}

export interface ReorderSuggestion {
  p: Product;
  avg: number;
  rop: number;
  suggest: number;
  daysLeft: number;
  cost: number | null;
}

export function computeReorderList(
  products: Product[],
  sales: SaleRecord[],
  settings: Pick<StoreSettings, 'reorderLeadDays' | 'reorderSafetyDays'>,
  nowMs = Date.now(),
): { rows: ReorderSuggestion[]; days: number; hasSales: boolean } {
  const lead = reorderSettingNum(settings.reorderLeadDays, 3);
  const safety = reorderSettingNum(settings.reorderSafetyDays, 2);
  const cutoff = nowMs - 30 * DAY_MS;
  const sold: Record<string, number> = {};
  let earliest = nowMs;

  for (const s of sales) {
    if (s.voided) continue;
    const t = new Date(s.dateIso).getTime();
    if (!(t >= cutoff)) continue;
    if (t < earliest) earliest = t;
    for (const it of s.items || []) {
      const prod = products.find((x) => (it.productId && x.id === it.productId) || x.name === it.name);
      if (!prod) continue;
      sold[prod.id] = (sold[prod.id] || 0) + (Number(it.qty) || 0);
    }
  }

  const days = Math.min(30, Math.max(1, Math.ceil((nowMs - earliest) / DAY_MS)));
  const rows: ReorderSuggestion[] = [];

  for (const p of products) {
    const qty = sold[p.id] || 0;
    if (!(qty > 0)) continue;
    const avg = qty / days;
    const rop = avg * (lead + safety);
    if (Number(p.stock) > rop) continue;
    const target = rop + avg * 7;
    const need = Math.max(0, target - Number(p.stock));
    const suggest = p.unit === 'kg' ? Math.ceil(need * 10) / 10 : Math.ceil(need);
    if (!(suggest > 0)) continue;
    const cap = Number(p.capital) || 0;
    rows.push({
      p,
      avg,
      rop,
      suggest,
      daysLeft: avg > 0 ? Number(p.stock) / avg : 0,
      cost: cap > 0 ? round2(suggest * cap) : null,
    });
  }

  rows.sort((a, b) => a.daysLeft - b.daysLeft);
  return { rows, days, hasSales: Object.keys(sold).length > 0 };
}

export function escapeCsvCell(v: unknown): string {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t) && Number.isNaN(Number(t))) {
    t = "'" + t;
  }
  return '"' + t.replace(/"/g, '""') + '"';
}

export function buildDefaultCatalog(): Product[] {
  const items: [string, string, string, string, number, number, number, number][] = [
    ['4800016644801', 'Purefoods Tender Juicy Hotdog Regular 1kg', 'Frozen Meat', 'pack', 195, 185, 5, 30],
    ['4800016644818', 'CDO Idol Cheesedog 1kg', 'Frozen Meat', 'pack', 175, 165, 5, 25],
    ['4800016644825', 'Magnolia Chicken Breast Fillet (Per Kg)', 'Frozen Meat', 'kg', 235, 220, 5, 40],
    ['4800016644832', 'Pork Kasim / Shoulder Cut (Per Kg)', 'Frozen Meat', 'kg', 320, 305, 5, 35],
    ['4800016644849', 'Pork Liempo / Belly Strip (Per Kg)', 'Frozen Meat', 'kg', 365, 348, 5, 28],
    ['4800016644856', "Pampanga's Best Tocino Original 450g", 'Frozen Meat', 'pack', 145, 138, 6, 24],
    ['4800099100014', 'Sinandomeng White Rice (Per Kg)', 'Rice & Staples', 'kg', 54, 51, 25, 150],
    ['4800099100021', 'Jasmin Fragrant Rice 5kg Sack', 'Rice & Staples', 'pack', 285, 272, 4, 40],
    ['4800010011203', 'Lucky Me! Pancit Canton Original 60g', 'Canned & Noodles', 'pc', 15, 13.5, 12, 120],
    ['4800010011210', 'Lucky Me! Pancit Canton Calamansi 60g', 'Canned & Noodles', 'pc', 15, 13.5, 12, 120],
    ['4800047820106', 'Century Tuna Flakes in Oil 180g', 'Canned & Noodles', 'pc', 42, 39.5, 12, 60],
    ['4800047820113', '555 Sardines in Tomato Sauce 155g', 'Canned & Noodles', 'pc', 26, 24, 12, 85],
    ['4800047820120', 'Argentina Corned Beef 175g', 'Canned & Noodles', 'pc', 44, 41.5, 12, 55],
    ['4800024556011', 'Coca-Cola Original 1.5L Bottle', 'Beverages', 'pc', 68, 63, 6, 48],
    ['4800024556028', 'Nescafe Classic Twin Pack 44g', 'Beverages', 'pc', 16, 14.5, 12, 100],
    ['4800024556035', 'Milo Chocolate Malt Powder 300g', 'Beverages', 'pack', 108, 102, 6, 36],
    ['4800361390814', 'Bear Brand Fortified Powdered Milk 300g', 'Dairy & Bakery', 'pack', 118, 112, 6, 42],
    ['4800110025914', 'Gardenia Classic White Bread 600g', 'Dairy & Bakery', 'pack', 85, 81, 5, 20],
    ['4800011132105', 'Datu Puti Soy Sauce 1L Bottle', 'Condiments & Cooking', 'pc', 56, 52, 6, 45],
    ['4800011132112', 'Datu Puti White Vinegar 1L Bottle', 'Condiments & Cooking', 'pc', 44, 41, 6, 45],
    ['4800011132129', 'Golden Fiesta Palm Cooking Oil 1L', 'Condiments & Cooking', 'pc', 112, 106, 6, 40],
    ['4800016644108', 'Piattos Cheese Potato Crisps 85g', 'Snacks & Biscuits', 'pc', 39, 36.5, 10, 50],
    ['4800016644115', 'SkyFlakes Crackers 10s Pack', 'Snacks & Biscuits', 'pack', 64, 60, 6, 40],
    ['4800888140119', 'Safeguard Pure White Bath Soap 130g', 'Personal & Home', 'pc', 54, 50, 6, 55],
    ['4800888140126', 'Surf Powder Detergent Sun Fresh 1kg', 'Personal & Home', 'pack', 128, 120, 6, 38],
  ];
  return items.map((row, idx) => ({
    id: 'SKU-' + String(idx + 1).padStart(4, '0'),
    barcode: row[0],
    name: row[1],
    category: row[2],
    unit: row[3],
    retailPrice: row[4],
    wholesalePrice: row[5],
    wholesaleMinQty: row[6],
    stock: row[7],
  }));
}

export function safeJsonParse<T = unknown>(raw: string): T {
  return JSON.parse(raw, (key, value) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return undefined;
    }
    return value;
  }) as T;
}

export function validateBackupPayload(data: unknown): { ok: true; data: { products: Product[]; sales: SaleRecord[]; heldOrders: HeldOrder[]; settings?: Partial<StoreSettings>; exportedAt?: string } } | { ok: false; error: string } {
  const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o);
  if (!isObj(data) || data.app !== 'omnimart-ph-pos' || !Array.isArray(data.products) || !Array.isArray(data.sales)) {
    return { ok: false, error: 'This is not an OmniMart backup file' };
  }
  const productsOk = data.products.every((p) => isObj(p) && typeof p.id === 'string');
  const salesOk = data.sales.every((x) => isObj(x) && Array.isArray(x.items) && x.items.every(isObj));
  const heldOk = data.heldOrders === undefined || (Array.isArray(data.heldOrders) && data.heldOrders.every(isObj));
  if (!productsOk || !salesOk || !heldOk) {
    return { ok: false, error: 'Backup file is damaged or has unexpected data. Nothing was changed.' };
  }
  return {
    ok: true,
    data: {
      products: data.products as unknown as Product[],
      sales: data.sales as unknown as SaleRecord[],
      heldOrders: (Array.isArray(data.heldOrders) ? data.heldOrders : []) as unknown as HeldOrder[],
      settings: isObj(data.settings) ? (data.settings as Partial<StoreSettings>) : undefined,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : undefined,
    },
  };
}

export function sanitizeConfigForSnapshot(settings: StoreSettings): ConfigSnapshot['config'] {
  return {
    storeName: String(settings.storeName || DEFAULT_SETTINGS.storeName),
    storeAddress: String(settings.storeAddress || DEFAULT_SETTINGS.storeAddress),
    storeTin: String(settings.storeTin || DEFAULT_SETTINGS.storeTin),
    storePhone: String(settings.storePhone || ''),
    receiptFooter: String(settings.receiptFooter || DEFAULT_SETTINGS.receiptFooter),
    storeIcon: String(settings.storeIcon || 'basket'),
    storeTagline: String(settings.storeTagline || ''),
    lowStockThreshold: Number(settings.lowStockThreshold ?? DEFAULT_SETTINGS.lowStockThreshold),
    expiryWarnDays: Number(settings.expiryWarnDays ?? DEFAULT_SETTINGS.expiryWarnDays),
    reorderLeadDays: Number(settings.reorderLeadDays ?? DEFAULT_SETTINGS.reorderLeadDays),
    reorderSafetyDays: Number(settings.reorderSafetyDays ?? DEFAULT_SETTINGS.reorderSafetyDays),
    beep: Boolean(settings.beep),
    vibrate: Boolean(settings.vibrate),
    scDiscountCap: Number(settings.scDiscountCap ?? DEFAULT_SETTINGS.scDiscountCap),
    receiptWidth: settings.receiptWidth === '58mm' ? '58mm' : '80mm',
  };
}

export function diffConfigFields(
  prev: ConfigSnapshot['config'],
  next: ConfigSnapshot['config'],
): string[] {
  const keys = Object.keys(next) as (keyof ConfigSnapshot['config'])[];
  return keys.filter((k) => prev[k] !== next[k]);
}

// Stock Intelligence, Weighted Cost, Batch Audit & CSV Import helpers

export interface ProductVelocity {
  productId: string;
  soldQty: number;
  revenue30: number;
  avgDaily: number;
  daysOfCover: number | null;
  isDeadStock: boolean;
}

export function computeProductVelocities(
  products: Product[],
  sales: SaleRecord[],
  nowMs = Date.now(),
): { byId: Map<string, ProductVelocity>; windowDays: number; hasSalesInWindow: boolean } {
  const cutoff = nowMs - 30 * DAY_MS;
  const prodById = new Map(products.map((p) => [p.id, p]));
  const prodByName = new Map<string, Product>();
  for (const p of products) {
    if (!prodByName.has(p.name)) prodByName.set(p.name, p);
  }

  const soldQtyMap = new Map<string, number>();
  const soldRevCentsMap = new Map<string, number>();
  let earliest = nowMs;
  let hasSalesInWindow = false;

  for (const s of sales) {
    if (s.voided) continue;
    const t = new Date(s.dateIso).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;
    hasSalesInWindow = true;
    if (t < earliest) earliest = t;
    for (const it of s.items || []) {
      const prod = (it.productId && prodById.get(it.productId)) || prodByName.get(it.name);
      if (!prod) continue;
      const q = Number(it.qty) || 0;
      soldQtyMap.set(prod.id, (soldQtyMap.get(prod.id) || 0) + q);
      soldRevCentsMap.set(prod.id, (soldRevCentsMap.get(prod.id) || 0) + toCents(it.lineTotal));
    }
  }

  const windowDays = Math.min(30, Math.max(1, Math.ceil((nowMs - earliest) / DAY_MS)));
  const byId = new Map<string, ProductVelocity>();

  for (const p of products) {
    const soldQty = Number((soldQtyMap.get(p.id) || 0).toFixed(3));
    const avgDaily = soldQty / windowDays;
    const stk = Math.max(0, Number(p.stock) || 0);
    const daysOfCover = avgDaily > 0 ? stk / avgDaily : null;
    byId.set(p.id, {
      productId: p.id,
      soldQty,
      revenue30: fromCents(soldRevCentsMap.get(p.id) || 0),
      avgDaily,
      daysOfCover,
      isDeadStock: hasSalesInWindow && stk > 0 && soldQty === 0,
    });
  }

  return { byId, windowDays, hasSalesInWindow };
}

export interface StockHealthSummary {
  totalSkus: number;
  stockRetailValue: number;
  capitalInStock: number;
  potentialProfit: number;
  missingCapitalCount: number;
  lossMarginCount: number;
  lowCount: number;
  outCount: number;
  expiredCount: number;
  soonCount: number;
  fastLowCount: number;
  deadStockCount: number;
  gmroi: string;
}

export function computeStockHealthSummary(
  products: Product[],
  sales: SaleRecord[],
  settings: Pick<StoreSettings, 'lowStockThreshold' | 'expiryWarnDays' | 'reorderLeadDays' | 'reorderSafetyDays'>,
  nowDate: Date = new Date(),
): StockHealthSummary {
  const lowTh = Number(settings.lowStockThreshold) || 10;
  const warnDays = Number(settings.expiryWarnDays) || 30;
  const coverWarnDays =
    reorderSettingNum(settings.reorderLeadDays, 3) + reorderSettingNum(settings.reorderSafetyDays, 2);
  const nowMs = nowDate.getTime();
  const { byId: velMap } = computeProductVelocities(products, sales, nowMs);

  let retailC = 0;
  let capitalC = 0;
  let knownRetailForCapC = 0;
  let missingCapitalCount = 0;
  let lossMarginCount = 0;
  let lowCount = 0;
  let outCount = 0;
  let expiredCount = 0;
  let soonCount = 0;
  let fastLowCount = 0;
  let deadStockCount = 0;

  for (const p of products) {
    const stk = Number(p.stock) || 0;
    const lineRetC = lineCents(p.retailPrice, stk);
    retailC += lineRetC;

    const cap = Number(p.capital) || 0;
    if (cap > 0) {
      capitalC += lineCents(cap, stk);
      knownRetailForCapC += lineRetC;
      if (p.retailPrice < cap || (p.wholesalePrice > 0 && p.wholesalePrice < cap)) {
        lossMarginCount++;
      }
    } else {
      missingCapitalCount++;
    }

    if (stk <= 0) outCount++;
    else if (stk <= lowTh) lowCount++;

    const ex = expiryInfo(p, warnDays, nowDate);
    if (ex.status === 'expired') expiredCount++;
    else if (ex.status === 'soon') soonCount++;

    const vel = velMap.get(p.id);
    if (vel) {
      if (stk > 0 && vel.daysOfCover !== null && vel.daysOfCover <= coverWarnDays) {
        fastLowCount++;
      }
      if (vel.isDeadStock) deadStockCount++;
    }
  }

  const capitalInStock = fromCents(capitalC);
  const profit30 = profitLastDays(sales, products, 30, nowMs);
  const gmroi = capitalInStock > 0 && profit30 !== null ? `${(profit30 / capitalInStock).toFixed(2)}×` : '—';

  return {
    totalSkus: products.length,
    stockRetailValue: fromCents(retailC),
    capitalInStock,
    potentialProfit: fromCents(Math.max(0, knownRetailForCapC - capitalC)),
    missingCapitalCount,
    lossMarginCount,
    lowCount,
    outCount,
    expiredCount,
    soonCount,
    fastLowCount,
    deadStockCount,
    gmroi,
  };
}

export function computeWeightedAverageCapital(
  currentStock: number,
  currentCapital: number,
  addedQty: number,
  newUnitCost: number,
): number {
  const safeCost = Number(newUnitCost);
  if (!Number.isFinite(safeCost) || safeCost < 0) return Math.max(0, Number(currentCapital) || 0);
  const oldStk = Math.max(0, Number(currentStock) || 0);
  const oldCap = Math.max(0, Number(currentCapital) || 0);
  const add = Math.max(0, Number(addedQty) || 0);
  if (oldStk <= 0 || oldCap <= 0 || add <= 0) {
    return Number(safeCost.toFixed(4));
  }
  const avg = (oldStk * oldCap + add * safeCost) / (oldStk + add);
  return Number(avg.toFixed(4));
}

export interface BatchStockAdjustmentInput {
  productId: string;
  mode: 'delta' | 'set';
  value: number;
  reason: StockLogEntry['reason'];
  note?: string;
  newExpiry?: string;
  newCapital?: number;
}

export function applyBatchStockUpdates(
  products: Product[],
  adjustments: BatchStockAdjustmentInput[],
  nowIso: string = new Date().toISOString(),
): { nextProducts: Product[]; logEntries: StockLogEntry[]; changedCount: number } {
  const adjMap = new Map<string, BatchStockAdjustmentInput>();
  for (const adj of adjustments) {
    if (adj && adj.productId && Number.isFinite(adj.value)) {
      adjMap.set(adj.productId, adj);
    }
  }

  const logEntries: StockLogEntry[] = [];
  let changedCount = 0;

  const nextProducts = products.map((p, idx) => {
    const adj = adjMap.get(p.id);
    if (!adj) return p;

    const prevStock = Number(p.stock) || 0;
    const rawTarget = adj.mode === 'set' ? adj.value : prevStock + adj.value;
    const nextStock = Math.max(0, Number(rawTarget.toFixed(3)));
    const delta = Number((nextStock - prevStock).toFixed(3));
    const expiryChanged = adj.newExpiry !== undefined && adj.newExpiry !== (p.expiry || '');
    const capitalChanged =
      adj.newCapital !== undefined &&
      Number.isFinite(adj.newCapital) &&
      adj.newCapital >= 0 &&
      adj.newCapital !== (Number(p.capital) || 0);

    if (delta === 0 && !expiryChanged && !capitalChanged) {
      return p;
    }

    changedCount++;
    if (delta !== 0) {
      logEntries.push({
        id: `LOG-${Date.now().toString(36)}-${idx}`,
        dateIso: nowIso,
        productId: p.id,
        productName: p.name,
        delta,
        prevStock,
        newStock: nextStock,
        reason: adj.reason,
        note: adj.note?.trim() || undefined,
      });
    }

    return {
      ...p,
      stock: nextStock,
      expiry: expiryChanged ? adj.newExpiry || undefined : p.expiry,
      capital: capitalChanged ? Number(adj.newCapital!.toFixed(4)) : p.capital,
    };
  });

  return { nextProducts, logEntries, changedCount };
}

export function parseCsvRows(text: string): string[][] {
  const cleaned = String(text || '').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      if (cleaned[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  return rows;
}

export interface CsvImportRowPreview {
  rowNum: number;
  action: 'create' | 'update' | 'skip';
  reason?: string;
  existing?: Product;
  data?: Omit<Product, 'id'>;
}

export function parseInventoryCsv(
  csvText: string,
  existingProducts: Product[],
): { rows: CsvImportRowPreview[]; error?: string } {
  const matrix = parseCsvRows(csvText);
  if (matrix.length < 2) {
    return { rows: [], error: 'CSV must include a header row and at least one product row.' };
  }

  const headers = matrix[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const col = (...aliases: string[]) => headers.findIndex((h) => aliases.includes(h));

  const idxId = col('id', 'sku');
  const idxBarcode = col('barcode', 'upc', 'ean', 'gtin', 'code');
  const idxName = col('name', 'productname', 'item', 'description');
  const idxCat = col('category', 'dept', 'group');
  const idxUnit = col('unit', 'uom');
  const idxCap = col('capital', 'cost', 'unitcost');
  const idxRetail = col('retailprice', 'retail', 'price', 'sellingprice');
  const idxWhs = col('wholesaleprice', 'wholesale');
  const idxWhsMin = col('wholesalemin', 'wholesaleminqty', 'minqty');
  const idxStock = col('stock', 'qty', 'quantity', 'onhand');
  const idxExpiry = col('expiry', 'expirydate', 'exp');
  const idxSc = col('scpwd', 'sceligible', 'sc');

  if (idxName < 0 && idxBarcode < 0 && idxId < 0) {
    return {
      rows: [],
      error: 'Could not recognize columns. Include headers such as Barcode, Name, Retail Price, Stock.',
    };
  }

  const byId = new Map(existingProducts.map((p) => [p.id, p]));
  const rows: CsvImportRowPreview[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const raw = matrix[r];
    const get = (idx: number) => (idx >= 0 && idx < raw.length ? raw[idx].trim() : '');

    const rawId = get(idxId);
    const rawBarcode = get(idxBarcode);
    const rawName = get(idxName);
    const matched =
      (rawId && byId.get(rawId)) ||
      (rawBarcode ? findProductByBarcode(rawBarcode, existingProducts) : undefined);

    const parseNum = (s: string) => {
      const cleaned = s.replace(/[₱,\s]/g, '');
      if (cleaned === '') return undefined;
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : NaN;
    };

    const retailNum = parseNum(get(idxRetail));
    const capNum = parseNum(get(idxCap));
    const whsNum = parseNum(get(idxWhs));
    const whsMinNum = parseNum(get(idxWhsMin));
    const stockNum = parseNum(get(idxStock));
    const rawExp = get(idxExpiry);
    const rawSc = get(idxSc).toLowerCase();
    const scVal =
      rawSc === 'yes' || rawSc === 'true' || rawSc === '1'
        ? true
        : rawSc === 'no' || rawSc === 'false' || rawSc === '0'
          ? false
          : undefined;

    if ([retailNum, capNum, whsNum, whsMinNum, stockNum].some((x) => x !== undefined && Number.isNaN(x))) {
      rows.push({ rowNum: r + 1, action: 'skip', reason: 'Invalid number format' });
      continue;
    }

    if (matched) {
      const nextRetail = retailNum !== undefined ? round2(retailNum) : matched.retailPrice;
      const nextCap = capNum !== undefined ? Number(capNum.toFixed(4)) : matched.capital;
      const nextWhs = whsNum !== undefined ? round2(whsNum) : matched.wholesalePrice;
      const nextMin = whsMinNum !== undefined && whsMinNum > 0 ? Math.round(whsMinNum) : matched.wholesaleMinQty;
      const nextStock = stockNum !== undefined ? Math.max(0, Number(stockNum.toFixed(3))) : matched.stock;
      if (nextRetail <= 0 || nextStock < 0 || (nextCap !== undefined && nextCap < 0) || nextWhs < 0) {
        rows.push({ rowNum: r + 1, action: 'skip', reason: 'Negative stock/cost or non-positive price', existing: matched });
        continue;
      }
      rows.push({
        rowNum: r + 1,
        action: 'update',
        existing: matched,
        data: {
          barcode: rawBarcode || matched.barcode,
          name: rawName || matched.name,
          category: get(idxCat) || matched.category,
          unit: get(idxUnit) || matched.unit,
          capital: nextCap,
          retailPrice: nextRetail,
          wholesalePrice: nextWhs,
          wholesaleMinQty: nextMin,
          stock: nextStock,
          expiry: rawExp !== '' ? (/^\d{4}-\d{2}-\d{2}$/.test(rawExp) ? rawExp : matched.expiry) : matched.expiry,
          scEligible: scVal !== undefined ? scVal : matched.scEligible,
        },
      });
    } else {
      if (!rawName || retailNum === undefined || retailNum <= 0) {
        rows.push({ rowNum: r + 1, action: 'skip', reason: 'New item requires Name and Retail Price > 0' });
        continue;
      }
      const cleanStock = stockNum !== undefined ? Math.max(0, Number(stockNum.toFixed(3))) : 0;
      const cleanCap = capNum !== undefined && capNum >= 0 ? Number(capNum.toFixed(4)) : 0;
      const cleanWhs = whsNum !== undefined && whsNum >= 0 ? round2(whsNum) : round2(retailNum);
      const cleanMin = whsMinNum !== undefined && whsMinNum > 0 ? Math.round(whsMinNum) : 10;
      rows.push({
        rowNum: r + 1,
        action: 'create',
        data: {
          barcode: rawBarcode || `480${Date.now().toString().slice(-7)}${String(r).padStart(3, '0')}`,
          name: rawName,
          category: get(idxCat) || 'Rice & Staples',
          unit: get(idxUnit) || 'pc',
          capital: cleanCap,
          retailPrice: round2(retailNum),
          wholesalePrice: cleanWhs,
          wholesaleMinQty: cleanMin,
          stock: cleanStock,
          expiry: /^\d{4}-\d{2}-\d{2}$/.test(rawExp) ? rawExp : '',
          scEligible: scVal,
        },
      });
    }
  }

  return { rows };
}

/**
 * Parses cashier quantity multiplier input such as "5*4800016644801" or "2.5*sinandomeng".
 * Uses `*` unambiguously so product names containing "x" (e.g. "3x100g") still search normally.
 */
export function parseQtySearchInput(raw: string): { qty: number; query: string } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+(?:\.\d{1,3})?)\s*\*\s*(.+)$/);
  if (!match) return { qty: 1, query: trimmed };
  const qty = Number(match[1]);
  const query = match[2].trim();
  if (!Number.isFinite(qty) || qty <= 0 || qty > 9999 || !query) {
    return { qty: 1, query: trimmed };
  }
  return { qty: Number(qty.toFixed(3)), query };
}

export interface HourlySalesPoint {
  hr: number;
  label: string;
  sales: number;
}

export function computeHourlySalesSeries(hours: Record<number, number>): HourlySalesPoint[] {
  const hrs = Object.keys(hours)
    .map(Number)
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  if (!hrs.length) return [];
  let lo = Math.min(...hrs);
  let hi = Math.max(...hrs);
  while (hi - lo < 7 && (lo > 0 || hi < 23)) {
    if (lo > 0) lo--;
    if (hi - lo < 7 && hi < 23) hi++;
  }
  const out: HourlySalesPoint[] = [];
  for (let hr = lo; hr <= hi; hr++) {
    out.push({
      hr,
      label: `${hr % 12 || 12}${hr < 12 ? 'a' : 'p'}`,
      sales: round2(hours[hr] || 0),
    });
  }
  return out;
}

export const PH_DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.25] as const;

export interface CashDrawerSummary {
  openingFloat: number;
  expectedCashSales: number;
  expectedDrawerTotal: number;
  countedTotal: number;
  variance: number;
  status: 'balanced' | 'over' | 'short';
  cashOrders: number;
  splitCashOrders: number;
}

export function computeCashDrawerSummary(
  sales: SaleRecord[],
  from: Date,
  to: Date,
  denominationCounts: Record<number | string, number>,
  openingFloat = 0,
): CashDrawerSummary {
  let cashSalesCents = 0;
  let cashOrders = 0;
  let splitCashOrders = 0;

  for (const s of sales) {
    if (s.voided) continue;
    if (!inRange(s, from, to)) continue;
    if (s.paymentMethod === 'Cash') {
      cashSalesCents += toCents(s.grandTotal);
      cashOrders++;
    } else if (s.paymentMethod === 'Split' && s.splitDetails) {
      cashSalesCents += toCents(s.splitDetails.cash);
      splitCashOrders++;
    }
  }

  let countedCents = 0;
  for (const denom of PH_DENOMINATIONS) {
    const rawCount = Number(denominationCounts[denom] ?? denominationCounts[String(denom)] ?? 0);
    const qty = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0;
    countedCents += Math.round(toCents(denom) * qty);
  }

  const floatCents = Math.max(0, toCents(openingFloat));
  const expectedDrawerCents = cashSalesCents + floatCents;
  const varianceCents = countedCents - expectedDrawerCents;
  const status: CashDrawerSummary['status'] =
    varianceCents === 0 ? 'balanced' : varianceCents > 0 ? 'over' : 'short';

  return {
    openingFloat: fromCents(floatCents),
    expectedCashSales: fromCents(cashSalesCents),
    expectedDrawerTotal: fromCents(expectedDrawerCents),
    countedTotal: fromCents(countedCents),
    variance: fromCents(varianceCents),
    status,
    cashOrders,
    splitCashOrders,
  };
}

export function getTopFastMoverIds(
  products: Product[],
  sales: SaleRecord[],
  limit = 12,
  nowMs = Date.now(),
): Set<string> {
  const { byId, hasSalesInWindow } = computeProductVelocities(products, sales, nowMs);
  if (!hasSalesInWindow || limit <= 0) return new Set();

  const ranked = Array.from(byId.values())
    .filter((v) => v.soldQty > 0)
    .sort((a, b) => b.revenue30 - a.revenue30 || b.soldQty - a.soldQty)
    .slice(0, limit);

  return new Set(ranked.map((r) => r.productId));
}




