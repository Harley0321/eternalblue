import type { Product, SaleRecord } from '../types/pos';
import { PosMath } from './posMath';

export interface HourlySalesBucket {
  hour: number;
  revenueCents: number;
  orders: number;
}

export interface CategorySales {
  category: string;
  revenueCents: number;
}

export interface ProductProfitRank {
  key: string;
  name: string;
  profitCents: number;
  revenueCents: number;
  qtyMilli: number;
  grade: 'A' | 'B' | 'C';
}

export interface ProductProfitRanking {
  products: ProductProfitRank[];
  costedLines: number;
  uncostedLines: number;
  totalProfitCents: number;
}

export type SalesPeriod =
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'ALL_TIME'
  | 'CUSTOM';

export interface SalesPeriodRange {
  fromMs: number;
  toMs: number;
  label: string;
}

function localDateStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function parseLocalDateStart(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const start = new Date(year, month, day);
  if (start.getFullYear() !== year || start.getMonth() !== month || start.getDate() !== day) return null;
  return start.getTime();
}

export function getSalesPeriodRange(
  period: SalesPeriod,
  now = new Date(),
  customFrom = '',
  customTo = ''
): SalesPeriodRange {
  const todayStart = localDateStart(now);
  const tomorrowStart = todayStart + PosMath.DAY_MS;

  switch (period) {
    case 'TODAY':
      return { fromMs: todayStart, toMs: tomorrowStart, label: 'Today' };
    case 'YESTERDAY':
      return { fromMs: todayStart - PosMath.DAY_MS, toMs: todayStart, label: 'Yesterday' };
    case 'LAST_7_DAYS':
      return { fromMs: todayStart - 6 * PosMath.DAY_MS, toMs: tomorrowStart, label: 'Last 7 Days' };
    case 'LAST_30_DAYS':
      return { fromMs: todayStart - 29 * PosMath.DAY_MS, toMs: tomorrowStart, label: 'Last 30 Days' };
    case 'THIS_MONTH':
      return {
        fromMs: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
        toMs: tomorrowStart,
        label: 'This Month',
      };
    case 'LAST_MONTH':
      return {
        fromMs: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
        toMs: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
        label: 'Last Month',
      };
    case 'ALL_TIME':
      return { fromMs: 0, toMs: now.getTime() + 1, label: 'All Time' };
    case 'CUSTOM': {
      const from = parseLocalDateStart(customFrom) ?? todayStart;
      const to = parseLocalDateStart(customTo);
      return {
        fromMs: from,
        toMs: to === null ? tomorrowStart : to + PosMath.DAY_MS,
        label: 'Custom Range',
      };
    }
  }
}

function inRange(sale: SaleRecord, fromMs: number, toMs: number): boolean {
  const timestamp = PosMath.parseIsoMs(sale.dateIso);
  return sale.voided !== true && timestamp >= fromMs && timestamp < toMs;
}

export function computeHourlySales(
  sales: SaleRecord[],
  fromMs: number,
  toMs: number
): HourlySalesBucket[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    revenueCents: 0,
    orders: 0,
  }));
  for (const sale of sales) {
    if (!inRange(sale, fromMs, toMs)) continue;
    const hour = new Date(PosMath.parseIsoMs(sale.dateIso)).getHours();
    buckets[hour].revenueCents += PosMath.toCents(sale.grandTotal);
    buckets[hour].orders++;
  }
  return buckets;
}

export function computeCategorySales(
  sales: SaleRecord[],
  fromMs: number,
  toMs: number,
  productMap: Map<string, Product>
): CategorySales[] {
  const categoryRevenue = new Map<string, number>();
  for (const sale of sales) {
    if (!inRange(sale, fromMs, toMs)) continue;
    const lineRevenue = PosMath.allocateSaleLineNetCents(sale, productMap);
    sale.items.forEach((item, index) => {
      const category =
        item.category?.trim() ||
        (item.productId ? productMap.get(item.productId)?.category.trim() : undefined) ||
        'Uncategorized';
      categoryRevenue.set(category, (categoryRevenue.get(category) ?? 0) + (lineRevenue[index] ?? 0));
    });
  }
  return Array.from(categoryRevenue, ([category, revenueCents]) => ({ category, revenueCents })).sort(
    (a, b) => b.revenueCents - a.revenueCents
  );
}

export function computeProductProfitRanking(
  sales: SaleRecord[],
  fromMs: number,
  toMs: number,
  productMap: Map<string, Product>
): ProductProfitRanking {
  const ranked = new Map<
    string,
    { key: string; name: string; profitCents: number; revenueCents: number; qtyMilli: number }
  >();
  let costedLines = 0;
  let uncostedLines = 0;

  for (const sale of sales) {
    if (!inRange(sale, fromMs, toMs)) continue;
    const lineRevenue = PosMath.allocateSaleLineNetCents(sale, productMap);
    sale.items.forEach((item, index) => {
      const capital = item.capital ?? (item.productId ? productMap.get(item.productId)?.capital : undefined);
      if (capital == null || PosMath.toCents(capital) <= 0) {
        uncostedLines++;
        return;
      }

      const key = item.productId || item.name;
      const revenueCents = lineRevenue[index] ?? PosMath.toCents(item.lineTotal);
      const costCents = PosMath.lineCents(capital, item.qty);
      const current = ranked.get(key) ?? {
        key,
        name: item.name,
        profitCents: 0,
        revenueCents: 0,
        qtyMilli: 0,
      };
      current.profitCents += revenueCents - costCents;
      current.revenueCents += revenueCents;
      current.qtyMilli += PosMath.toMilli(item.qty);
      ranked.set(key, current);
      costedLines++;
    });
  }

  const products = Array.from(ranked.values()).sort((a, b) => b.profitCents - a.profitCents);
  const positiveProfitCents = products.reduce((sum, product) => sum + Math.max(0, product.profitCents), 0);
  let cumulativeProfitCents = 0;
  const graded = products.map((product) => {
    let grade: ProductProfitRank['grade'] = 'C';
    if (product.profitCents > 0 && positiveProfitCents > 0) {
      const cumulativeShare = cumulativeProfitCents / positiveProfitCents;
      grade = cumulativeShare < 0.7 ? 'A' : cumulativeShare < 0.9 ? 'B' : 'C';
      cumulativeProfitCents += product.profitCents;
    }
    return { ...product, grade };
  });

  return {
    products: graded,
    costedLines,
    uncostedLines,
    totalProfitCents: products.reduce((sum, product) => sum + product.profitCents, 0),
  };
}
