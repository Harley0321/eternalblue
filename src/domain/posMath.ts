import type { CartLine, CartTotals, Product, SaleRecord, StoreSettings } from '../types/pos';
import { StockAlerts } from './stockAlerts';

export type WholesaleBlockReason = 'NONE' | 'COST' | 'QTY';

export type ExpiryState = 'NONE' | 'EXPIRED' | 'SOON' | 'OK';

export interface ExpiryStatus {
  status: ExpiryState;
  days: number | null;
}

export interface SalesStats {
  revenue: number;
  profit: number;
  orders: number;
  itemsCount: number;
  marginPct: number;
  avgTicket: number;
  uncostedLines: number;
}

export interface StockHealthSummary {
  totalSkus: number;
  lowCount: number;
  outCount: number;
  fastLowCount: number;
  deadCount: number;
  expiredCount: number;
  soonCount: number;
  noCapCount: number;
  lossCount: number;
  retailValue: number;
  costValue: number;
}

const SC_EXCLUDE =
  /\b(chips|crisps|candy|candies|chocolate|biscuit|biscuits|cracker|crackers|cookie|cookies|wafer|cola|coke|sprite|pepsi|soda|juice|energy|beer|wine|gin|rum|whisky|whiskey|vodka|brandy|cigarette|cigarettes|tobacco|shampoo|conditioner|lotion|toothpaste|ice cream|cake|pastry|baby oil)\b/i;

const SC_NAME_YES =
  /\b(rice|bigas|sugar|asukal|salt|asin|cooking oil|egg|eggs|itlog|milk|gatas|coffee|kape|nescafe|kopiko|bread|pandesal|noodle|noodles|pancit|sardine|sardines|tuna|corned|luncheon|hotdog|tocino|longganisa|chicken|manok|pork|baboy|beef|meat|fish|isda|bangus|tilapia|galunggong|vegetable|vegetables|gulay|onion|sibuyas|garlic|bawang|flour|vinegar|suka|soy sauce|toyo|patis|detergent|laundry|soap|sabon|candle|candles|kandila|bottled water|mineral water|corn|mais)\b/i;

const SC_CAT_YES = /(meat|rice|staple|fish|seafood|egg|vegetable|fruit|noodle|canned)/i;

export const PosMath = {
  APP_VERSION: '2.3.17',
  BUILD_CODE: 2,
  DAY_MS: 86_400_000,

  BASE_CATEGORIES: [
    'Frozen Meat',
    'Rice & Staples',
    'Canned & Noodles',
    'Beverages',
    'Dairy & Bakery',
    'Condiments & Cooking',
    'Snacks & Biscuits',
    'Personal & Home',
  ],

  PH_DENOMINATIONS: [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.25],

  toCents(n?: number | null): number {
    if (n == null || !Number.isFinite(n)) return 0;
    const sign = n < 0 ? -1 : 1;
    const res = sign * Math.round((Math.abs(n) + 1e-9) * 100);
    return res === 0 ? 0 : res;
  },

  fromCents(c: number): number {
    if (!Number.isFinite(c) || c === 0) return 0;
    return c / 100;
  },

  round2(n?: number | null): number {
    return PosMath.fromCents(PosMath.toCents(n));
  },

  computeProductMarginPct(product: Product): number | null {
    const retailCents = PosMath.toCents(product.retailPrice);
    const capitalCents = PosMath.toCents(product.capital);
    if (retailCents <= 0 || capitalCents <= 0) return null;
    return PosMath.round2(((retailCents - capitalCents) / retailCents) * 100);
  },

  toMilli(n?: number | null): number {
    if (n == null || !Number.isFinite(n)) return 0;
    const sign = n < 0 ? -1 : 1;
    const res = sign * Math.round((Math.abs(n) + 1e-12) * 1000);
    return res === 0 ? 0 : res;
  },

  fromMilli(m: number): number {
    if (!Number.isFinite(m) || m === 0) return 0;
    return m / 1000;
  },

  round3(n?: number | null): number {
    return PosMath.fromMilli(PosMath.toMilli(n));
  },

  lineCents(unitPrice: number, qty: number): number {
    const qMilli = PosMath.toMilli(qty);
    const unitC = PosMath.toCents(unitPrice);
    const prod = unitC * qMilli;
    if (prod === 0) return 0;
    const sign = prod < 0 ? -1 : 1;
    return sign * Math.floor((Math.abs(prod) + 500) / 1000);
  },

  lineTotalPeso(unitPrice: number, qty: number): number {
    return PosMath.fromCents(PosMath.lineCents(unitPrice, qty));
  },

  formatPeso(amount?: number | null): string {
    const clean = amount != null && Number.isFinite(amount) ? PosMath.round2(amount) : 0;
    return (
      '₱' +
      clean.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  },

  formatQty(qty?: number | null, unit = ''): string {
    const clean = PosMath.round3(qty ?? 0);
    const txt = Number.isInteger(clean) ? String(Math.round(clean)) : String(clean);
    return unit.trim().length > 0 ? `${txt} ${unit}` : txt;
  },

  effectiveWholesaleMinQty(
    product?: Pick<Product, 'wholesaleMinQty'> | null,
    item?: Pick<CartLine, 'wholesaleMinQty'> | null,
    defaultMinQty = 10
  ): number {
    const rawMin = product?.wholesaleMinQty ?? item?.wholesaleMinQty ?? 0;
    if (rawMin > 0) return PosMath.round3(rawMin);
    return defaultMinQty > 0 ? PosMath.round3(defaultMinQty) : 10;
  },

  wholesaleBlock(
    item: CartLine,
    productMap: Map<string, Product>,
    defaultMinQty = 10
  ): WholesaleBlockReason | null {
    const p = productMap.get(item.productId);
    const retail = p?.retailPrice ?? item.retailPrice;
    const wholesale = p?.wholesalePrice ?? item.wholesalePrice;
    const capital = p?.capital ?? 0;
    const minQty = PosMath.effectiveWholesaleMinQty(p, item, defaultMinQty);
    if (PosMath.toCents(wholesale) <= 0 || PosMath.toCents(wholesale) >= PosMath.toCents(retail)) {
      return 'NONE';
    }
    if (PosMath.toCents(capital) > 0 && PosMath.toCents(wholesale) < PosMath.toCents(capital)) {
      return 'COST';
    }
    if (PosMath.toMilli(item.qty) < PosMath.toMilli(minQty)) return 'QTY';
    return null;
  },

  isWholesaleLine(item: CartLine, productMap: Map<string, Product>, defaultMinQty = 10): boolean {
    return PosMath.wholesaleBlock(item, productMap, defaultMinQty) === null;
  },

  getLinePrice(item: CartLine, productMap: Map<string, Product>, defaultMinQty = 10): number {
    const p = productMap.get(item.productId);
    const retail = p?.retailPrice ?? item.retailPrice;
    const wholesale = p?.wholesalePrice ?? item.wholesalePrice;
    return PosMath.round2(PosMath.isWholesaleLine(item, productMap, defaultMinQty) ? wholesale : retail);
  },

  scSuggest(name?: string | null, category?: string | null): boolean {
    const n = name ?? '';
    const c = category ?? '';
    if (SC_EXCLUDE.test(n)) return false;
    return SC_NAME_YES.test(n) || SC_CAT_YES.test(c);
  },

  scEligibleProduct(p?: Product | null): boolean {
    if (!p) return false;
    return p.scEligible ?? PosMath.scSuggest(p.name, p.category);
  },

  computeCartTotals(
    cart: CartLine[],
    productMap: Map<string, Product>,
    isSeniorPwd: boolean,
    settings: StoreSettings
  ): CartTotals {
    let retailC = 0;
    let savingsC = 0;
    let eligC = 0;
    let eligKinds = 0;
    let otherLines = 0;

    const defaultMinQty = settings.defaultWholesaleMinQty > 0 ? settings.defaultWholesaleMinQty : 10;

    for (const item of cart) {
      const p = productMap.get(item.productId);
      const retail = p?.retailPrice ?? item.retailPrice;
      const lineRetailC = PosMath.lineCents(retail, item.qty);
      const lineEffC = PosMath.lineCents(
        PosMath.getLinePrice(item, productMap, defaultMinQty),
        item.qty
      );
      const lineSavingC = Math.max(0, lineRetailC - lineEffC);
      retailC += lineRetailC;
      savingsC += lineSavingC;
      if (isSeniorPwd) {
        const eligible = p ? PosMath.scEligibleProduct(p) : PosMath.scSuggest(item.name, null);
        if (eligible) {
          eligC += lineEffC;
          eligKinds++;
        } else {
          otherLines++;
        }
      }
    }

    const netC = retailC - savingsC;
    const rawSeniorC = isSeniorPwd ? Math.floor((eligC * 5 + 50) / 100) : 0;
    const capC = PosMath.toCents(settings.scDiscountCap > 0 ? settings.scDiscountCap : 125);
    const seniorC = Math.min(rawSeniorC, capC);
    const grandC = Math.max(0, netC - seniorC);

    return {
      retailSubtotal: PosMath.fromCents(retailC),
      wholesaleSavings: PosMath.fromCents(savingsC),
      seniorDiscount: PosMath.fromCents(seniorC),
      grandTotal: PosMath.fromCents(grandC),
      isSeniorPwd,
      seniorBase: PosMath.fromCents(eligC),
      seniorCapped: rawSeniorC > capC,
      seniorCap: PosMath.fromCents(capC),
      scKinds: eligKinds,
      scOtherLines: otherLines,
    };
  },

  allocateSaleLineNetCents(sale: SaleRecord, productMap?: Map<string, Product>): number[] {
    if (sale.items.length === 0) return [];
    const gross = sale.items.map((it) => Math.max(0, PosMath.toCents(it.lineTotal)));
    const grossSum = gross.reduce((acc, c) => acc + c, 0);
    const grandC = Math.max(0, PosMath.toCents(sale.grandTotal));
    const totalDisc = Math.max(0, grossSum - grandC);
    if (totalDisc === 0 || grossSum === 0) return gross;

    const distribute = (weights: number[], total: number): number[] => {
      const sumW = weights.reduce((a, b) => a + b, 0);
      if (sumW <= 0 || total <= 0) return weights.map(() => 0);
      const out = new Array<number>(weights.length).fill(0);
      const rems: Array<{ idx: number; rem: number }> = [];
      let assigned = 0;
      for (let i = 0; i < weights.length; i++) {
        const w = weights[i];
        if (w <= 0) continue;
        const num = w * total;
        const share = Math.floor(num / sumW);
        out[i] = share;
        assigned += share;
        rems.push({ idx: i, rem: num % sumW });
      }
      rems.sort((a, b) => b.rem - a.rem || a.idx - b.idx);
      let left = total - assigned;
      for (let k = 0; k < rems.length && left > 0; k++) {
        if (out[rems[k].idx] < weights[rems[k].idx]) {
          out[rems[k].idx] += 1;
          left -= 1;
        }
      }
      return out;
    };

    const seniorC = Math.min(totalDisc, Math.max(0, PosMath.toCents(sale.seniorDiscount)));
    if (seniorC > 0 && productMap) {
      const eligWeights = sale.items.map((it, idx) => {
        const p = it.productId ? productMap.get(it.productId) : undefined;
        const elig = p ? PosMath.scEligibleProduct(p) : PosMath.scSuggest(it.name, it.category);
        return elig ? gross[idx] : 0;
      });
      const eligSum = eligWeights.reduce((a, b) => a + b, 0);
      const baseMatches =
        sale.seniorBase != null ? Math.abs(eligSum - PosMath.toCents(sale.seniorBase)) <= 1 : eligSum > 0;
      if (baseMatches && eligSum >= seniorC) {
        const scDiscs = distribute(eligWeights, seniorC);
        const afterSc = gross.map((g, idx) => Math.max(0, g - scDiscs[idx]));
        const otherDisc = totalDisc - seniorC;
        const otherDiscs = distribute(afterSc, otherDisc);
        return afterSc.map((g, idx) => Math.max(0, g - otherDiscs[idx]));
      }
    }

    const discs = distribute(gross, totalDisc);
    return gross.map((g, idx) => Math.max(0, g - discs[idx]));
  },

  expiryInfo(p?: Product | null, warnDays = 30): ExpiryStatus {
    const raw = (p?.expiry ?? '').trim();
    if (!raw) return { status: 'NONE', days: null };
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) return { status: 'NONE', days: null };
    const expUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((expUtc - todayUtc) / PosMath.DAY_MS);
    const w = warnDays > 0 ? warnDays : 30;
    if (days <= 0) return { status: 'EXPIRED', days };
    if (days <= w) return { status: 'SOON', days };
    return { status: 'OK', days };
  },

  parseIsoMs(iso?: string | null): number {
    if (!iso || !iso.trim()) return 0;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : 0;
  },

  startOfDayMs(ms = Date.now()): number {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  },

  formatDateTime(iso?: string | null): string {
    const ms = PosMath.parseIsoMs(iso);
    if (ms <= 0) return iso ?? '';
    const d = new Date(ms);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mon = months[d.getMonth()];
    const day = String(d.getDate()).padStart(2, '0');
    const yr = d.getFullYear();
    let hr = d.getHours();
    const ampm = hr >= 12 ? 'PM' : 'AM';
    hr = hr % 12 || 12;
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${mon} ${day}, ${yr} ${String(hr).padStart(2, '0')}:${min} ${ampm}`;
  },

  todayYmd(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  addDaysYmd(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  addMonthsYmd(months: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  nextReceiptNo(sales: SaleRecord[]): string {
    let maxNum = 0;
    const used = new Set<string>();
    for (const s of sales) {
      used.add(s.receiptNo);
      const match = /(\d+)$/.exec(s.receiptNo.trim());
      const digits = match ? match[1] : s.receiptNo.replace(/[^0-9]/g, '');
      const num = parseInt(digits, 10);
      if (Number.isSafeInteger(num) && num > maxNum && num < 999_999_999) maxNum = num;
    }
    let next = maxNum + 1;
    while (used.has(`OR-${String(next).padStart(6, '0')}`)) {
      next += 1;
    }
    return `OR-${String(next).padStart(6, '0')}`;
  },

  generateEan13(): string {
    let base12 = '480';
    for (let i = 0; i < 9; i++) {
      base12 += Math.floor(Math.random() * 10);
    }
    let sum = 0;
    for (let i = 0; i < base12.length; i++) {
      const d = Number(base12[i]);
      sum += i % 2 === 0 ? d : d * 3;
    }
    const check = (10 - (sum % 10)) % 10;
    return base12 + check;
  },

  computeProductVelocities(products: Product[], sales: SaleRecord[], days = 30): Record<string, number> {
    const cutoff = Date.now() - days * PosMath.DAY_MS;
    const byId = new Map(products.map((p) => [p.id, p]));
    const unitsSoldMilli: Record<string, number> = {};
    for (const s of sales) {
      if (s.voided === true) continue;
      if (PosMath.parseIsoMs(s.dateIso) < cutoff) continue;
      for (const it of s.items) {
        const id =
          (it.productId && byId.has(it.productId) ? it.productId : undefined) ??
          products.find((p) => p.name.toLowerCase() === it.name.toLowerCase())?.id;
        if (id) {
          unitsSoldMilli[id] = (unitsSoldMilli[id] ?? 0) + PosMath.toMilli(it.qty);
        }
      }
    }
    const div = Math.max(1, days);
    const out: Record<string, number> = {};
    for (const [k, qtyMilli] of Object.entries(unitsSoldMilli)) {
      out[k] = PosMath.round3(qtyMilli / (1000 * div));
    }
    return out;
  },

  computeSalesStats(
    sales: SaleRecord[],
    fromMs: number,
    toMs: number,
    productMap: Map<string, Product>
  ): SalesStats {
    let revC = 0;
    let costC = 0;
    let orders = 0;
    let qtyMilli = 0;
    let uncostedLines = 0;

    for (const s of sales) {
      if (s.voided === true) continue;
      const ms = PosMath.parseIsoMs(s.dateIso);
      if (ms < fromMs || ms >= toMs) continue;
      orders++;
      revC += PosMath.toCents(s.grandTotal);
      for (const it of s.items) {
        qtyMilli += PosMath.toMilli(it.qty);
        const cap = it.capital ?? (it.productId ? productMap.get(it.productId)?.capital : undefined) ?? 0;
        if (cap > 0) costC += PosMath.lineCents(cap, it.qty);
        else uncostedLines++;
      }
    }

    const profitC = revC - costC;
    const rev = PosMath.fromCents(revC);
    const profit = PosMath.fromCents(profitC);
    const margin = revC > 0 ? PosMath.round2((profitC / revC) * 100) : 0;
    const avg = orders > 0 ? PosMath.fromCents(Math.round(revC / orders)) : 0;
    return {
      revenue: rev,
      profit,
      orders,
      itemsCount: PosMath.fromMilli(qtyMilli),
      marginPct: margin,
      avgTicket: avg,
      uncostedLines,
    };
  },

  computeStockHealthSummary(
    products: Product[],
    sales: SaleRecord[],
    settings: StoreSettings
  ): StockHealthSummary {
    const vel = PosMath.computeProductVelocities(products, sales, 30);
    let low = 0;
    let out = 0;
    let fastLow = 0;
    let dead = 0;
    let exp = 0;
    let soon = 0;
    let noCap = 0;
    let loss = 0;
    let retailValC = 0;
    let costValC = 0;

    for (const p of products) {
      const stock = Math.max(0, PosMath.round3(p.stock));
      retailValC += PosMath.lineCents(p.retailPrice, stock);
      const cap = p.capital ?? 0;
      if (PosMath.toCents(cap) > 0) {
        costValC += PosMath.lineCents(cap, stock);
        if (PosMath.toCents(p.retailPrice) < PosMath.toCents(cap)) loss++;
      } else {
        noCap++;
      }
      if (StockAlerts.isOutOfStock(p)) out++;
      else if (StockAlerts.isLowStock(p, settings)) low++;

      const v = vel[p.id] ?? 0;
      if (v <= 0 && stock > 0) dead++;
      if (v > 0 && stock > 0 && stock / v <= settings.reorderLeadDays + settings.reorderSafetyDays) {
        fastLow++;
      }
      const e = PosMath.expiryInfo(p, settings.expiryWarnDays);
      if (e.status === 'EXPIRED') exp++;
      else if (e.status === 'SOON') soon++;
    }

    return {
      totalSkus: products.length,
      lowCount: low,
      outCount: out,
      fastLowCount: fastLow,
      deadCount: dead,
      expiredCount: exp,
      soonCount: soon,
      noCapCount: noCap,
      lossCount: loss,
      retailValue: PosMath.fromCents(retailValC),
      costValue: PosMath.fromCents(costValC),
    };
  },

  isWholeSaleNearThreshold(
    item: CartLine,
    productMap: Map<string, Product>,
    defaultMinQty = 10
  ): number | null {
    const p = productMap.get(item.productId);
    if (!p) return null;
    if (PosMath.toCents(p.wholesalePrice) <= 0 || PosMath.toCents(p.wholesalePrice) >= PosMath.toCents(p.retailPrice)) {
      return null;
    }
    if (p.capital != null && PosMath.toCents(p.capital) > 0 && PosMath.toCents(p.wholesalePrice) < PosMath.toCents(p.capital)) {
      return null;
    }
    const minQty = PosMath.effectiveWholesaleMinQty(p, item, defaultMinQty);
    const diff = PosMath.round3(minQty - item.qty);
    return diff > 0 && diff <= Math.max(2, Math.abs(minQty) * 0.4) ? diff : null;
  },
};
