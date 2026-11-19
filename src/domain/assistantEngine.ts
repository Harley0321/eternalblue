import type { CartLine, HeldOrder, Product, SaleRecord, StoreSettings } from '../types/pos';
import { PosMath } from './posMath';
import { StockAlerts } from './stockAlerts';

export type AssistantLang = 'EN' | 'TL';

export interface StorePulse {
  todayNet: number;
  todayProfit: number;
  todayOrders: number;
  healthScore: number;
  lowCount: number;
  outCount: number;
  expiredCount: number;
  soonCount: number;
  parkedCount: number;
}

export interface AssistantMetric {
  label: string;
  value: string;
}

export interface AssistantReply {
  text: string;
  lang: AssistantLang;
  chips: string[];
  metrics: AssistantMetric[];
}

export interface ChatMessage {
  id: number;
  isUser: boolean;
  text: string;
  metrics: AssistantMetric[];
  chips: string[];
}

export const AssistantEngine = {
  computePulse(
    products: Product[],
    sales: SaleRecord[],
    heldOrders: HeldOrder[],
    settings: StoreSettings
  ): StorePulse {
    const startToday = PosMath.startOfDayMs();
    const endToday = startToday + PosMath.DAY_MS;
    const map = new Map(products.map((p) => [p.id, p]));
    const todayStats = PosMath.computeSalesStats(sales, startToday, endToday, map);
    const health = PosMath.computeStockHealthSummary(products, sales, settings);

    let score = 100;
    score -= Math.min(24, health.outCount * 6);
    score -= Math.min(18, health.expiredCount * 6);
    score -= Math.min(15, health.lowCount * 3);
    score -= Math.min(15, health.lossCount * 5);
    if (!settings.adminPinHash) score -= 5;

    return {
      todayNet: todayStats.revenue,
      todayProfit: todayStats.profit,
      todayOrders: todayStats.orders,
      healthScore: Math.max(0, Math.min(100, score)),
      lowCount: health.lowCount,
      outCount: health.outCount,
      expiredCount: health.expiredCount,
      soonCount: health.soonCount,
      parkedCount: heldOrders.length,
    };
  },

  welcome(lang: AssistantLang): AssistantReply {
    if (lang === 'TL') {
      return {
        text: 'Kumusta! Ako ang EternalBlue Store AI. Handa akong magbigay ng store briefing, benta ngayon, stockout forecast, margin audit, at presyo ng paninda — 100% offline.',
        lang,
        chips: ['Kamusta ang tindahan?', 'Benta ngayon', 'Ano ang dapat i-restock?', 'Malapit nang ma-expire'],
        metrics: [],
      };
    }
    return {
      text: "Hi! I'm EternalBlue Store AI. Ask for a Store Briefing, Today's Sales, Stockout Forecast, Margin Audit, or any product price — 100% offline.",
      lang,
      chips: ['Store briefing', "Today's sales", 'Stockout forecast', 'Expiring items'],
      metrics: [],
    };
  },

  ask(
    query: string,
    products: Product[],
    sales: SaleRecord[],
    heldOrders: HeldOrder[],
    cart: CartLine[],
    settings: StoreSettings,
    preferredLang: AssistantLang = 'EN'
  ): AssistantReply {
    const q = query.trim().toLowerCase();
    const isTl =
      q.includes('benta') ||
      q.includes('magkano') ||
      q.includes('tindahan') ||
      q.includes('kelan') ||
      q.includes('malapit') ||
      q.includes('ano') ||
      preferredLang === 'TL';
    const lang: AssistantLang = isTl ? 'TL' : 'EN';

    const map = new Map(products.map((p) => [p.id, p]));
    const health = PosMath.computeStockHealthSummary(products, sales, settings);
    const startToday = PosMath.startOfDayMs();
    const endToday = startToday + PosMath.DAY_MS;
    const today = PosMath.computeSalesStats(sales, startToday, endToday, map);
    const last7 = PosMath.computeSalesStats(sales, startToday - 6 * PosMath.DAY_MS, endToday, map);

    if (q.includes('sales') || q.includes('benta') || q.includes('revenue')) {
      const text =
        lang === 'TL'
          ? `Benta Ngayon: ${PosMath.formatPeso(today.revenue)} (${today.orders} orders), tinatayang tubo ${PosMath.formatPeso(today.profit)}. Kabuuang 7-day sales: ${PosMath.formatPeso(last7.revenue)}.`
          : `Today's Net Sales: ${PosMath.formatPeso(today.revenue)} across ${today.orders} orders, estimated profit ${PosMath.formatPeso(today.profit)}. 7-day total: ${PosMath.formatPeso(last7.revenue)}.`;
      return {
        text,
        lang,
        chips: lang === 'TL' ? ['Kamusta ang tindahan?', 'Ano ang dapat i-restock?'] : ['Store briefing', 'Stockout forecast'],
        metrics: [
          { label: 'Today Sales', value: PosMath.formatPeso(today.revenue) },
          { label: 'Today Profit', value: PosMath.formatPeso(today.profit) },
          { label: 'Orders', value: String(today.orders) },
          { label: '7-Day Sales', value: PosMath.formatPeso(last7.revenue) },
        ],
      };
    }

    if (q.includes('restock') || q.includes('low') || q.includes('stockout') || q.includes('ubos') || q.includes('kelan')) {
      const urgent = products
        .filter((it) => StockAlerts.isOutOfStock(it) || StockAlerts.isLowStock(it, settings))
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 6);
      const names =
        urgent.length === 0
          ? lang === 'TL'
            ? 'Kumpleto at maayos lahat ng stock.'
            : 'All items currently have healthy stock.'
          : urgent.map((it) => `• ${it.name}: ${PosMath.formatQty(it.stock, it.unit)}`).join('\n');
      return {
        text: (lang === 'TL' ? 'Priority restock list:\n' : 'Priority restock items:\n') + names,
        lang,
        chips: lang === 'TL' ? ['Benta ngayon', 'Malapit nang ma-expire'] : ["Today's sales", 'Expiring items'],
        metrics: [
          { label: 'Out of Stock', value: String(health.outCount) },
          { label: 'Low Stock', value: String(health.lowCount) },
          { label: 'Fast-Draining', value: String(health.fastLowCount) },
        ],
      };
    }

    if (q.includes('expir')) {
      const expiring = products
        .map((p) => ({ p, e: PosMath.expiryInfo(p, settings.expiryWarnDays) }))
        .filter(({ e }) => e.status === 'EXPIRED' || e.status === 'SOON')
        .sort((a, b) => (a.e.days ?? 999) - (b.e.days ?? 999))
        .slice(0, 6);
      const body =
        expiring.length === 0
          ? lang === 'TL'
            ? `Walang malapit ma-expire sa loob ng ${settings.expiryWarnDays} araw.`
            : `No products expiring within ${settings.expiryWarnDays} days.`
          : expiring
              .map(
                ({ p, e }) =>
                  `• ${p.name} (${p.expiry ?? ''}) — ${(e.days ?? 0) <= 0 ? 'EXPIRED' : `${e.days}d left`}`
              )
              .join('\n');
      return {
        text: body,
        lang,
        chips: ['Store briefing', 'Stockout forecast'],
        metrics: [
          { label: 'Expired', value: String(health.expiredCount) },
          { label: 'Expiring Soon', value: String(health.soonCount) },
        ],
      };
    }

    const tokens = q.split(/\s+/).filter((t) => t.length >= 3);
    const matched = products
      .filter((it) => tokens.some((tok) => it.name.toLowerCase().includes(tok) || it.barcode.includes(tok)))
      .slice(0, 4);

    if (matched.length > 0 && !q.includes('briefing') && !q.includes('kamusta')) {
      const lines = matched
        .map(
          (it) =>
            `• ${it.name}: Retail ${PosMath.formatPeso(it.retailPrice)} | Wholesale ${PosMath.formatPeso(it.wholesalePrice)} (${PosMath.formatQty(it.wholesaleMinQty)}+) | Stock: ${PosMath.formatQty(it.stock, it.unit)}`
        )
        .join('\n');
      return {
        text: lines,
        lang,
        chips: ['Store briefing', "Today's sales"],
        metrics: [],
      };
    }

    const pulse = AssistantEngine.computePulse(products, sales, heldOrders, settings);
    const briefing =
      lang === 'TL'
        ? `Kalagayan ng Tindahan (Score ${pulse.healthScore}/100): Benta ngayon ${PosMath.formatPeso(pulse.todayNet)}, tubo ${PosMath.formatPeso(pulse.todayProfit)}. May ${pulse.outCount} out-of-stock, ${pulse.lowCount} low stock, at ${cart.length} item sa cart.`
        : `Store Health ${pulse.healthScore}/100: Today's net sales ${PosMath.formatPeso(pulse.todayNet)} (${pulse.todayOrders} orders, est. profit ${PosMath.formatPeso(pulse.todayProfit)}). Inventory alerts: ${pulse.outCount} out, ${pulse.lowCount} low stock, ${pulse.soonCount} expiring soon.`;

    return {
      text: briefing,
      lang,
      chips:
        lang === 'TL'
          ? ['Benta ngayon', 'Ano ang dapat i-restock?', 'Malapit nang ma-expire']
          : ["Today's sales", 'Stockout forecast', 'Expiring items'],
      metrics: [
        { label: 'Health', value: `${pulse.healthScore}/100` },
        { label: 'Today Net', value: PosMath.formatPeso(pulse.todayNet) },
        { label: 'Stock Alerts', value: String(pulse.outCount + pulse.lowCount) },
        { label: 'Retail Stock Value', value: PosMath.formatPeso(health.retailValue) },
      ],
    };
  },
};
