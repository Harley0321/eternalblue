import type {
  CartLine,
  HeldOrder,
  Product,
  SaleRecord,
  SecurityLogEntry,
  StockLogEntry,
  StoreSettings,
} from '../types';
import { pinIsSet } from './pinSecurity';
import {
  computeCartTotals,
  computeCashDrawerSummary,
  computeLast7DaysNetSales,
  computeProductVelocities,
  computeProfitRanking,
  computeReorderList,
  computeSalesStats,
  computeStockHealthSummary,
  DAY_MS,
  expiryInfo,
  formatPeso,
  fromCents,
  inRange,
  lineTotalPeso,
  profitLastDays,
  round2,
  scEligibleProduct,
  startOfDay,
  summarize7DayTrend,
  sumPeso,
  toCents,
} from './posMath';

export type AssistantLang = 'en' | 'tl';
export type AssistantTone = 'neutral' | 'emerald' | 'amber' | 'rose' | 'indigo';
export type AssistantStockFilterTarget =
  | 'ALL'
  | 'LOW'
  | 'OUT'
  | 'FAST_LOW'
  | 'DEAD'
  | 'EXPIRED'
  | 'SOON'
  | 'NO_CAP'
  | 'LOSS';

export interface AssistantMetric {
  label: string;
  value: string;
  hint?: string;
  tone?: AssistantTone;
}

export interface AssistantBar {
  label: string;
  valueText: string;
  pct: number;
  tone?: AssistantTone;
}

export type AssistantAction =
  | { type: 'open-reorder'; label: string }
  | { type: 'open-stock-filter'; label: string; filter: AssistantStockFilterTarget }
  | { type: 'open-sc-review'; label: string }
  | { type: 'open-batch-restock'; label: string }
  | { type: 'open-csv-import'; label: string }
  | { type: 'open-stock-log'; label: string }
  | { type: 'open-receipt'; label: string; receiptNo: string }
  | { type: 'open-sales'; label: string }
  | { type: 'open-held'; label: string }
  | { type: 'open-settings'; label: string }
  | { type: 'open-scanner'; label: string }
  | { type: 'open-xread'; label: string }
  | { type: 'open-zread'; label: string }
  | { type: 'open-cash-drawer'; label: string }
  | { type: 'add-to-cart'; label: string; productId: string; qty?: number }
  | { type: 'find-product-stock'; label: string; query: string };

export interface AssistantContext {
  products: Product[];
  sales: SaleRecord[];
  heldOrders: HeldOrder[];
  settings: StoreSettings;
  now?: Date;
  cart?: CartLine[];
  stockLog?: StockLogEntry[];
  securityLog?: SecurityLogEntry[];
  preferredLang?: 'auto' | AssistantLang;
}

export interface AssistantReply {
  text: string;
  lang: AssistantLang;
  intent: string;
  chips: string[];
  metrics?: AssistantMetric[];
  bars?: AssistantBar[];
  actions?: AssistantAction[];
}

export interface StorePulseSummary {
  todayNet: number;
  todayProfit: number;
  todayOrders: number;
  avg7dDaily: number;
  pacePctVsAvg: number | null;
  healthScore: number;
  healthTone: AssistantTone;
  healthLabelEn: string;
  healthLabelTl: string;
  urgentStockCount: number;
  lowCount: number;
  outCount: number;
  expiredCount: number;
  soonCount: number;
  fastLowCount: number;
  lossCount: number;
  missingCapitalCount: number;
  parkedCount: number;
  cartCount: number;
  cartNearWholesaleCount: number;
  pinConfigured: boolean;
  daysSinceBackup: number | null;
}

const CHIPS: Record<AssistantLang, string[]> = {
  en: [
    'Store briefing',
    "Today's sales",
    'Stockout forecast',
    'Top profit items',
    'Frequently bought together',
    'Expiring items',
  ],
  tl: [
    'Kamusta ang tindahan?',
    'Benta ngayon',
    'Ano ang dapat i-restock?',
    'Pinakamalaking tubo',
    'Madalas magkasamang bilhin',
    'Malapit nang ma-expire',
  ],
};

const CHIPMAP: Record<string, Record<AssistantLang, string[]>> = {
  briefing: {
    en: ['Stockout forecast', "Today's sales", 'Margin & price audit', 'Frequently bought together'],
    tl: ['Kelan mauubos ang stock?', 'Benta ngayon', 'Suriin ang tubo at presyo', 'Madalas magkasamang bilhin'],
  },
  sales: {
    en: ['Yesterday', 'Last 7 days', 'Compare today vs yesterday', 'Category sales'],
    tl: ['Kahapon', 'Nakaraang 7 araw', 'Ikumpara ang ngayon at kahapon', 'Benta bawat kategorya'],
  },
  best: {
    en: ['Top profit items', 'Frequently bought together', 'Slow moving items', 'Busiest hours'],
    tl: ['Pinakamalaking tubo', 'Madalas magkasamang bilhin', 'Mga hindi mabenta', 'Pinaka-busy na oras'],
  },
  topprofit: {
    en: ['Margin & price audit', 'Best sellers', 'Profit this month'],
    tl: ['Suriin ang tubo at presyo', 'Pinakamabenta', 'Tubo ngayong buwan'],
  },
  profit: {
    en: ['Yesterday', 'This month', 'Top profit items', 'Margin & price audit'],
    tl: ['Kahapon', 'Ngayong buwan', 'Pinakamalaking tubo', 'Suriin ang tubo at presyo'],
  },
  low: {
    en: ['Stockout forecast', 'Expiring items', 'Slow moving items', 'Inventory value'],
    tl: ['Kelan mauubos ang stock?', 'Malapit nang ma-expire', 'Mga hindi mabenta', 'Halaga ng imbentaryo'],
  },
  forecast: {
    en: ['What should I restock?', 'Expiring items', 'Best sellers'],
    tl: ['Ano ang dapat i-restock?', 'Malapit nang ma-expire', 'Pinakamabenta'],
  },
  expiry: {
    en: ['What should I restock?', 'Slow moving items', 'Store briefing'],
    tl: ['Ano ang dapat i-restock?', 'Mga hindi mabenta', 'Kamusta ang tindahan?'],
  },
  slow: {
    en: ['Best sellers', 'Stockout forecast', 'Margin & price audit'],
    tl: ['Pinakamabenta', 'Kelan mauubos ang stock?', 'Suriin ang tubo at presyo'],
  },
  peak: {
    en: ['Daypart breakdown', 'Yesterday', 'Last 7 days', 'Best sellers'],
    tl: ['Benta umaga vs gabi', 'Kahapon', 'Nakaraang 7 araw', 'Pinakamabenta'],
  },
  daypart: {
    en: ['Busiest hours', 'Last 7 days', "Today's sales"],
    tl: ['Pinaka-busy na oras', 'Nakaraang 7 araw', 'Benta ngayon'],
  },
  bundles: {
    en: ['Best sellers', 'Category sales', 'Margin & price audit'],
    tl: ['Pinakamabenta', 'Benta bawat kategorya', 'Suriin ang tubo at presyo'],
  },
  category: {
    en: ['Last 7 days', 'Best sellers', 'Inventory value'],
    tl: ['Nakaraang 7 araw', 'Pinakamabenta', 'Halaga ng imbentaryo'],
  },
  margins: {
    en: ['Items below capital', 'Top profit items', 'Inventory value'],
    tl: ['Mga luging paninda', 'Pinakamalaking tubo', 'Halaga ng imbentaryo'],
  },
  cart: {
    en: ['Store briefing', 'Margin & price audit', 'Held orders'],
    tl: ['Kamusta ang tindahan?', 'Suriin ang tubo at presyo', 'Mga naka-hold na order'],
  },
  receipt: {
    en: ["Today's sales", 'Voided sales', 'Payments today'],
    tl: ['Benta ngayon', 'Na-void na benta', 'Mga bayad ngayon'],
  },
  security: {
    en: ['Store briefing', 'Voided sales', "Today's sales"],
    tl: ['Kamusta ang tindahan?', 'Na-void na benta', 'Benta ngayon'],
  },
  void: {
    en: ['Voided last 7 days', "Today's sales", 'Security health'],
    tl: ['Na-void nakaraang 7 araw', 'Benta ngayon', 'Kalagayan ng seguridad'],
  },
  payments: {
    en: ["Today's sales", 'Last 7 days', 'Daypart breakdown'],
    tl: ['Benta ngayon', 'Nakaraang 7 araw', 'Benta umaga vs gabi'],
  },
  loss: {
    en: ['Margin & price audit', 'Top profit items', 'Inventory value'],
    tl: ['Suriin ang tubo at presyo', 'Pinakamalaking tubo', 'Halaga ng imbentaryo'],
  },
  held: {
    en: ["Today's sales", 'Check cart', 'What should I restock?'],
    tl: ['Benta ngayon', 'Suriin ang cart', 'Ano ang dapat i-restock?'],
  },
  closing: {
    en: ['Store briefing', 'Compare today vs yesterday', 'Security health'],
    tl: ['Kamusta ang tindahan?', 'Ikumpara ang ngayon at kahapon', 'Kalagayan ng seguridad'],
  },
};

const TL_WORDS = new Set(
  (
    'ano anong magkano ilan ilang meron mayroon po opo ang ng mga yung ung kahapon kagabi ngayon ngayong kanina linggo lingo buwan benta nabenta mabenta ' +
    'pinakamabenta pinaka pinakamalaking kita kinita kumita tubo paubos ubos maubos kulang wala naman lang kumusta kamusta musta salamat paki pakitingnan tingnan tignan sabihin ipakita ' +
    'gusto presyo natira puhunan hindi di mo ko namin natin kami sino saan kailan kelan bakit paano pwede puwede sige oo araw paso nakaraang nakaraan nakalipas mamimili suki bayad dagdag ' +
    'listahan dapat kailangan tulong magandang umaga tanghali hapon gabi ba pa na sa malapit nang imbentaryo paninda halaga ikumpara kumpara tingi hanap hanapin pila gaano karami lugi ' +
    'kategorya kasabay magkasama resibo tindahan kalagayan bilhin suriin sarado kaha remittance'
  ).split(' '),
);

const EN_WORDS = new Set(
  (
    'the what how show sales sale price stock today yesterday please my our items item week month best top low expiring expired restock reorder profit inventory ' +
    'sold many much are is any list tell give hello help thanks thank you voided busiest slow moving compare last days day this and about payment payments loss losing held parked ' +
    'briefing health status forecast predict bundles combos category categories margin margins cart basket receipt security backup audit shift morning afternoon evening weekend closing eod drawer'
  ).split(' '),
);

const SLANG: Record<string, string> = {
  mgkano: 'magkano',
  magkno: 'magkano',
  mkano: 'magkano',
  magkanu: 'magkano',
  mgkno: 'magkano',
  pls: 'please',
  plz: 'please',
  pki: 'paki',
  ngyon: 'ngayon',
  ngayn: 'ngayon',
  nyon: 'ngayon',
  ngaun: 'ngayon',
  khapon: 'kahapon',
  kahapn: 'kahapon',
  kahapun: 'kahapon',
  kailn: 'kailan',
  kelan: 'kailan',
  bnta: 'benta',
  pila: 'ilan',
  tira: 'natira',
  stck: 'stock',
  qty: 'quantity',
  sls: 'sales',
  prc: 'price',
  prce: 'price',
  tnx: 'thanks',
  thx: 'thanks',
  ty: 'thanks',
  slamat: 'salamat',
  tody: 'today',
  todays: 'today',
  '2day': 'today',
  yesterdy: 'yesterday',
  yestarday: 'yesterday',
  yesturday: 'yesterday',
  yday: 'yesterday',
  wk: 'week',
  mnth: 'month',
  bestseller: 'best seller',
  bestsellers: 'best sellers',
  lowstock: 'low stock',
  restok: 'restock',
  reorderr: 'reorder',
  expiry: 'expiry',
  forcast: 'forecast',
  breifing: 'briefing',
  brieffing: 'briefing',
  categry: 'category',
  categries: 'categories',
  recipt: 'receipt',
  reciept: 'receipt',
  resibo: 'receipt',
  secrity: 'security',
};

const VOCAB = [
  'yesterday', 'restock', 'reorder', 'expiring', 'expired', 'expire', 'expiry', 'profit', 'inventory', 'voided',
  'compare', 'busiest', 'popular', 'magkano', 'kahapon', 'ngayon', 'ngayong', 'linggo', 'presyo', 'natira',
  'puhunan', 'nabenta', 'mabenta', 'sales', 'price', 'stock', 'month', 'items', 'capital', 'margin', 'margins',
  'sellers', 'selling', 'transactions', 'customers', 'revenue', 'payments', 'paubos', 'maubos', 'imbentaryo',
  'paninda', 'kinita', 'kumita', 'today', 'week', 'barcode', 'wholesale', 'gcash', 'maya', 'parked', 'held',
  'briefing', 'forecast', 'stockout', 'bundles', 'category', 'categories', 'receipt', 'security', 'backup',
  'morning', 'afternoon', 'evening', 'weekend', 'weekday', 'tindahan', 'kategorya',
];

const STOP = new Set(
  (
    'the and how much for what price prices stock stocks item items sales sale today many have show tell are you can ang ano anong magkano meron mayroon may mga ilan ilang yung ung nang sa ng na pa po ba ' +
    'is of in on to me my our all any available presyo benta check kaya please low out left remaining natira yesterday kahapon kagabi kanina ngayon ngayong araw days day week month year linggo lingo buwan sold nabenta ' +
    'last this nakaraang nakaraan nakalipas hm cost wholesale retail bulk tingi quantity pieces pcs find search look lookup list gusto naman lang din rin ito iyan iyon yan yon nito noon pwede puwede paki pakitingnan tingnan ' +
    'tignan ipakita sabihin ilista there got does did was were with about from than then also give want need would could should get make made which who when where why sino saan kailan bakit paano per each every ' +
    'hanap hanapin ilan pila gaano karami kung meron wala hindi sold selling stocks remaining stock'
  ).split(' '),
);

const ALIAS: [RegExp, string][] = [
  [/\bcoke\b/g, 'coca cola'], [/\bsprite\b/g, 'sprite'], [/\bsardinas\b/g, 'sardines'], [/\bbigas\b/g, 'bigas rice'],
  [/\bkanin\b/g, 'rice'], [/\bmantika\b/g, 'mantika oil'], [/\bgatas\b/g, 'gatas milk'], [/\btinapay\b/g, 'tinapay bread'],
  [/\bkape\b/g, 'kape coffee'], [/\btoyo\b/g, 'toyo soy sauce'], [/\bsuka\b/g, 'suka vinegar'], [/\bsabon\b/g, 'sabon soap'],
  [/\bmanok\b/g, 'manok chicken'], [/\bbaboy\b/g, 'baboy pork'], [/\bbaka\b/g, 'baka beef'], [/\bitlog\b/g, 'itlog egg'],
  [/\basukal\b/g, 'asukal sugar'], [/\basin\b/g, 'asin salt'], [/\btubig\b/g, 'tubig water'], [/\bsibuyas\b/g, 'sibuyas onion'],
  [/\bbawang\b/g, 'bawang garlic'], [/\bpatatas\b/g, 'patatas potato'], [/\bkarne\b/g, 'karne meat'], [/\bisda\b/g, 'isda fish'],
  [/\bmantikilya\b/g, 'butter'], [/\bkeso\b/g, 'keso cheese'], [/\bsigarilyo\b/g, 'sigarilyo cigarette'], [/\byelo\b/g, 'yelo ice'],
  [/\btisyu\b/g, 'tisyu tissue'], [/\bdelata\b/g, 'delata canned'], [/\blata\b/g, 'lata canned'], [/\bkendi\b/g, 'kendi candy'],
  [/\bbiskwit\b/g, 'biskwit biscuit'], [/\bpancit\b/g, 'pancit noodles'], [/\binumin\b/g, 'inumin drink'],
  [/\bsoftdrinks?\b/g, 'coca cola beverages'], [/\bchichirya\b/g, 'snacks'], [/\bpampaligo\b/g, 'soap'],
  [/\bpanglaba\b/g, 'detergent'], [/\bhotdog\b/g, 'hotdog'], [/\btocino\b/g, 'tocino'],
];

const RANGE_ONLY = /\b(yesterday|kahapon|kagabi|today|ngayon|ngayong|kanina|araw|nitong|week|linggo|lingo|month|buwan|days?|last|this|nakaraang|nakaraan|nakalipas|all time|overall|lahat|and|then|how about|what about|eh|e|paano|kumusta|kamusta|naman|na|po|ba|kaya|ano|ang|sa|ng|yung|ung|\d+)\b/g;
const RANGE_AWARE = new Set(['sales', 'profit', 'best', 'topprofit', 'void', 'peak', 'psales', 'payments', 'bundles', 'category', 'daypart']);

function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function countCartNearWholesale(cart: CartLine[] | undefined, products: Product[]): number {
  if (!cart || !cart.length) return 0;
  const byId = new Map(products.map((p) => [p.id, p]));
  let count = 0;
  for (const line of cart) {
    const prod = byId.get(line.productId);
    const minQty = Number(prod?.wholesaleMinQty ?? line.wholesaleMinQty) || 0;
    const whs = Number(prod?.wholesalePrice ?? line.wholesalePrice) || 0;
    const ret = Number(prod?.retailPrice ?? line.retailPrice) || 0;
    const cap = Number(prod?.capital) || 0;
    const whsValid = whs > 0 && whs < ret && !(cap > 0 && whs < cap);
    if (!whsValid || !(minQty > 1)) continue;
    if (line.qty >= minQty * 0.5 && line.qty < minQty) {
      count++;
    } else if (line.qty >= minQty && line.priceType !== 'wholesale') {
      count++;
    }
  }
  return count;
}

function calcDaysSinceBackup(settings: StoreSettings, now: Date): number | null {
  const raw = String(settings.lastBackup || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / DAY_MS));
}

export function computeStorePulse(ctx: AssistantContext): StorePulseSummary {
  const now = ctx.now || new Date();
  const todayStart = startOfDay(now);
  const tomorrow = new Date(todayStart.getTime() + DAY_MS);
  const todaySales = ctx.sales.filter((s) => !s.voided && inRange(s, todayStart, tomorrow));
  const todayStats = computeSalesStats(todaySales, ctx.products);
  const points7 = computeLast7DaysNetSales(ctx.sales, now);
  const trend7 = summarize7DayTrend(points7);
  const stockHealth = computeStockHealthSummary(ctx.products, ctx.sales, ctx.settings, now);
  const pinConfigured = pinIsSet(ctx.settings);
  const daysSinceBackup = calcDaysSinceBackup(ctx.settings, now);

  let score = 100;
  score -= Math.min(20, stockHealth.outCount * 4);
  score -= Math.min(20, stockHealth.expiredCount * 8);
  score -= Math.min(10, stockHealth.soonCount * 2);
  score -= Math.min(12, stockHealth.fastLowCount * 3);
  score -= Math.min(18, stockHealth.lossMarginCount * 7);
  if (stockHealth.totalSkus > 0 && stockHealth.missingCapitalCount > 0) {
    score -= Math.min(10, Math.round((stockHealth.missingCapitalCount / stockHealth.totalSkus) * 12));
  }
  if (!pinConfigured) score -= 6;
  if (daysSinceBackup === null || daysSinceBackup > 14) score -= 6;
  const healthScore = Math.max(0, Math.min(100, Math.round(score)));

  const healthTone: AssistantTone =
    healthScore >= 85 ? 'emerald' : healthScore >= 65 ? 'indigo' : healthScore >= 45 ? 'amber' : 'rose';
  const healthLabelEn =
    healthScore >= 85 ? 'Excellent' : healthScore >= 65 ? 'Healthy' : healthScore >= 45 ? 'Needs Attention' : 'Critical';
  const healthLabelTl =
    healthScore >= 85 ? 'Napakaganda' : healthScore >= 65 ? 'Maayos' : healthScore >= 45 ? 'Kailangan ng Pansin' : 'Kritikal';

  const pacePctVsAvg =
    trend7.average > 0 ? round2(((todayStats.net - trend7.average) / trend7.average) * 100) : null;

  return {
    todayNet: todayStats.net,
    todayProfit: todayStats.profit,
    todayOrders: todayStats.count,
    avg7dDaily: trend7.average,
    pacePctVsAvg,
    healthScore,
    healthTone,
    healthLabelEn,
    healthLabelTl,
    urgentStockCount: stockHealth.outCount + stockHealth.expiredCount + stockHealth.fastLowCount,
    lowCount: stockHealth.lowCount,
    outCount: stockHealth.outCount,
    expiredCount: stockHealth.expiredCount,
    soonCount: stockHealth.soonCount,
    fastLowCount: stockHealth.fastLowCount,
    lossCount: stockHealth.lossMarginCount,
    missingCapitalCount: stockHealth.missingCapitalCount,
    parkedCount: ctx.heldOrders.length,
    cartCount: ctx.cart ? ctx.cart.length : 0,
    cartNearWholesaleCount: countCartNearWholesale(ctx.cart, ctx.products),
    pinConfigured,
    daysSinceBackup,
  };
}

export class OfflineAssistant {
  private lang: AssistantLang = 'en';
  private lastIntent = '';
  private lastProducts: Product[] = [];
  private lastQ = '';

  reset(lang: AssistantLang = 'en'): AssistantReply {
    this.lang = lang;
    this.lastIntent = '';
    this.lastProducts = [];
    this.lastQ = '';
    return {
      text:
        lang === 'tl'
          ? 'Kumusta! Ako ang upgraded OmniMart Store AI. Handa akong magbigay ng store briefing, hula kung kelan mauubos ang stock, madalas magkasamang paninda, tubo at margin audit, cart wholesale check, resibo lookup, at instant na pagbukas ng mga tools—nang hindi binabago ang kahit anong naka-save mong data offline.\n\nSubukan: "Kamusta ang tindahan?", "Kelan mauubos ang stock?", o "Magkano ang Milo?"'
          : 'Hi! I\'m your upgraded OmniMart Store AI. I can generate executive briefings, stockout forecasts, bundle affinities, margin audits, category breakdowns, cart wholesale checks, and receipt lookups—strictly read-only and 100% offline so your saved mobile & tablet data is always safe.\n\nTry: "Store briefing", "Stockout forecast", or "Magkano ang Milo?"',
      lang: this.lang,
      intent: '',
      chips: CHIPS[this.lang],
    };
  }

  ask(text: string, ctx: AssistantContext): AssistantReply {
    const rawTrimmed = String(text || '').trim();
    const q = this.prep(text, ctx.products);
    const toks = q.split(' ').filter(Boolean);

    if (ctx.preferredLang === 'en' || ctx.preferredLang === 'tl') {
      this.lang = ctx.preferredLang;
    } else {
      this.lang = this.detectLang(toks, this.lang);
    }

    const T = (en: string, tl: string) => (this.lang === 'tl' ? tl : en);
    const P = (n: unknown) => formatPeso(n);
    const N = (n: unknown) => Number((Number(n) || 0).toFixed(2));
    const qtyTxt = (qty: unknown, u: string) => `${N(qty)} ${u}`;
    const orders = (c: number) => T(`${c} order${c === 1 ? '' : 's'}`, `${c} order`);
    const th = () => Number(ctx.settings.lowStockThreshold) || 10;
    const now = ctx.now || new Date();

    const range = (rq: string, def: 'today' | '30d') => {
      const t = startOfDay(now);
      const end = new Date(t.getTime() + DAY_MS);
      const lab = (key: string, n?: number) =>
        ({
          today: T('Today', 'Ngayong araw'),
          yesterday: T('Yesterday', 'Kahapon'),
          week: T('Last 7 days', 'Nakaraang 7 araw'),
          month: T('Last 30 days', 'Nakaraang 30 araw'),
          all: T('All time', 'Lahat ng panahon'),
          n: T(`Last ${n} days`, `Nakaraang ${n} araw`),
        })[key] || '';
      const mk = (key: string, from: Date, to: Date, days: number, n?: number) => ({
        key,
        from,
        to,
        days,
        label: lab(key, n),
      });
      if (/\b(yesterday|kahapon|kagabi)\b/.test(rq)) return mk('yesterday', new Date(t.getTime() - DAY_MS), t, 1);
      const m = /\b(\d{1,3}) ?(days?|araw)\b/.exec(rq);
      if (m && +m[1] >= 2 && +m[1] <= 365) {
        const n = +m[1];
        return mk(n === 7 ? 'week' : n === 30 ? 'month' : 'n', new Date(t.getTime() - (n - 1) * DAY_MS), end, n, n);
      }
      if (/\b(week|linggo|lingo|weekly|7d)\b/.test(rq)) return mk('week', new Date(t.getTime() - 6 * DAY_MS), end, 7);
      if (/\b(month|buwan|monthly|30d)\b/.test(rq)) return mk('month', new Date(t.getTime() - 29 * DAY_MS), end, 30);
      if (/\ball ?time\b|\boverall\b|\blahat ng\b|simula noon/.test(rq)) {
        return mk('all', new Date(0), new Date(8640000000000000), 0);
      }
      if (/\b(today|ngayon|ngayong|kanina|nitong)\b/.test(rq) || def !== '30d') return mk('today', t, end, 1);
      return mk('month', new Date(t.getTime() - 29 * DAY_MS), end, 30);
    };

    const liveSales = (r: { from: Date; to: Date }) => ctx.sales.filter((s) => !s.voided && inRange(s, r.from, r.to));

    const helpText = () =>
      T(
        'I analyze your saved POS data offline and never modify stored records. Try asking:\n- "Store briefing" — overall health score, alerts & today\'s pace\n- "Stockout forecast" — exact days left per fast-moving SKU\n- "Frequently bought together" — combo pairs from your receipts\n- "Category sales" / "Margin & price audit" / "Daypart breakdown"\n- "Check cart" — wholesale qty & Senior/PWD check on current basket\n- "Receipt OR-..." / "Security health" / "Sales last 7 days"\n- Or ask in Tagalog anytime: "magkano ang Milo?", "kelan mauubos ang stock?"',
        'Sinusuri ko ang POS data mo nang offline at hindi ko binabago ang mga record. Subukan itanong:\n- "Kamusta ang tindahan?" — store health score, alerts at takbo ng benta\n- "Kelan mauubos ang stock?" — tinatayang araw bago maubos ang mga paninda\n- "Madalas magkasamang bilhin" — combo pairs mula sa mga resibo mo\n- "Benta bawat kategorya" / "Suriin ang tubo at presyo" / "Benta umaga vs gabi"\n- "Suriin ang cart" — wholesale qty at Senior/PWD check sa kasalukuyang basket\n- "Resibo OR-..." / "Kalagayan ng seguridad" / "Benta ngayon"',
      );

    const reply = (
      intent: string,
      replyText: string,
      extras?: Partial<Pick<AssistantReply, 'metrics' | 'bars' | 'actions'>>,
    ): AssistantReply => {
      if (intent) this.lastIntent = intent;
      const m = CHIPMAP[this.lastIntent];
      return {
        text: replyText,
        lang: this.lang,
        intent: this.lastIntent,
        chips: (m ? m[this.lang] : null) || CHIPS[this.lang],
        ...extras,
      };
    };

    if (!q) return reply('', helpText());

    const stMsg = this.smallTalk(q, toks, T);
    if (stMsg) return reply('', stMsg);
    if (/\b(help|menu|tulong|tulungan|what can you do|ano kaya mo|ano ang kaya mo|ano ang magagawa mo|paano gamitin)\b/.test(q)) {
      return reply('', helpText());
    }

    const run = (intent: string, rq: string, ms: Product[] = [], categoryMatch = ''): AssistantReply => {
      this.lastIntent = intent;
      this.lastQ = rq;
      switch (intent) {
        case 'briefing': {
          const pulse = computeStorePulse(ctx);
          const healthTone = pulse.healthTone;
          const healthLbl = this.lang === 'tl' ? pulse.healthLabelTl : pulse.healthLabelEn;
          const paceStr =
            pulse.pacePctVsAvg !== null
              ? `${pulse.pacePctVsAvg >= 0 ? '+' : ''}${pulse.pacePctVsAvg.toFixed(0)}% vs 7d avg`
              : T(`${pulse.todayOrders} order(s) today`, `${pulse.todayOrders} order ngayon`);

          const lines: string[] = [
            `**${T('Store Executive Briefing', 'Buod ng Kalagayan ng Tindahan')}** — **${pulse.healthScore}/100 (${healthLbl})**`,
            `- ${T('Today Net Sales:', 'Netong Benta Ngayon:')} **${P(pulse.todayNet)}** (${orders(pulse.todayOrders)}${pulse.avg7dDaily > 0 ? `, 7d avg ${P(pulse.avg7dDaily)}/day` : ''})`,
            `- ${T('Stock Alerts:', 'Bantay sa Stock:')} ${pulse.outCount} ${T('out', 'ubos')}, ${pulse.lowCount} ${T('low', 'mababa')}, ${pulse.fastLowCount} ${T('fast-draining', 'mabilis maubos')}`,
            `- ${T('Shelf & Pricing:', 'Shelf at Presyo:')} ${pulse.expiredCount} ${T('expired', 'paso')}, ${pulse.soonCount} ${T('expiring soon', 'malapit ma-expire')}, ${pulse.lossCount} ${T('below capital', 'lugi')}`,
          ];
          if (pulse.cartCount > 0) {
            lines.push(
              `- ${T('Active Cart:', 'Kasalukuyang Cart:')} ${pulse.cartCount} ${T('line(s)', 'item')}${pulse.cartNearWholesaleCount > 0 ? ` (${pulse.cartNearWholesaleCount} ${T('near wholesale savings!', 'malapit sa wholesale discount!')})` : ''}`,
            );
          }
          lines.push(
            `- ${T('Safety & Backup:', 'Seguridad at Backup:')} ${pulse.pinConfigured ? T('Manager PIN active', 'May Manager PIN') : T('No Manager PIN yet', 'Wala pang Manager PIN')} · ${
              pulse.daysSinceBackup === null
                ? T('No backup recorded yet', 'Wala pang backup')
                : T(`Last backup ${pulse.daysSinceBackup}d ago`, `Huling backup ${pulse.daysSinceBackup} araw na`)
            }`,
          );

          const actions: AssistantAction[] = [];
          if (pulse.expiredCount > 0) actions.push({ type: 'open-stock-filter', label: T(`Inspect Expired (${pulse.expiredCount})`, `Tingnan ang Paso (${pulse.expiredCount})`), filter: 'EXPIRED' });
          if (pulse.urgentStockCount > 0 || pulse.lowCount > 0) actions.push({ type: 'open-reorder', label: T('Open Reorder List', 'Buksan ang Reorder') });
          if (pulse.lossCount > 0) actions.push({ type: 'open-stock-filter', label: T(`Fix Below-Capital (${pulse.lossCount})`, `Ayusin ang Lugi (${pulse.lossCount})`), filter: 'LOSS' });
          if (!pulse.pinConfigured || pulse.daysSinceBackup === null || pulse.daysSinceBackup > 14) {
            actions.push({ type: 'open-settings', label: T('Security & Backup', 'Seguridad at Backup') });
          }

          const bars: AssistantBar[] = [
            {
              label: T('Store Health Index', 'Kalusugan ng Tindahan'),
              valueText: `${pulse.healthScore}%`,
              pct: pulse.healthScore,
              tone: healthTone,
            },
          ];
          if (pulse.avg7dDaily > 0) {
            const ratio = Math.min(100, Math.round((pulse.todayNet / pulse.avg7dDaily) * 100));
            bars.push({
              label: T('Today vs 7-Day Daily Avg', 'Ngayon kumpara sa 7d Avg'),
              valueText: `${P(pulse.todayNet)} / ${P(pulse.avg7dDaily)}`,
              pct: ratio,
              tone: pulse.todayNet >= pulse.avg7dDaily ? 'emerald' : 'indigo',
            });
          }

          return reply(intent, lines.join('\n'), {
            metrics: [
              { label: T('Health Score', 'Health Score'), value: `${pulse.healthScore}/100`, hint: healthLbl, tone: healthTone },
              { label: T('Today Net', 'Benta Ngayon'), value: P(pulse.todayNet), hint: paceStr, tone: 'emerald' },
              {
                label: T('Urgent Alerts', 'Agarang Aksyon'),
                value: String(pulse.urgentStockCount + pulse.lossCount),
                hint: `${pulse.outCount} out · ${pulse.expiredCount} exp · ${pulse.lossCount} loss`,
                tone: pulse.urgentStockCount + pulse.lossCount > 0 ? 'rose' : 'emerald',
              },
              { label: T('Parked / Hold', 'Naka-Hold'), value: String(pulse.parkedCount), hint: T('orders waiting', 'naka-park na order'), tone: 'neutral' },
            ],
            bars,
            actions: actions.slice(0, 4),
          });
        }

        case 'forecast': {
          const ro = computeReorderList(ctx.products, ctx.sales, ctx.settings, now.getTime());
          const vel = computeProductVelocities(ctx.products, ctx.sales, now.getTime());
          if (!vel.hasSalesInWindow) {
            return reply(
              intent,
              T(
                'Stockout velocity needs at least 1 recent sale in the last 30 days. Record some sales or inspect low stock directly.',
                'Kailangan ng kahit 1 benta sa nakaraang 30 araw para makapaghula kung kelan mauubos ang stock.',
              ),
              {
                actions: [
                  { type: 'open-stock-filter', label: T('View Low Stock', 'Tingnan ang Mababang Stock'), filter: 'LOW' },
                  { type: 'open-batch-restock', label: T('Batch Restock', 'Sabayang Restock') },
                ],
              },
            );
          }

          const candidates = ctx.products
            .map((p) => {
              const v = vel.byId.get(p.id);
              return { p, v };
            })
            .filter((x) => x.v && x.v.avgDaily > 0)
            .sort((a, b) => (a.v!.daysOfCover ?? 999) - (b.v!.daysOfCover ?? 999));

          const leadSafety = (Number(ctx.settings.reorderLeadDays) || 3) + (Number(ctx.settings.reorderSafetyDays) || 2);
          const critical = candidates.filter((x) => (x.v!.daysOfCover ?? 999) <= leadSafety);
          const topList = candidates.slice(0, 6);
          const totalRestockCost = sumPeso(ro.rows, (r) => r.cost ?? 0);

          const lines: string[] = [
            `**${T(`Stockout Forecast (${vel.windowDays}-day sales pace)`, `Hula kung Kelan Mauubos (batay sa ${vel.windowDays} araw)`)}**`,
            `- ${T('At-risk SKUs (<= ' + leadSafety + 'd cover):', 'Nanganganib maubos (<= ' + leadSafety + ' araw):')} **${critical.length}**`,
          ];
          topList.forEach((x, idx) => {
            const d = x.v!.daysOfCover ?? 0;
            const dTxt = d <= 0 ? T('OUT NOW', 'UBOS NA') : T(`~${d.toFixed(1)}d left`, `~${d.toFixed(1)} araw na lang`);
            lines.push(
              `${idx + 1}. **${x.p.name}** — ${dTxt} (${qtyTxt(x.p.stock, x.p.unit)} @ ${x.v!.avgDaily.toFixed(1)}/d)`,
            );
          });
          if (ro.rows.length > 0 && totalRestockCost > 0) {
            lines.push(`- ${T('Estimated restock capital for suggested orders:', 'Tinatayang puhunan para sa reorder:')} **${P(totalRestockCost)}**`);
          }

          const bars: AssistantBar[] = topList.slice(0, 5).map((x) => {
            const d = Math.max(0, x.v!.daysOfCover ?? 0);
            const pct = clampPct((d / 14) * 100);
            return {
              label: x.p.name,
              valueText: d <= 0 ? T('0d (OUT)', '0d (UBOS)') : `${d.toFixed(1)}d`,
              pct: Math.max(4, pct),
              tone: d <= 2 ? 'rose' : d <= leadSafety ? 'amber' : 'emerald',
            };
          });

          return reply(intent, lines.join('\n'), {
            metrics: [
              { label: T('Urgent (<= ' + leadSafety + 'd)', 'Agaran (<= ' + leadSafety + 'd)'), value: String(critical.length), tone: critical.length > 0 ? 'rose' : 'emerald' },
              { label: T('Reorder List', 'I-reorder'), value: String(ro.rows.length), hint: T('suggested SKUs', 'mungkahing SKU'), tone: 'indigo' },
              { label: T('Est. Reorder Cost', 'Gastos sa Reorder'), value: P(totalRestockCost), tone: 'amber' },
            ],
            bars,
            actions: [
              { type: 'open-reorder', label: T('Open Smart Reorder', 'Buksan ang Smart Reorder') },
              { type: 'open-stock-filter', label: T('Filter Fast-Draining', 'I-filter ang Paubos'), filter: 'FAST_LOW' },
              { type: 'open-batch-restock', label: T('Batch Receive Stock', 'Mag-receive ng Stock') },
            ],
          });
        }

        case 'bundles': {
          const r = range(rq, '30d');
          const list = liveSales(r).filter((s) => (s.items || []).length >= 2);
          if (!list.length) {
            return reply(
              intent,
              T(
                `No multi-item receipts found in **${r.label}** to mine item combinations.`,
                `Walang resibo na may 2+ item sa **${r.label}** para makahanap ng combo.`,
              ),
              {
                actions: [{ type: 'open-sales', label: T('Open Sales Tab', 'Buksan ang Sales') }],
              },
            );
          }

          const pairMap = new Map<string, { a: string; b: string; count: number; totalValue: number }>();
          for (const s of list) {
            const seen = new Map<string, { name: string; lineTotal: number }>();
            for (const it of s.items || []) {
              const key = it.productId || it.name;
              const prev = seen.get(key);
              if (prev) prev.lineTotal += Number(it.lineTotal) || 0;
              else seen.set(key, { name: it.name, lineTotal: Number(it.lineTotal) || 0 });
            }
            const entries = Array.from(seen.entries()).sort((x, y) => x[0].localeCompare(y[0]));
            for (let i = 0; i < entries.length; i++) {
              for (let j = i + 1; j < entries.length; j++) {
                const pairKey = `${entries[i][0]}||${entries[j][0]}`;
                const existing = pairMap.get(pairKey);
                const val = entries[i][1].lineTotal + entries[j][1].lineTotal;
                if (existing) {
                  existing.count += 1;
                  existing.totalValue = round2(existing.totalValue + val);
                } else {
                  pairMap.set(pairKey, {
                    a: entries[i][1].name,
                    b: entries[j][1].name,
                    count: 1,
                    totalValue: round2(val),
                  });
                }
              }
            }
          }

          const topPairs = Array.from(pairMap.values())
            .sort((x, y) => y.count - x.count || y.totalValue - x.totalValue)
            .slice(0, 6);

          if (!topPairs.length) {
            return reply(intent, T('Customers only bought single unique items per receipt so far.', 'Isang klase ng item pa lang bawat resibo sa ngayon.'));
          }

          const maxCount = topPairs[0].count;
          const lines = [
            `**${T(`Frequently Bought Together — ${r.label}`, `Madalas Magkasamang Bilhin — ${r.label}`)}**`,
            ...topPairs.map(
              (p, i) =>
                `${i + 1}. **${p.a}** + **${p.b}** — ${p.count}x (${Math.round((p.count / list.length) * 100)}% ${T('of multi-item baskets', 'ng basket')})`,
            ),
            '',
            T(
              'Tip: Place top pairs side-by-side or offer a wholesale bundle prompt at checkout.',
              'Tip: Itabi sa shelf ang magkaparehang ito o i-alok bilang combo bundle sa counter.',
            ),
          ];

          return reply(intent, lines.join('\n'), {
            metrics: [
              { label: T('Multi-Item Orders', '2+ Item Orders'), value: String(list.length), tone: 'indigo' },
              { label: T('Top Pair Hits', 'Pinakamadalas'), value: `${topPairs[0].count}x`, hint: `${topPairs[0].a} + ${topPairs[0].b}`, tone: 'emerald' },
            ],
            bars: topPairs.slice(0, 4).map((p) => ({
              label: `${p.a} + ${p.b}`,
              valueText: `${p.count}x`,
              pct: clampPct((p.count / maxCount) * 100),
              tone: 'indigo',
            })),
            actions: [{ type: 'open-sales', label: T('Inspect Receipts', 'Tingnan ang mga Resibo') }],
          });
        }

        case 'category': {
          const r = range(rq, '30d');
          const list = liveSales(r);
          if (categoryMatch) {
            const catProds = ctx.products.filter((p) => p.category.toLowerCase() === categoryMatch.toLowerCase());
            const st = computeSalesStats(list, ctx.products);
            const catRev = Object.entries(st.cats).find(([c]) => c.toLowerCase() === categoryMatch.toLowerCase())?.[1] || 0;
            const stockVal = sumPeso(catProds, (p) => lineTotalPeso(p.retailPrice, p.stock));
            const lowC = catProds.filter((p) => p.stock <= th()).length;
            const lines = [
              `**${categoryMatch} — ${r.label}**`,
              `- ${T('Category Sales:', 'Benta sa Kategorya:')} **${P(catRev)}** (${st.net > 0 ? ((catRev / st.net) * 100).toFixed(1) : '0.0'}% ${T('share', 'bahagi')})`,
              `- ${T('Catalog SKUs:', 'Bilang ng SKU:')} ${catProds.length} (${lowC} ${T('low/out', 'mababa/ubos')})`,
              `- ${T('Stock Value (Retail):', 'Halaga ng Stock:')} ${P(stockVal)}`,
            ];
            return reply(intent, lines.join('\n'), {
              metrics: [
                { label: T('Cat. Sales', 'Benta'), value: P(catRev), tone: 'emerald' },
                { label: T('SKUs', 'SKU'), value: String(catProds.length), hint: `${lowC} low/out`, tone: lowC > 0 ? 'amber' : 'neutral' },
                { label: T('Stock Value', 'Halaga ng Stock'), value: P(stockVal), tone: 'indigo' },
              ],
            });
          }

          if (!list.length) {
            return reply(intent, T(`No category sales recorded in ${r.label} yet.`, `Wala pang naitalang benta bawat kategorya para sa ${r.label}.`));
          }
          const st = computeSalesStats(list, ctx.products);
          const sortedCats = Object.entries(st.cats).sort((a, b) => b[1] - a[1]);
          const totalCatRev = sortedCats.reduce((acc, [, v]) => acc + v, 0) || 1;
          const topCats = sortedCats.slice(0, 7);

          const lines = [
            `**${T(`Category Revenue Share — ${r.label}`, `Benta Bawat Kategorya — ${r.label}`)}**`,
            ...topCats.map(
              ([cat, amt], i) => `${i + 1}. **${cat}** — ${P(amt)} (${((amt / totalCatRev) * 100).toFixed(1)}%)`,
            ),
          ];

          return reply(intent, lines.join('\n'), {
            bars: topCats.slice(0, 5).map(([cat, amt]) => ({
              label: cat,
              valueText: `${P(amt)} (${Math.round((amt / totalCatRev) * 100)}%)`,
              pct: clampPct((amt / totalCatRev) * 100),
              tone: 'emerald',
            })),
            actions: [{ type: 'open-sales', label: T('Open Sales Breakdown', 'Buksan ang Sales Charts') }],
          });
        }

        case 'margins': {
          const withCap = ctx.products.filter((p) => Number(p.capital) > 0 && p.retailPrice > 0);
          const missingCap = ctx.products.filter((p) => !(Number(p.capital) > 0));
          const lossItems = withCap.filter((p) => p.retailPrice < Number(p.capital) || (p.wholesalePrice > 0 && p.wholesalePrice < Number(p.capital)));
          const thinItems = withCap
            .map((p) => ({
              p,
              marginPct: ((p.retailPrice - Number(p.capital)) / p.retailPrice) * 100,
              pesoMargin: round2(p.retailPrice - Number(p.capital)),
            }))
            .filter((x) => x.marginPct >= 0 && x.marginPct < 10)
            .sort((a, b) => a.marginPct - b.marginPct);
          const stars = withCap
            .map((p) => ({
              p,
              marginPct: ((p.retailPrice - Number(p.capital)) / p.retailPrice) * 100,
              pesoMargin: round2(p.retailPrice - Number(p.capital)),
            }))
            .filter((x) => x.marginPct >= 10)
            .sort((a, b) => b.marginPct - a.marginPct);

          const scCount = ctx.products.filter((p) => scEligibleProduct(p)).length;

          const lines: string[] = [
            `**${T('Margin & Pricing Audit', 'Pagsusuri sa Tubo at Presyo')}**`,
            `- ${T('Loss-priced (< capital):', 'Mas mababa sa puhunan (lugi):')} **${lossItems.length}**`,
            `- ${T('Thin margin (0–10%):', 'Manipis ang tubo (0–10%):')} **${thinItems.length}**`,
            `- ${T('Missing capital:', 'Walang puhunan:')} **${missingCap.length}** · SC/PWD eligible: **${scCount}**`,
          ];
          if (stars.length > 0) {
            lines.push('\n' + T('**Highest margin % SKUs:**', '**Pinakamatataas na margin %:**'));
            stars.slice(0, 4).forEach((s) =>
              lines.push(`- ${s.p.name}: **${s.marginPct.toFixed(1)}%** (+${P(s.pesoMargin)}/${s.p.unit})`),
            );
          }
          if (thinItems.length > 0) {
            lines.push('\n' + T('**Thin margins to watch:**', '**Mga manipis ang tubo:**'));
            thinItems.slice(0, 3).forEach((s) =>
              lines.push(`- ${s.p.name}: **${s.marginPct.toFixed(1)}%** (+${P(s.pesoMargin)})`),
            );
          }

          const actions: AssistantAction[] = [];
          if (lossItems.length > 0) actions.push({ type: 'open-stock-filter', label: T(`Inspect Loss (${lossItems.length})`, `Tingnan ang Lugi (${lossItems.length})`), filter: 'LOSS' });
          if (missingCap.length > 0) actions.push({ type: 'open-stock-filter', label: T(`Set Capital (${missingCap.length})`, `Lagyan ng Puhunan (${missingCap.length})`), filter: 'NO_CAP' });
          actions.push({ type: 'open-sc-review', label: T('Review SC/PWD Tags', 'Suriin ang SC/PWD') });

          return reply(intent, lines.join('\n'), {
            metrics: [
              { label: T('Below Capital', 'Lugi'), value: String(lossItems.length), tone: lossItems.length > 0 ? 'rose' : 'emerald' },
              { label: T('Thin (<10%)', 'Manipis (<10%)'), value: String(thinItems.length), tone: thinItems.length > 0 ? 'amber' : 'emerald' },
              { label: T('No Capital', 'Walang Puhunan'), value: String(missingCap.length), tone: missingCap.length > 0 ? 'indigo' : 'emerald' },
              { label: T('SC/PWD SKUs', 'SC/PWD Items'), value: String(scCount), tone: 'neutral' },
            ],
            actions,
          });
        }

        case 'cart': {
          const cart = ctx.cart || [];
          if (!cart.length) {
            return reply(
              intent,
              T(
                'Your POS basket is currently empty. Scan or tap products in the POS tab, then ask me to check wholesale triggers or SC/PWD discounts.',
                'Walang laman ang POS basket ngayon. Magdagdag muna ng paninda sa POS, pagkatapos itanong ulit para masuri ko ang wholesale at SC/PWD discount.',
              ),
              {
                actions: [
                  { type: 'open-scanner', label: T('Open Barcode Scanner', 'Buksan ang Scanner') },
                  ...(ctx.heldOrders.length > 0 ? [{ type: 'open-held' as const, label: T(`Parked Orders (${ctx.heldOrders.length})`, `Naka-Hold (${ctx.heldOrders.length})`) }] : []),
                ],
              },
            );
          }

          const totals = computeCartTotals(cart, ctx.products, false, ctx.settings);
          const scTotals = computeCartTotals(cart, ctx.products, true, ctx.settings);
          const prodMap = new Map(ctx.products.map((p) => [p.id, p]));
          const opps: string[] = [];

          for (const line of cart) {
            const prod = prodMap.get(line.productId);
            const minQty = Number(prod?.wholesaleMinQty ?? line.wholesaleMinQty) || 0;
            const whs = Number(prod?.wholesalePrice ?? line.wholesalePrice) || 0;
            const ret = Number(prod?.retailPrice ?? line.retailPrice) || 0;
            const cap = Number(prod?.capital) || 0;
            const validWhs = whs > 0 && whs < ret && !(cap > 0 && whs < cap);
            if (!validWhs || !(minQty > 1)) continue;

            if (line.qty < minQty && line.qty >= minQty * 0.5) {
              const need = round2(minQty - line.qty);
              const unitDiff = round2(ret - whs);
              opps.push(
                T(
                  `Add **+${need} ${line.unit}** of **${line.name}** to unlock wholesale (${P(whs)} vs ${P(ret)}, save ${P(unitDiff)}/${line.unit})`,
                  `Magdagdag ng **+${need} ${line.unit}** na **${line.name}** para sa wholesale (${P(whs)} imbes na ${P(ret)})`,
                ),
              );
            } else if (line.qty >= minQty && line.priceType !== 'wholesale') {
              opps.push(
                T(
                  `**${line.name}** already meets min qty (${minQty}+) — switch line to **Wholesale** to save ${P(round2((ret - whs) * line.qty))}!`,
                  `Sapat na ang dami ng **${line.name}** (${minQty}+) — i-switch sa **Wholesale** para makatipid ng ${P(round2((ret - whs) * line.qty))}!`,
                ),
              );
            }
          }

          const lines: string[] = [
            `**${T('Active Cart Audit', 'Pagsusuri sa Kasalukuyang Cart')}** (${cart.length} ${T('line(s)', 'item')})`,
            `- ${T('Current Total:', 'Kasalukuyang Kabuuan:')} **${P(totals.grandTotal)}**${totals.wholesaleSavings > 0 ? ` (${T('wholesale saved', 'tipid sa wholesale')} ${P(totals.wholesaleSavings)})` : ''}`,
            `- ${T('If Senior/PWD applied:', 'Kung may Senior/PWD 5%:')} **${P(scTotals.grandTotal)}** (${T('discount', 'diskwento')} ${P(scTotals.seniorDiscount)} across ${scTotals.scKinds} eligible SKU)`,
          ];
          if (opps.length > 0) {
            lines.push('\n' + T('**Wholesale Opportunities:**', '**Oportunidad sa Wholesale:**'));
            opps.forEach((o) => lines.push(`- ${o}`));
          }

          const actions: AssistantAction[] = [];
          for (const line of cart) {
            const prod = prodMap.get(line.productId);
            const minQty = Number(prod?.wholesaleMinQty ?? line.wholesaleMinQty) || 0;
            const whs = Number(prod?.wholesalePrice ?? line.wholesalePrice) || 0;
            const ret = Number(prod?.retailPrice ?? line.retailPrice) || 0;
            const cap = Number(prod?.capital) || 0;
            const validWhs = whs > 0 && whs < ret && !(cap > 0 && whs < cap);
            if (!validWhs || !(minQty > 1)) continue;
            if (line.qty < minQty && line.qty >= minQty * 0.5 && prod && prod.stock >= minQty) {
              const need = round2(minQty - line.qty);
              actions.push({
                type: 'add-to-cart',
                label: T(`Add +${need} ${line.name.split(' ')[0]}`, `Idagdag +${need} ${line.name.split(' ')[0]}`),
                productId: line.productId,
                qty: need,
              });
              break;
            }
          }
          if (ctx.heldOrders.length > 0) {
            actions.push({
              type: 'open-held',
              label: T(`Parked (${ctx.heldOrders.length})`, `Naka-Hold (${ctx.heldOrders.length})`),
            });
          }

          return reply(intent, lines.join('\n'), {
            metrics: [
              { label: T('Cart Lines', 'Mga Item'), value: String(cart.length), tone: 'neutral' },
              { label: T('Net Total', 'Kabuuan'), value: P(totals.grandTotal), tone: 'emerald' },
              { label: T('SC/PWD Potential', 'SC/PWD 5%'), value: P(scTotals.seniorDiscount), tone: 'indigo' },
            ],
            ...(actions.length ? { actions } : {}),
          });
        }

        case 'closing': {
          const t = startOfDay(now);
          const end = new Date(t.getTime() + DAY_MS);
          const todayAll = ctx.sales.filter((s) => inRange(s, t, end));
          const live = todayAll.filter((s) => !s.voided);
          const voided = todayAll.filter((s) => s.voided);
          const st = computeSalesStats(live, ctx.products);
          const drawer = computeCashDrawerSummary(ctx.sales, t, end, {}, 0);
          const digitalNet = round2(Math.max(0, st.net - drawer.expectedCashSales));
          const pulse = computeStorePulse(ctx);

          const lines = [
            `**${T('End-of-Day Shift & Closing Summary', 'Buod ng Pagsasara / Shift Ngayon')}**`,
            `- ${T('Net Sales Today:', 'Netong Benta Ngayon:')} **${P(st.net)}** (${orders(st.count)}${voided.length ? `, ${voided.length} voided` : ''})`,
            `- ${T('Expected Cash in Drawer:', 'Inaasahang Cash sa Kaha:')} **${P(drawer.expectedCashSales)}** (${drawer.cashOrders} cash${drawer.splitCashOrders ? ` + ${drawer.splitCashOrders} split` : ''})`,
            `- ${T('Digital / Card Tenders:', 'GCash / Card / Iba pa:')} **${P(digitalNet)}**`,
            `- ${T('Discounts Given:', 'Ibinigay na Diskwento:')} ${P(st.wholesaleDisc + st.seniorDisc)} (Wholesale ${P(st.wholesaleDisc)}, SC/PWD ${P(st.seniorDisc)})`,
            `- ${T('Est. Profit & Stock:', 'Tinatayang Tubo at Stock:')} **${P(st.profit)}** · ${pulse.urgentStockCount} ${T('urgent stock alert(s)', 'agarang stock alert')}`,
          ];

          return reply(intent, lines.join('\n'), {
            metrics: [
              { label: T('Expected Cash', 'Cash sa Kaha'), value: P(drawer.expectedCashSales), tone: 'emerald' },
              { label: T('Digital / Card', 'GCash / Card'), value: P(digitalNet), tone: 'indigo' },
              { label: T('Today Profit', 'Tubo Ngayon'), value: P(st.profit), hint: orders(st.count), tone: 'neutral' },
              {
                label: T('Backup Status', 'Backup'),
                value: pulse.daysSinceBackup === null ? 'None' : `${pulse.daysSinceBackup}d ago`,
                tone: pulse.daysSinceBackup !== null && pulse.daysSinceBackup <= 7 ? 'emerald' : 'amber',
              },
            ],
            actions: [
              { type: 'open-cash-drawer', label: T('Open Cash Count', 'Bilangin ang Cash') },
              { type: 'open-xread', label: T('X-Read Report', 'X-Read Summary') },
              { type: 'open-zread', label: T('Run Z-Read', 'Z-Read Closing') },
              { type: 'open-settings', label: T('Backup Vault', 'Mag-Backup') },
            ],
          });
        }

        case 'daypart': {
          const r = range(rq, '30d');
          const list = liveSales(r);
          if (!list.length) {
            return reply(intent, T(`No sales found for ${r.label} to analyze shifts.`, `Wala pang benta sa ${r.label} para sa pagsusuri ng oras.`));
          }
          const buckets = {
            morning: { label: T('Morning (5AM–12PM)', 'Umaga (5AM–12PM)'), amtC: 0, n: 0 },
            afternoon: { label: T('Afternoon (12PM–5PM)', 'Hapon (12PM–5PM)'), amtC: 0, n: 0 },
            evening: { label: T('Evening (5PM–10PM)', 'Gabi (5PM–10PM)'), amtC: 0, n: 0 },
            night: { label: T('Late Night (10PM–5AM)', 'Madaling-araw (10PM–5AM)'), amtC: 0, n: 0 },
          };
          let weekdayC = 0;
          let weekendC = 0;
          let weekdayN = 0;
          let weekendN = 0;

          for (const s of list) {
            const d = new Date(s.dateIso);
            const h = d.getHours();
            const c = toCents(s.grandTotal);
            if (h >= 5 && h < 12) {
              buckets.morning.amtC += c;
              buckets.morning.n++;
            } else if (h >= 12 && h < 17) {
              buckets.afternoon.amtC += c;
              buckets.afternoon.n++;
            } else if (h >= 17 && h < 22) {
              buckets.evening.amtC += c;
              buckets.evening.n++;
            } else {
              buckets.night.amtC += c;
              buckets.night.n++;
            }
            const dow = d.getDay();
            if (dow === 0 || dow === 6) {
              weekendC += c;
              weekendN++;
            } else {
              weekdayC += c;
              weekdayN++;
            }
          }

          const totalC = list.reduce((a, s) => a + toCents(s.grandTotal), 0) || 1;
          const ordered = Object.values(buckets).sort((a, b) => b.amtC - a.amtC);

          const lines = [
            `**${T(`Shift & Daypart Breakdown — ${r.label}`, `Benta Bawat Oras / Shift — ${r.label}`)}**`,
            ...ordered.map((b) => `- **${b.label}**: ${P(fromCents(b.amtC))} (${orders(b.n)}, ${((b.amtC / totalC) * 100).toFixed(0)}%)`),
            `- ${T('Weekdays vs Weekends:', 'Weekdays vs Weekends:')} ${P(fromCents(weekdayC))} (${weekdayN}) vs ${P(fromCents(weekendC))} (${weekendN})`,
          ];

          return reply(intent, lines.join('\n'), {
            bars: ordered.map((b) => ({
              label: b.label,
              valueText: `${P(fromCents(b.amtC))} (${Math.round((b.amtC / totalC) * 100)}%)`,
              pct: clampPct((b.amtC / totalC) * 100),
              tone: 'indigo',
            })),
          });
        }

        case 'receipt': {
          const orMatch = /\bOR[-\s]?(\d{6})[-\s]?(\d{1,5})\b/i.exec(rawTrimmed);
          const numMatch = /\b(\d{4,6})\b/.exec(q);
          let found: SaleRecord[] = [];
          if (orMatch) {
            const normalizedTarget = `OR-${orMatch[1]}-${orMatch[2].padStart(4, '0')}`.toUpperCase();
            found = ctx.sales.filter((s) => s.receiptNo.toUpperCase() === normalizedTarget);
          }
          if (!found.length && numMatch) {
            const needle = numMatch[1].toUpperCase();
            found = ctx.sales.filter((s) => s.receiptNo.toUpperCase().includes(needle));
          }
          if (!found.length && ctx.sales.length > 0 && /\b(last|latest|pinakahuli|huling)\b/.test(q)) {
            found = [ctx.sales[ctx.sales.length - 1]];
          }

          if (!found.length) {
            return reply(
              intent,
              T(
                'Tell me a receipt number (e.g. "receipt OR-261117-0001" or "check receipt 0001") to inspect it.',
                'Ilagay ang receipt number (hal. "resibo OR-261117-0001" o "check receipt 0001") para mahanap ko ito.',
              ),
              { actions: [{ type: 'open-sales', label: T('Browse All Receipts', 'Tingnan Lahat ng Resibo') }] },
            );
          }

          const sale = found[0];
          const itemLines = (sale.items || []).slice(0, 5).map((it) => `  - ${qtyTxt(it.qty, it.unit)} × ${it.name} = ${P(it.lineTotal)}`);
          if ((sale.items || []).length > 5) itemLines.push(`  - ...+${sale.items.length - 5} more item(s)`);

          const lines = [
            `**${sale.receiptNo}**${sale.voided ? T(' [VOIDED]', ' [NA-VOID]') : ''} — ${sale.dateFormatted}`,
            `- ${T('Total:', 'Kabuuan:')} **${P(sale.grandTotal)}** (${sale.paymentMethod}${sale.refNo ? `, Ref ${sale.refNo}` : ''})`,
            ...(sale.seniorDiscount > 0 ? [`- SC/PWD Discount: -${P(sale.seniorDiscount)}`] : []),
            ...(sale.wholesaleSavings > 0 ? [`- Wholesale Savings: -${P(sale.wholesaleSavings)}`] : []),
            ...itemLines,
          ];

          return reply(intent, lines.join('\n'), {
            metrics: [
              { label: T('Total', 'Kabuuan'), value: P(sale.grandTotal), tone: sale.voided ? 'rose' : 'emerald' },
              { label: T('Payment', 'Bayad'), value: sale.paymentMethod, tone: 'indigo' },
              { label: T('Items', 'Item'), value: String(sale.items.length), tone: 'neutral' },
            ],
            actions: [{ type: 'open-receipt', label: T(`Open Receipt ${sale.receiptNo}`, `Buksan ang ${sale.receiptNo}`), receiptNo: sale.receiptNo }],
          });
        }

        case 'security': {
          const pinOk = pinIsSet(ctx.settings);
          const strongPin = pinOk && ctx.settings.adminPinAlgo === 'PBKDF2-SHA512';
          const passkeyOn = Boolean(ctx.settings.passkeyCredId);
          const backupDays = calcDaysSinceBackup(ctx.settings, now);
          const auditCount = ctx.securityLog ? ctx.securityLog.length : 0;
          const stockLogCount = ctx.stockLog ? ctx.stockLog.length : 0;

          const lines = [
            `**${T('Security & Data Protection Audit', 'Pagsusuri sa Seguridad at Backup')}**`,
            `- ${T('Manager PIN:', 'Manager PIN:')} ${pinOk ? (strongPin ? T('Active (PBKDF2-SHA512 310k)', 'Aktibo (PBKDF2-SHA512 310k)') : T('Active (will auto-upgrade on next unlock)', 'Aktibo')) : T('Not set yet', 'Hindi pa naka-set')}`,
            `- ${T('Biometric / Passkey:', 'Passkey / Biometric:')} ${passkeyOn ? T('Enrolled', 'Naka-enroll') : T('Not enrolled', 'Hindi pa naka-enroll')}`,
            `- ${T('Last Backup:', 'Huling Backup:')} ${backupDays === null ? T('None recorded yet', 'Wala pang backup') : T(`${backupDays} day(s) ago`, `${backupDays} araw na ang nakalipas`)}`,
            `- ${T('Logs on device:', 'Mga Log sa Device:')} ${auditCount} ${T('security events', 'security log')} · ${stockLogCount} ${T('stock movements', 'galaw sa stock')}`,
          ];

          return reply(intent, lines.join('\n'), {
            metrics: [
              { label: T('Manager PIN', 'Manager PIN'), value: pinOk ? (strongPin ? 'SHA-512' : 'Active') : 'Off', tone: pinOk ? 'emerald' : 'amber' },
              { label: T('Passkey', 'Passkey'), value: passkeyOn ? 'Ready' : 'Off', tone: passkeyOn ? 'emerald' : 'neutral' },
              {
                label: T('Backup Age', 'Edad ng Backup'),
                value: backupDays === null ? 'Never' : `${backupDays}d`,
                tone: backupDays !== null && backupDays <= 7 ? 'emerald' : 'amber',
              },
            ],
            actions: [
              { type: 'open-settings', label: T('Open Security & Vault', 'Buksan ang Security & Vault') },
              ...(stockLogCount > 0 ? [{ type: 'open-stock-log' as const, label: T('View Stock Audit Log', 'Tingnan ang Stock History') }] : []),
            ],
          });
        }

        case 'sales': {
          const r = range(rq, 'today');
          const list = liveSales(r);
          if (!list.length) return reply(intent, T(`No sales recorded for **${r.label}** yet.`, `Wala pang naitalang benta para sa **${r.label}**.`));
          const st = computeSalesStats(list, ctx.products);
          const noCap = profitLastDays(ctx.sales, ctx.products, 30, now.getTime()) === null;
          const out = [
            `**${r.label}**`,
            `- ${T(`Net sales: **${P(st.net)}** from ${orders(st.count)}`, `Netong benta: **${P(st.net)}** mula sa ${orders(st.count)}`)}`,
            `- ${T('Profit: ', 'Tubo: ')}${P(st.profit)}${noCap ? T(' (set capital on items in Stock to compute profit)', ' (lagyan ng puhunan ang mga item sa Stock para makuwenta ang tubo)') : ''}`,
            `- ${T('Average basket: ', 'Karaniwang halaga bawat order: ')}${P(st.net / st.count)}`,
          ];
          if (r.days > 1) out.push(`- ${T('Daily average: ', 'Karaniwan bawat araw: ')}${P(st.net / r.days)}`);
          out.push(
            `- ${T('Items sold: ', 'Naibentang item: ')}${N(st.items)}`,
            `- ${T('Discounts given: ', 'Naibigay na diskwento: ')}${P(st.seniorDisc + st.wholesaleDisc)}`,
          );
          const pay = Object.entries(st.tender)
            .map(([m, v]) => `${m} ${P(v.amt)} (${v.n})`)
            .join(', ');
          if (pay) out.push(`- ${T('Payments: ', 'Paraan ng bayad: ')}${pay}`);
          const top = Object.entries(st.products)
            .sort((a, b) => b[1].amt - a[1].amt)
            .slice(0, 3);
          if (top.length) {
            out.push(
              `- ${T('Top sellers: ', 'Pinakamabenta: ')}${top.map(([n, v]) => `${n} (${qtyTxt(v.qty, v.unit)})`).join('; ')}`,
            );
          }
          const vo = ctx.sales.filter((s) => s.voided && inRange(s, r.from, r.to));
          if (vo.length) out.push(`- ${T('Voided: ', 'Na-void: ')}${vo.length} (${P(sumPeso(vo, (s) => s.grandTotal))})`);

          const marginPct = st.net > 0 ? `${((st.profit / st.net) * 100).toFixed(1)}% margin` : undefined;
          return reply(intent, out.join('\n'), {
            metrics: [
              { label: T('Net Sales', 'Netong Benta'), value: P(st.net), hint: orders(st.count), tone: 'emerald' },
              { label: T('Profit', 'Tubo'), value: P(st.profit), hint: marginPct, tone: 'indigo' },
              { label: T('Avg Basket', 'Avg Basket'), value: P(st.net / st.count), hint: `${N(st.items)} items`, tone: 'neutral' },
            ],
            actions: [{ type: 'open-sales', label: T('Open Sales Dashboard', 'Buksan ang Sales') }],
          });
        }

        case 'payments': {
          const r = range(rq, 'today');
          const list = liveSales(r);
          if (!list.length) return reply(intent, T(`No payments recorded for ${r.label} yet.`, `Wala pang bayad na naitala para sa ${r.label}.`));
          const st = computeSalesStats(list, ctx.products);
          const entries = Object.entries(st.tender).sort((a, b) => b[1].amt - a[1].amt);
          const lines = entries.map(([m, v]) => `- **${m}**: ${P(v.amt)} (${orders(v.n)})`);
          const total = st.net || 1;
          return reply(intent, `**${T('Payments - ', 'Mga Bayad - ')}${r.label}**\n${lines.join('\n')}\n- ${T('Total: ', 'Kabuuan: ')}**${P(st.net)}**`, {
            bars: entries.map(([m, v]) => ({
              label: m,
              valueText: `${P(v.amt)} (${v.n})`,
              pct: clampPct((v.amt / total) * 100),
              tone: m === 'GCash' ? 'indigo' : 'emerald',
            })),
          });
        }

        case 'profit': {
          const r = range(rq, 'today');
          const st = computeSalesStats(liveSales(r), ctx.products);
          const p30 = profitLastDays(ctx.sales, ctx.products, 30, now.getTime());
          const head = T(
            `**Profit - ${r.label}**: **${P(st.profit)}** on sales of ${P(st.net)} (${orders(st.count)}).`,
            `**Tubo - ${r.label}**: **${P(st.profit)}** mula sa benta na ${P(st.net)} (${orders(st.count)}).`,
          );
          if (p30 === null) {
            return reply(intent, head + '\n' + T('Set capital on your items in Stock so profit can be computed.', 'Lagyan ng puhunan ang mga item mo sa Stock para makuwenta ang tubo.'), {
              actions: [{ type: 'open-stock-filter', label: T('Set Missing Capital', 'Lagyan ng Puhunan'), filter: 'NO_CAP' }],
            });
          }
          return reply(intent, head + (r.key === 'month' ? '' : '\n' + T(`Last 30 days: ${P(p30)}.`, `Nakaraang 30 araw: ${P(p30)}.`)), {
            metrics: [
              { label: r.label, value: P(st.profit), hint: st.net > 0 ? `${((st.profit / st.net) * 100).toFixed(1)}% net margin` : undefined, tone: 'emerald' },
              { label: T('30-Day Profit', 'Tubo (30 Araw)'), value: P(p30), tone: 'indigo' },
            ],
          });
        }

        case 'loss': {
          const bad = ctx.products.filter((p) => Number(p.capital) > 0 && (p.retailPrice < Number(p.capital) || (p.wholesalePrice > 0 && p.wholesalePrice < Number(p.capital))));
          if (!bad.length) return reply(intent, T('No items are priced below capital.', 'Walang paninda na mas mababa ang presyo sa puhunan.'));
          return reply(
            intent,
            T(`**Items priced below capital (${bad.length})**\n`, `**Mga panindang lugi o mas mababa sa puhunan (${bad.length})**\n`) +
              bad
                .slice(0, 8)
                .map((p) => `- ${p.name}: ${T('capital', 'puhunan')} ${P(p.capital)} vs retail ${P(p.retailPrice)} / whsle ${P(p.wholesalePrice)}`)
                .join('\n'),
            {
              actions: [{ type: 'open-stock-filter', label: T(`Fix Loss Items (${bad.length})`, `Ayusin ang Lugi (${bad.length})`), filter: 'LOSS' }],
            },
          );
        }

        case 'held': {
          if (!ctx.heldOrders.length) return reply(intent, T('There are no parked/held orders right now.', 'Walang naka-hold o naka-park na order ngayon.'));
          return reply(
            intent,
            T(`**Parked orders (${ctx.heldOrders.length})**\n`, `**Mga naka-hold na order (${ctx.heldOrders.length})**\n`) +
              ctx.heldOrders.slice(0, 6).map((h) => `- ${h.label || h.id} (${h.time}): ${h.items.length} item(s), ${P(h.total)}`).join('\n'),
            {
              actions: [{ type: 'open-held', label: T('Open Parked Orders', 'Buksan ang Naka-Hold') }],
            },
          );
        }

        case 'low': {
          const t = th();
          const out = ctx.products.filter((p) => p.stock <= 0);
          const low = ctx.products.filter((p) => p.stock > 0 && p.stock <= t).sort((a, b) => a.stock - b.stock);
          const lines = [T(`**Stock check** (low = ${t} or less)`, `**Stock check** (mababa = ${t} pababa)`)];
          lines.push(`- ${T('Out of stock: ', 'Ubos na: ')}**${out.length}**${out.length ? ` - ${out.slice(0, 8).map((p) => p.name).join('; ')}${out.length > 8 ? '...' : ''}` : ''}`);
          lines.push(`- ${T('Low stock: ', 'Malapit nang maubos: ')}**${low.length}**${low.length ? ` - ${low.slice(0, 8).map((p) => `${p.name} (${qtyTxt(p.stock, p.unit)})`).join('; ')}${low.length > 8 ? '...' : ''}` : ''}`);
          if (!out.length && !low.length) lines.push(T('Good news: all items have enough stock.', 'Maganda: sapat pa ang stock ng lahat ng item.'));
          const ro = computeReorderList(ctx.products, ctx.sales, ctx.settings, now.getTime());
          if (ro.hasSales && ro.rows.length) {
            lines.push('\n' + T('**Suggested reorder** (based on your recent sales):', '**Mungkahing i-reorder** (batay sa mga benta mo kamakailan):'));
            ro.rows.slice(0, 6).forEach((r) =>
              lines.push(`- ${r.p.name}: ${T('order ', 'umorder ng ')}${r.suggest} ${r.p.unit}${r.cost !== null ? T(` (about ${P(r.cost)})`, ` (mga ${P(r.cost)})`) : ''}`),
            );
            lines.push(T('Open Stock > Reorder for the full list.', 'Buksan ang Stock > Reorder para sa buong listahan.'));
          } else if (!ro.hasSales) {
            lines.push('\n' + T('Reorder amounts appear once you have sales in the last 30 days.', 'Lalabas ang mungkahing dami kapag may benta ka na sa nakaraang 30 araw.'));
          }

          const actions: AssistantAction[] = [{ type: 'open-reorder', label: T('Open Reorder List', 'Buksan ang Reorder') }];
          if (out.length > 0) actions.push({ type: 'open-stock-filter', label: T(`Out of Stock (${out.length})`, `Ubos (${out.length})`), filter: 'OUT' });
          if (low.length > 0) actions.push({ type: 'open-stock-filter', label: T(`Low Stock (${low.length})`, `Mababa (${low.length})`), filter: 'LOW' });

          return reply(intent, lines.join('\n'), {
            metrics: [
              { label: T('Out of Stock', 'Ubos na'), value: String(out.length), tone: out.length > 0 ? 'rose' : 'emerald' },
              { label: T('Low Stock', 'Mababa'), value: String(low.length), tone: low.length > 0 ? 'amber' : 'emerald' },
              { label: T('Suggested Order', 'Mungkahing Order'), value: String(ro.rows.length), tone: 'indigo' },
            ],
            actions,
          });
        }

        case 'expiry': {
          const warnDays = Number(ctx.settings.expiryWarnDays) || 30;
          const rows = ctx.products
            .map((p) => ({ p, e: expiryInfo(p, warnDays, now) }))
            .filter((x) => x.e.status === 'expired' || x.e.status === 'soon')
            .sort((a, b) => (a.e.days ?? 0) - (b.e.days ?? 0));
          if (!rows.length) return reply(intent, T('No items are expired or expiring soon.', 'Walang paso o malapit nang ma-expire na item.'));
          const ex = rows.filter((x) => x.e.status === 'expired');
          const so = rows.filter((x) => x.e.status === 'soon');
          const lines: string[] = [];
          if (ex.length) {
            lines.push(T(`**Expired - pull from shelf (${ex.length})**`, `**Paso na - alisin sa shelf (${ex.length})**`));
            ex.slice(0, 8).forEach((x) => lines.push(`- ${x.p.name} (${x.p.expiry}, stock ${qtyTxt(x.p.stock, x.p.unit)})`));
          }
          if (so.length) {
            lines.push(T(`**Expiring within ${warnDays} days (${so.length})**`, `**Mag-e-expire sa loob ng ${warnDays} araw (${so.length})**`));
            so.slice(0, 8).forEach((x) => lines.push(`- ${x.p.name}: ${T(`${x.e.days} day(s) left, stock `, `${x.e.days} araw na lang, stock `)}${qtyTxt(x.p.stock, x.p.unit)}`));
          }

          const actions: AssistantAction[] = [];
          if (ex.length > 0) actions.push({ type: 'open-stock-filter', label: T(`Pull Expired (${ex.length})`, `Alisin ang Paso (${ex.length})`), filter: 'EXPIRED' });
          if (so.length > 0) actions.push({ type: 'open-stock-filter', label: T(`Expiring Soon (${so.length})`, `Malapit Ma-expire (${so.length})`), filter: 'SOON' });

          return reply(intent, lines.join('\n'), {
            metrics: [
              { label: T('Expired', 'Paso na'), value: String(ex.length), tone: ex.length > 0 ? 'rose' : 'emerald' },
              { label: T('Expiring Soon', 'Malapit na'), value: String(so.length), tone: so.length > 0 ? 'amber' : 'emerald' },
            ],
            actions,
          });
        }

        case 'best': {
          const r = range(rq, '30d');
          const list = liveSales(r);
          if (!list.length) return reply(intent, T(`No sales found for ${r.label} yet.`, `Wala pang benta para sa ${r.label}.`));
          const st = computeSalesStats(list, ctx.products);
          const top = Object.entries(st.products)
            .sort((a, b) => b[1].amt - a[1].amt)
            .slice(0, 7);
          const maxAmt = top[0]?.[1].amt || 1;
          return reply(
            intent,
            `**${T('Best sellers - ', 'Pinakamabenta - ')}${r.label}**\n` +
              top.map(([n, v], i) => `${i + 1}. ${n} - ${qtyTxt(v.qty, v.unit)}, ${P(v.amt)}`).join('\n'),
            {
              bars: top.slice(0, 5).map(([n, v]) => ({
                label: n,
                valueText: `${P(v.amt)} (${qtyTxt(v.qty, v.unit)})`,
                pct: clampPct((v.amt / maxAmt) * 100),
                tone: 'emerald',
              })),
            },
          );
        }

        case 'topprofit': {
          const r = range(rq, '30d');
          const { ranked, unknownCount } = computeProfitRanking(liveSales(r), ctx.products);
          if (!ranked.length) {
            return reply(
              intent,
              T(
                `No profit data for ${r.label}. Add capital to your items in Stock and make some sales.`,
                `Wala pang datos ng tubo para sa ${r.label}. Lagyan ng puhunan ang mga item sa Stock at magbenta muna.`,
              ),
              { actions: [{ type: 'open-stock-filter', label: T('Set Missing Capital', 'Lagyan ng Puhunan'), filter: 'NO_CAP' }] },
            );
          }
          const topP = ranked.slice(0, 7);
          const maxPr = Math.max(1, topP[0]?.profit || 1);
          return reply(
            intent,
            `**${T('Top profit items - ', 'Pinakamalaking tubo - ')}${r.label}**\n` +
              topP.map((x, i) => `${i + 1}. [${x.cls}] ${x.name} - ${T('profit ', 'tubo ')}${P(x.profit)}`).join('\n') +
              (unknownCount
                ? '\n' + T(`(${unknownCount} sold item(s) have no capital and are not ranked)`, `(${unknownCount} item na naibenta ay walang puhunan kaya hindi isinama)`)
                : ''),
            {
              bars: topP.slice(0, 5).map((x) => ({
                label: `[${x.cls}] ${x.name}`,
                valueText: P(x.profit),
                pct: clampPct((x.profit / maxPr) * 100),
                tone: x.cls === 'A' ? 'emerald' : 'indigo',
              })),
            },
          );
        }

        case 'void': {
          const r = range(rq, 'today');
          const vo = ctx.sales.filter((s) => s.voided && inRange(s, r.from, r.to));
          if (!vo.length) return reply(intent, T(`No voided sales for ${r.label}.`, `Walang na-void na benta para sa ${r.label}.`));
          return reply(
            intent,
            `**${T('Voided - ', 'Na-void - ')}${r.label}**: ${T(`${vo.length} sale(s), `, `${vo.length} benta, `)}${P(sumPeso(vo, (s) => s.grandTotal))}\n` +
              vo.slice(0, 6).map((s) => `- ${s.receiptNo} ${P(s.grandTotal)}${s.voidReason ? ` (${s.voidReason})` : ''}`).join('\n'),
            {
              actions: [
                { type: 'open-receipt', label: T(`Inspect ${vo[0].receiptNo}`, `Buksan ${vo[0].receiptNo}`), receiptNo: vo[0].receiptNo },
                { type: 'open-sales', label: T('Open Sales Audit', 'Buksan ang Sales') },
              ],
            },
          );
        }

        case 'inventory': {
          const t = th();
          const val = sumPeso(ctx.products, (p) => lineTotalPeso(p.retailPrice, p.stock));
          const cap = sumPeso(ctx.products, (p) => (Number(p.capital) > 0 ? round2(Number(p.capital) * p.stock) : 0));
          const noCap = ctx.products.filter((p) => !(Number(p.capital) > 0)).length;
          const nOut = ctx.products.filter((p) => p.stock <= 0).length;
          const nLow = ctx.products.filter((p) => p.stock > 0 && p.stock <= t).length;
          return reply(
            intent,
            T(
              `**Inventory**\n- Products: ${ctx.products.length}\n- Stock retail value: ${P(val)}\n- Capital in stock: ${P(cap)}${noCap ? ` (${noCap} item(s) have no capital)` : ''}\n- Out of stock: ${nOut}\n- Low stock (${t} or less): ${nLow}`,
              `**Imbentaryo**\n- Bilang ng produkto: ${ctx.products.length}\n- Halaga ng stock (presyong tingi): ${P(val)}\n- Puhunan sa stock: ${P(cap)}${noCap ? ` (${noCap} item ang walang puhunan)` : ''}\n- Ubos na: ${nOut}\n- Malapit nang maubos (${t} pababa): ${nLow}`,
            ),
            {
              metrics: [
                { label: T('Total SKUs', 'Mga SKU'), value: String(ctx.products.length), tone: 'neutral' },
                { label: T('Retail Value', 'Presyong Tingi'), value: P(val), tone: 'emerald' },
                { label: T('Capital Value', 'Puhunan'), value: P(cap), tone: 'indigo' },
              ],
              actions: [
                { type: 'open-csv-import', label: T('CSV Import', 'Mag-import ng CSV') },
                { type: 'open-stock-log', label: T('Stock Audit Log', 'Kasaysayan ng Stock') },
              ],
            },
          );
        }

        case 'slow': {
          const r = range('30 days', '30d');
          const list = liveSales(r);
          const slow = ctx.products
            .filter((p) => p.stock > 0 && this.itemSales(list, p).qty === 0)
            .sort((a, b) => b.stock * (Number(b.capital) || b.retailPrice) - a.stock * (Number(a.capital) || a.retailPrice));
          if (!slow.length) return reply(intent, T('Every item with stock sold at least once in the last 30 days.', 'Lahat ng may stock ay nabenta na kahit minsan sa nakaraang 30 araw.'));
          return reply(
            intent,
            T(`**Slow movers - no sales in 30 days (${slow.length})**\n`, `**Mga hindi nabebenta - walang benta sa 30 araw (${slow.length})**\n`) +
              slow
                .slice(0, 8)
                .map(
                  (p) =>
                    `- ${p.name}: ${T(
                      `${qtyTxt(p.stock, p.unit)} on hand (${P(round2(p.stock * (Number(p.capital) > 0 ? Number(p.capital) : p.retailPrice)))} tied up)`,
                      `${qtyTxt(p.stock, p.unit)} ang stock (${P(round2(p.stock * (Number(p.capital) > 0 ? Number(p.capital) : p.retailPrice)))} ang nakatengga)`,
                    )}`,
                )
                .join('\n') +
              (slow.length > 8 ? `\n${T(`...and ${slow.length - 8} more`, `...at ${slow.length - 8} pa`)}` : ''),
            {
              actions: [{ type: 'open-stock-filter', label: T(`View Dead Stock (${slow.length})`, `Tingnan ang Hindi Mabenta (${slow.length})`), filter: 'DEAD' }],
            },
          );
        }

        case 'peak': {
          const r = range(rq, '30d');
          const st = computeSalesStats(liveSales(r), ctx.products);
          const hrs = Object.entries(st.hours)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
          if (!hrs.length) return reply(intent, T(`No sales for ${r.label} yet.`, `Wala pang benta para sa ${r.label}.`));
          const lab = (h: string) => {
            const n = Number(h);
            return (n % 12 || 12) + (n < 12 ? ' AM' : ' PM');
          };
          const maxH = hrs[0][1] || 1;
          return reply(
            intent,
            `**${T('Busiest hours - ', 'Pinaka-busy na oras - ')}${r.label}**\n` + hrs.slice(0, 3).map(([h, v], i) => `${i + 1}. ${lab(h)} - ${P(v)}`).join('\n'),
            {
              bars: hrs.slice(0, 4).map(([h, v]) => ({
                label: lab(h),
                valueText: P(v),
                pct: clampPct((v / maxH) * 100),
                tone: 'indigo',
              })),
            },
          );
        }

        case 'compare': {
          const t = startOfDay(now);
          const tom = new Date(t.getTime() + DAY_MS);
          const y = new Date(t.getTime() - DAY_MS);
          const a = computeSalesStats(liveSales({ from: t, to: tom }), ctx.products);
          const b = computeSalesStats(liveSales({ from: y, to: t }), ctx.products);
          const ch = (x: number, z: number) => (z > 0 ? `${x - z >= 0 ? '▲ ' : '▼ '}${Math.abs(((x - z) / z) * 100).toFixed(1)}%` : 'n/a');
          return reply(
            intent,
            T(
              `**Today vs Yesterday**\n- Net sales: ${P(a.net)} vs ${P(b.net)} (${ch(a.net, b.net)})\n- Orders: ${a.count} vs ${b.count}\n- Profit: ${P(a.profit)} vs ${P(b.profit)}`,
              `**Ngayon vs Kahapon**\n- Netong benta: ${P(a.net)} vs ${P(b.net)} (${ch(a.net, b.net)})\n- Bilang ng order: ${a.count} vs ${b.count}\n- Tubo: ${P(a.profit)} vs ${P(b.profit)}`,
            ),
            {
              metrics: [
                { label: T('Today Net', 'Ngayon'), value: P(a.net), hint: `${a.count} orders`, tone: a.net >= b.net ? 'emerald' : 'amber' },
                { label: T('Yesterday Net', 'Kahapon'), value: P(b.net), hint: `${b.count} orders`, tone: 'neutral' },
                { label: T('Delta', 'Pagkakaiba'), value: ch(a.net, b.net), tone: a.net >= b.net ? 'emerald' : 'rose' },
              ],
            },
          );
        }

        case 'psales': {
          this.lastProducts = ms;
          const r = range(rq, 'today');
          const list = liveSales(r);
          return reply(
            intent,
            `**${r.label}**\n` +
              ms
                .slice(0, 4)
                .map((p) => {
                  const x = this.itemSales(list, p);
                  return `- ${p.name}: ${T('sold ', 'nabenta ')}${qtyTxt(x.qty, p.unit)} (${P(x.amt)}), ${T('stock left ', 'natira ')}${qtyTxt(p.stock, p.unit)}`;
                })
                .join('\n'),
          );
        }

        case 'product': {
          this.lastProducts = ms;
          const warnDays = Number(ctx.settings.expiryWarnDays) || 30;
          const vel = computeProductVelocities(ctx.products, ctx.sales, now.getTime());
          const body = ms
            .map((p) => {
              const e = expiryInfo(p, warnDays, now);
              const v = vel.byId.get(p.id);
              const parts = [
                `**${p.name}**`,
                `- ${T('Price: ', 'Presyo: ')}${P(p.retailPrice)}/${p.unit}${p.wholesalePrice < p.retailPrice ? T(` (wholesale ${P(p.wholesalePrice)} at ${p.wholesaleMinQty}+)`, ` (wholesale ${P(p.wholesalePrice)} kapag ${p.wholesaleMinQty}+)`) : ''}`,
                `- Stock: ${qtyTxt(p.stock, p.unit)}${p.stock <= 0 ? T(' (OUT)', ' (UBOS NA)') : p.stock <= th() ? T(' (low)', ' (mababa na)') : ''}${v && v.daysOfCover !== null ? ` · ~${v.daysOfCover.toFixed(1)}d cover (${v.avgDaily.toFixed(1)}/d)` : ''}`,
              ];
              if (Number(p.capital) > 0 && p.retailPrice > 0) {
                parts.push(`- ${T('Capital: ', 'Puhunan: ')}${P(p.capital)}, margin ${(((p.retailPrice - Number(p.capital)) / p.retailPrice) * 100).toFixed(1)}%`);
              }
              if (p.expiry) {
                parts.push(`- Expiry: ${p.expiry}${e.status === 'expired' ? T(' (EXPIRED)', ' (PASO NA)') : e.status === 'soon' ? T(` (${e.days} day(s) left)`, ` (${e.days} araw na lang)`) : ''}`);
              }
              return parts.join('\n');
            })
            .join('\n\n');
          const totalMatched = (ms as Product[] & { total?: number }).total || ms.length;
          const fuzzy = (ms as Product[] & { fuzzy?: boolean }).fuzzy;
          const more =
            totalMatched > ms.length
              ? `\n\n${T(`...and ${totalMatched - ms.length} more match(es). Add more of the name to narrow it down.`, `...at ${totalMatched - ms.length} pang tugma. Dagdagan ang pangalan para mapaliit.`)}`
              : '';
          const near = fuzzy ? T('Closest match:\n', 'Pinakamalapit na tugma:\n') : '';

          const topProd = ms[0];
          const productActions: AssistantAction[] = [];
          if (topProd) {
            const topExp = expiryInfo(topProd, warnDays, now);
            if (topProd.stock > 0 && topExp.status !== 'expired' && topProd.unit !== 'kg') {
              productActions.push({
                type: 'add-to-cart',
                label: T(`Add 1 ${topProd.name.split(' ')[0]} to Cart`, `Ilagay 1 sa Cart`),
                productId: topProd.id,
                qty: 1,
              });
            }
            productActions.push({
              type: 'find-product-stock',
              label: T('Inspect in Stock', 'Tingnan sa Stock'),
              query: topProd.barcode || topProd.name,
            });
          }

          return reply(intent, near + body + more, productActions.length ? { actions: productActions } : undefined);
        }

        default:
          return reply('', helpText());
      }
    };

    if (this.lastIntent && RANGE_AWARE.has(this.lastIntent) && this.isRangeOnly(q)) {
      return run(this.lastIntent, q, this.lastProducts);
    }

    // New high-signal intents prioritized carefully
    if (/\bOR[-\s]?\d{6}[-\s]?\d{1,5}\b/i.test(rawTrimmed) || /\b(receipt|resibo)\b/.test(q)) {
      return run('receipt', q);
    }
    if (/\b(closing|eod|end of day|x ?read|z ?read|cash count|cash drawer|reconcil\w*|remittance)\b|sarado na|pagsasara|bilang.*cash|cash sa kaha/.test(q)) {
      return run('closing', q);
    }
    if (/\b(briefing|digest|health score|store health|overall health|executive summary)\b|kamusta ang tindahan|kumusta ang tindahan|kalagayan ng tindahan/.test(q)) {
      return run('briefing', q);
    }
    if (/\b(forecast|predict|prediction|stockout|run out|days of cover|cover left|kelan mauubos|kailan mauubos|mauubos|gaano katagal)\b/.test(q)) {
      return run('forecast', q);
    }
    if (/\b(bundle|bundles|combo|combos|frequently bought|bought together|affinity|pair|pairs|pairing|cross sell)\b|magkasama|kasabay/.test(q)) {
      return run('bundles', q);
    }
    if (/\b(cart|basket|check cart|wholesale check|sc check)\b|suriin ang cart/.test(q)) {
      return run('cart', q);
    }
    if (/\b(daypart|shift|shifts|morning|afternoon|evening|weekday|weekdays|weekend|weekends)\b|umaga vs|umaga hapon gabi/.test(q)) {
      return run('daypart', q);
    }
    if (/\b(security|pin|passkey|backup|vault|audit log)\b|seguridad|kaligtasan/.test(q)) {
      return run('security', q);
    }
    if (/\b(margin audit|margins|thin margin|high margin|pricing audit|price audit|markup)\b|suriin ang tubo/.test(q)) {
      return run('margins', q);
    }

    // Specific category name query when category keyword is used or exact category name matched
    const allCategories = Array.from(new Set(ctx.products.map((p) => p.category).filter(Boolean)));
    const matchedCat = allCategories.find((c) => q.includes(c.toLowerCase()));
    if (/\b(category|categories|department|kategorya)\b/.test(q) || (matchedCat && /\b(sales|benta|share|breakdown|revenue)\b/.test(q))) {
      return run('category', q, [], matchedCat || '');
    }

    if (/\b(compare|vs|versus|kumpara|ikumpara|ihambing|hambing)\b/.test(q)) return run('compare', q);
    if (/slow ?mov|dead stock|not selling|unsold|stagnant|hindi (na)?(be)?benta|hindi (na)?mabenta|di (na)?(be)?benta|di (na)?mabenta|walang benta|nakatengga|tengga/.test(q)) {
      return run('slow', q);
    }
    if (/\b(busiest|peak|rush|pinaka ?(busy|matao)|anong oras|what time|saang oras|oras ng benta|busy hours?)\b/.test(q)) {
      return run('peak', q);
    }
    if (/\b(held|parked|on hold)\b|naka ?hold|naka ?park/.test(q)) return run('held', q);
    if (/\b(below capital|losing|loss)\b|lugi|mas mababa sa puhunan/.test(q)) return run('loss', q);

    const ms = this.findProducts(q, ctx.products);
    if (ms.length && /\bsold\b|nabenta|sales of|benta ng|benta ni|\bbenta sa\b|how many.*sold|ilan.*nabenta/.test(q)) {
      return run('psales', q, ms);
    }
    if (ms.length && this.lastIntent === 'psales' && ms.toks.length <= 2 && q.split(' ').length <= 4) {
      return run('psales', `${this.lastQ} ${q}`, ms);
    }

    const asksProduct =
      /\b(price|magkano|how much|presyo|stock|ilan|ilang|meron|mayroon|available|how many|barcode|margin|capital|puhunan|natira|left|quantity|cost|wholesale|bulk|hm|gaano karami|may stock|ubos|naubos|wala na|out of stock|sold out)\b|expir/.test(
        q,
      );
    const asksReport = /low stock|restock|re ?order|paubos|maubos|run(ning)? out/.test(q);
    if (ms.length && asksProduct && !asksReport) return run('product', q, ms);

    if (/\bexpir|\bvence\b|paso na|pasado na|best before|expiration/.test(q)) return run('expiry', q);
    if (
      /restock|re ?order|paubos|maubos|\bubos\b|kulang|low stock|\blow\b|out of stock|wala na|run(ning)? out|bilhin|bibilhin|mag ?order|order (more|ko)|kailangan (kong |ko )?(bilhin|restock|dagdagan)|dagdagan/.test(
        q,
      )
    ) {
      return run('low', q);
    }
    if (/\b(top|best|pinaka\w*|rank|biggest|pinakamalaking)\b.*\b(profit|kita|tubo)\b|\b(profit|kita|tubo)\b.*\b(item|items|product|products|top|rank|abc)\b/.test(q)) {
      return run('topprofit', q);
    }
    if (/\btop\b|best ?sell|pinaka ?(mabenta|malakas)|\bmabenta\b|\bmalakas\b|popular|fast ?moving|hot items/.test(q)) {
      return run('best', q);
    }
    if (/\bvoid|\bvoided\b|cancel/.test(q)) return run('void', q);
    if (/inventory|stock value|capital in|how many (products|items|skus?)|ilang (produkto|item|paninda)|imbentaryo|halaga ng (stock|paninda)|total (products|items)|paninda/.test(q)) {
      return run('inventory', q);
    }
    if (/\b(gcash|maya|cash|card|payment|payments|bayad)\b/.test(q) && !/\bsales\b|\bbenta\b/.test(q)) return run('payments', q);
    if (/\b(profit|tubo|margin)\b/.test(q)) return run('profit', q);
    if (/\b(sale|sales|benta|revenue|income|kita|kinita|kumita|earn|earned|orders?|transactions?|customers?|mamimili|gcash|payment|payments|bayad|total|nakuha)\b|how much did i (make|earn)/.test(q)) {
      return run('sales', q);
    }
    if (ms.length) return run('product', q, ms);
    if (matchedCat) return run('category', q, [], matchedCat);
    if (/^(stock|inventory)$/.test(q)) return run('inventory', q);

    if (asksProduct && ms.toks.length) {
      const what = q.split(' ').filter((w) => w.length >= 3 && !STOP.has(w)).slice(0, 3).join(' ') || ms.toks.slice(0, 3).join(' ');
      return reply(
        '',
        T(
          `I couldn't find a product matching "${what}". Check the spelling, or try part of the name or the barcode.\n\nYou can also ask for a store briefing, stockout forecast, or expiring items.`,
          `Hindi ko makita ang produktong "${what}". Tingnan ang spelling, o subukan ang bahagi ng pangalan o ang barcode.\n\nPuwede mo ring itanong ang kalagayan ng tindahan, kelan mauubos ang stock, o malapit nang ma-expire.`,
        ),
      );
    }
    return reply('', T("I didn't quite get that.\n\n", 'Hindi ko po masyadong naintindihan iyon.\n\n') + helpText());
  }

  private detectLang(tokens: string[], prev: AssistantLang): AssistantLang {
    if (tokens.some((t) => TL_WORDS.has(t))) return 'tl';
    if (tokens.some((t) => EN_WORDS.has(t))) return 'en';
    return prev;
  }

  private prep(text: string, products: Product[]): string {
    const q = String(text || '')
      .toLowerCase()
      .replace(/['’`]s\b/g, '')
      .replace(/['’`]/g, '')
      .replace(/[-_/]+/g, ' ')
      .replace(/[^a-z0-9ñ\s]/g, ' ');
    let toks = q
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => SLANG[t] || t);
    const known = new Set(VOCAB);
    products.forEach((p) =>
      `${p.name} ${p.category}`
        .toLowerCase()
        .split(/[^a-z0-9ñ]+/)
        .filter((x) => x.length >= 3)
        .forEach((w) => known.add(w)),
    );
    toks = toks.map((t) => {
      if (t.length < 5 || known.has(t) || STOP.has(t) || TL_WORDS.has(t) || EN_WORDS.has(t) || /\d/.test(t)) return t;
      const lim = t.length >= 8 ? 2 : 1;
      for (const v of VOCAB) {
        if (Math.abs(v.length - t.length) <= lim && lev(t, v) <= lim) return v;
      }
      return t;
    });
    return toks.join(' ');
  }

  private isRangeOnly(q: string): boolean {
    return (
      !!q &&
      /(yesterday|kahapon|kagabi|today|ngayon|ngayong|week|linggo|lingo|month|buwan|\d+ ?(days?|araw)|all time|overall)/.test(q) &&
      q.replace(RANGE_ONLY, ' ').trim() === ''
    );
  }

  private smallTalk(q: string, toks: string[], T: (en: string, tl: string) => string): string | null {
    const rest = toks.filter((t) => !/^(po|opo|ka|mo|na|ba|lang|naman|ikaw|you|there|all|kayo|team|boss|sir|maam|ma|am|assistant|bot|ai)$/.test(t));
    if (
      /^(hi|hello|hey|hoy|uy|yo|kumusta|kamusta|musta|good (morning|afternoon|evening)|magandang (umaga|hapon|gabi|tanghali)|how are you|kumusta ka|kamusta ka)$/.test(
        rest.join(' '),
      ) ||
      (rest.length <= 2 && /^(hi|hello|hey|hoy|uy|yo|kumusta|kamusta|musta)\b/.test(rest.join(' ')))
    ) {
      return T(
        'Hello! Ready to help. Ask for a Store Briefing, Stockout Forecast, Sales, Expiring Items, or any product price.',
        'Kumusta po! Handa akong tumulong. Itanong ang Kalagayan ng Tindahan, Kelan Mauubos ang Stock, Benta, o presyo ng kahit anong paninda.',
      );
    }
    if (/\b(thanks|thank you|salamat|maraming salamat|appreciate)\b/.test(q) && rest.length <= 4) {
      return T("You're welcome! Ask me anytime.", 'Walang anuman po! Tanong ka lang kahit kailan.');
    }
    if (/^(ok|okay|sige|noted|got it|cge|oo|opo|alright|cool|nice|great|ayos|sige po)$/.test(rest.join(' '))) {
      return T('Okay! Let me know if you need anything else.', 'Sige po! Sabihin mo lang kung may kailangan ka pa.');
    }
    if (/^(bye|goodbye|paalam|babay|ingat)$/.test(rest.join(' '))) {
      return T('Bye! Good luck with sales today.', 'Paalam po! Sana maraming benta ngayon.');
    }
    return null;
  }

  private findProducts(q0: string, products: Product[]): Product[] & { total: number; toks: string[]; fuzzy: boolean } {
    let q = q0;
    ALIAS.forEach(([re, to]) => {
      q = q.replace(re, to);
    });
    const toks = q
      .split(/[^a-z0-9ñ]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
    const empty = Object.assign([] as Product[], { toks, total: 0, fuzzy: false });
    if (!toks.length) return empty;

    const scored = products
      .map((p) => {
        const hay = `${p.name} ${p.category} ${p.barcode}`.toLowerCase();
        const words = `${p.name} ${p.category}`.toLowerCase().split(/[^a-z0-9ñ]+/).filter((x) => x.length >= 3);
        const flat = p.name.toLowerCase().replace(/[^a-z0-9ñ]/g, '');
        let hit = 0;
        for (const t of toks) {
          if (hay.includes(t) || flat.includes(t)) {
            hit += 1;
          } else if (t.length >= 4 && words.some((w) => Math.abs(w.length - t.length) <= 2 && lev(t, w) <= (t.length >= 7 ? 2 : 1))) {
            hit += 0.8;
          }
        }
        return { p, hit };
      })
      .filter((x) => x.hit > 0)
      .sort((a, b) => b.hit - a.hit);

    if (!scored.length) return empty;
    const best = scored[0].hit;
    const all = scored.filter((x) => x.hit === best);
    return Object.assign(all.slice(0, 5).map((x) => x.p), {
      total: all.length,
      toks,
      fuzzy: best % 1 !== 0,
    });
  }

  private itemSales(list: SaleRecord[], p: Product) {
    let qty = 0;
    let amt = 0;
    list.forEach((s) =>
      (s.items || []).forEach((it) => {
        if ((it.productId && it.productId === p.id) || it.name === p.name) {
          qty += Number(it.qty) || 0;
          amt += Number(it.lineTotal) || 0;
        }
      }),
    );
    return { qty, amt };
  }
}
