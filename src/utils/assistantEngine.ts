import type { HeldOrder, Product, SaleRecord, StoreSettings } from '../types';
import {
  computeProfitRanking,
  computeReorderList,
  computeSalesStats,
  DAY_MS,
  expiryInfo,
  formatPeso,
  inRange,
  lineTotalPeso,
  profitLastDays,
  round2,
  startOfDay,
  sumPeso,
} from './posMath';

type Lang = 'en' | 'tl';

export interface AssistantContext {
  products: Product[];
  sales: SaleRecord[];
  heldOrders: HeldOrder[];
  settings: StoreSettings;
  now?: Date;
}

export interface AssistantReply {
  text: string;
  lang: Lang;
  intent: string;
  chips: string[];
}

const CHIPS: Record<Lang, string[]> = {
  en: ["Today's sales", 'What should I restock?', 'Expiring items', 'Slow moving items', 'Best sellers', 'Busiest hours'],
  tl: ['Benta ngayon', 'Ano ang dapat i-restock?', 'Malapit nang ma-expire', 'Mga hindi mabenta', 'Pinakamabenta', 'Pinaka-busy na oras'],
};

const CHIPMAP: Record<string, Record<Lang, string[]>> = {
  sales: { en: ['Yesterday', 'Last 7 days', 'Compare today vs yesterday', 'Best sellers'], tl: ['Kahapon', 'Nakaraang 7 araw', 'Ikumpara ang ngayon at kahapon', 'Pinakamabenta'] },
  best: { en: ['Top profit items', 'Slow moving items', 'Busiest hours'], tl: ['Pinakamalaking tubo', 'Mga hindi mabenta', 'Pinaka-busy na oras'] },
  topprofit: { en: ['Best sellers', 'Profit this month'], tl: ['Pinakamabenta', 'Tubo ngayong buwan'] },
  profit: { en: ['Yesterday', 'This month', 'Top profit items'], tl: ['Kahapon', 'Ngayong buwan', 'Pinakamalaking tubo'] },
  low: { en: ['Expiring items', 'Slow moving items', 'Inventory value'], tl: ['Malapit nang ma-expire', 'Mga hindi mabenta', 'Halaga ng imbentaryo'] },
  expiry: { en: ['What should I restock?', 'Slow moving items'], tl: ['Ano ang dapat i-restock?', 'Mga hindi mabenta'] },
  slow: { en: ['Best sellers', 'What should I restock?'], tl: ['Pinakamabenta', 'Ano ang dapat i-restock?'] },
  peak: { en: ['Yesterday', 'Last 7 days', 'Best sellers'], tl: ['Kahapon', 'Nakaraang 7 araw', 'Pinakamabenta'] },
  void: { en: ['Voided last 7 days', "Today's sales"], tl: ['Na-void nakaraang 7 araw', 'Benta ngayon'] },
  payments: { en: ["Today's sales", 'Last 7 days', 'Best sellers'], tl: ['Benta ngayon', 'Nakaraang 7 araw', 'Pinakamabenta'] },
  loss: { en: ['Top profit items', 'Inventory value'], tl: ['Pinakamalaking tubo', 'Halaga ng imbentaryo'] },
  held: { en: ["Today's sales", 'What should I restock?'], tl: ['Benta ngayon', 'Ano ang dapat i-restock?'] },
};

const TL_WORDS = new Set(
  (
    'ano anong magkano ilan ilang meron mayroon po opo ang ng mga yung ung kahapon kagabi ngayon ngayong kanina linggo lingo buwan benta nabenta mabenta ' +
    'pinakamabenta pinaka pinakamalaking kita kinita kumita tubo paubos ubos maubos kulang wala naman lang kumusta kamusta musta salamat paki pakitingnan tingnan tignan sabihin ipakita ' +
    'gusto presyo natira puhunan hindi di mo ko namin natin kami sino saan kailan bakit paano pwede puwede sige oo araw paso nakaraang nakaraan nakalipas mamimili suki bayad dagdag ' +
    'listahan dapat kailangan tulong magandang umaga hapon gabi ba pa na sa malapit nang imbentaryo paninda halaga ikumpara kumpara tingi hanap hanapin pila gaano karami lugi'
  ).split(' '),
);

const EN_WORDS = new Set(
  (
    'the what how show sales sale price stock today yesterday please my our items item week month best top low expiring expired restock reorder profit inventory ' +
    'sold many much are is any list tell give hello help thanks thank you voided busiest slow moving compare last days day this and about payment payments loss losing held parked'
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
};

const VOCAB = [
  'yesterday', 'restock', 'reorder', 'expiring', 'expired', 'expire', 'expiry', 'profit', 'inventory', 'voided',
  'compare', 'busiest', 'popular', 'magkano', 'kahapon', 'ngayon', 'ngayong', 'linggo', 'presyo', 'natira',
  'puhunan', 'nabenta', 'mabenta', 'sales', 'price', 'stock', 'month', 'items', 'capital', 'margin', 'sellers',
  'selling', 'transactions', 'customers', 'revenue', 'payments', 'paubos', 'maubos', 'imbentaryo', 'paninda',
  'kinita', 'kumita', 'today', 'week', 'barcode', 'wholesale', 'gcash', 'maya', 'parked', 'held',
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
];

const RANGE_ONLY = /\b(yesterday|kahapon|kagabi|today|ngayon|ngayong|kanina|araw|nitong|week|linggo|lingo|month|buwan|days?|last|this|nakaraang|nakaraan|nakalipas|all time|overall|lahat|and|then|how about|what about|eh|e|paano|kumusta|kamusta|naman|na|po|ba|kaya|ano|ang|sa|ng|yung|ung|\d+)\b/g;
const RANGE_AWARE = new Set(['sales', 'profit', 'best', 'topprofit', 'void', 'peak', 'psales', 'payments']);

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

export class OfflineAssistant {
  private lang: Lang = 'en';
  private lastIntent = '';
  private lastProducts: Product[] = [];
  private lastQ = '';

  reset(lang: Lang = 'en'): AssistantReply {
    this.lang = lang;
    this.lastIntent = '';
    this.lastProducts = [];
    this.lastQ = '';
    return {
      text:
        'Hi! I\'m your OmniMart assistant. I can check your sales, low and expiring stock, margins, payments, and product prices from your own data. I only read it and never change anything, and I work offline.\n\nTanong ka lang in English o Tagalog, halimbawa: "benta ngayon" o "magkano ang Milo?"',
      lang: this.lang,
      intent: '',
      chips: CHIPS[this.lang],
    };
  }

  ask(text: string, ctx: AssistantContext): AssistantReply {
    const q = this.prep(text, ctx.products);
    const toks = q.split(' ').filter(Boolean);
    this.lang = this.detectLang(toks, this.lang);

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
        'I can answer from your own POS data. Try:\n- "Sales today" / "sales last 7 days" / "benta kahapon"\n- "What should I restock?" / "low stock"\n- "Expiring items" / "items below capital"\n- "Best sellers" / "Top profit items"\n- "Price of Coke" / "magkano ang Milo" / "stock of rice"\n- "Profit this month" / "payments today" / "held orders"\n- "Compare today vs yesterday" / "slow moving items" / "busiest hours"\n- Then just say "yesterday?" or "last 7 days?" to continue',
        'Masasagot ko ito gamit ang sarili mong POS data. Subukan:\n- "Benta ngayon" / "benta kahapon" / "benta nitong linggo"\n- "Ano ang dapat i-restock?" / "paubos na stock"\n- "Malapit nang ma-expire" / "mga luging paninda"\n- "Pinakamabenta" / "Pinakamalaking tubo"\n- "Magkano ang Milo?" / "ilan pa ang stock ng bigas?" / "presyo ng Coke"\n- "Tubo ngayong buwan" / "bayad ngayon" / "parked orders"\n- "Ikumpara ang ngayon at kahapon" / "mga hindi mabenta" / "anong oras pinaka-busy"\n- Pagkatapos puwede mong itanong ang "kahapon?" o "nakaraang 7 araw?" para magpatuloy',
      );

    const reply = (intent: string, replyText: string): AssistantReply => {
      if (intent) this.lastIntent = intent;
      const m = CHIPMAP[this.lastIntent];
      return {
        text: replyText,
        lang: this.lang,
        intent: this.lastIntent,
        chips: (m ? m[this.lang] : null) || CHIPS[this.lang],
      };
    };

    if (!q) return reply('', helpText());

    const stMsg = this.smallTalk(q, toks, T);
    if (stMsg) return reply('', stMsg);
    if (/\b(help|menu|tulong|tulungan|what can you do|ano kaya mo|ano ang kaya mo|ano ang magagawa mo|paano gamitin)\b/.test(q)) {
      return reply('', helpText());
    }

    const run = (intent: string, rq: string, ms: Product[] = []): AssistantReply => {
      this.lastIntent = intent;
      this.lastQ = rq;
      switch (intent) {
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
          return reply(intent, out.join('\n'));
        }
        case 'payments': {
          const r = range(rq, 'today');
          const list = liveSales(r);
          if (!list.length) return reply(intent, T(`No payments recorded for ${r.label} yet.`, `Wala pang bayad na naitala para sa ${r.label}.`));
          const st = computeSalesStats(list, ctx.products);
          const lines = Object.entries(st.tender).map(([m, v]) => `- **${m}**: ${P(v.amt)} (${orders(v.n)})`);
          return reply(intent, `**${T('Payments - ', 'Mga Bayad - ')}${r.label}**\n${lines.join('\n')}\n- ${T('Total: ', 'Kabuuan: ')}**${P(st.net)}**`);
        }
        case 'profit': {
          const r = range(rq, 'today');
          const st = computeSalesStats(liveSales(r), ctx.products);
          const p30 = profitLastDays(ctx.sales, ctx.products, 30, now.getTime());
          const head = T(
            `**Profit - ${r.label}**: **${P(st.profit)}** on sales of ${P(st.net)} (${orders(st.count)}).`,
            `**Tubo - ${r.label}**: **${P(st.profit)}** mula sa benta na ${P(st.net)} (${orders(st.count)}).`,
          );
          if (p30 === null) return reply(intent, head + '\n' + T('Set capital on your items in Stock so profit can be computed.', 'Lagyan ng puhunan ang mga item mo sa Stock para makuwenta ang tubo.'));
          return reply(intent, head + (r.key === 'month' ? '' : '\n' + T(`Last 30 days: ${P(p30)}.`, `Nakaraang 30 araw: ${P(p30)}.`)));
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
          );
        }
        case 'held': {
          if (!ctx.heldOrders.length) return reply(intent, T('There are no parked/held orders right now.', 'Walang naka-hold o naka-park na order ngayon.'));
          return reply(
            intent,
            T(`**Parked orders (${ctx.heldOrders.length})**\n`, `**Mga naka-hold na order (${ctx.heldOrders.length})**\n`) +
              ctx.heldOrders.slice(0, 6).map((h) => `- ${h.label || h.id} (${h.time}): ${h.items.length} item(s), ${P(h.total)}`).join('\n'),
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
          return reply(intent, lines.join('\n'));
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
          return reply(intent, lines.join('\n'));
        }
        case 'best': {
          const r = range(rq, '30d');
          const list = liveSales(r);
          if (!list.length) return reply(intent, T(`No sales found for ${r.label} yet.`, `Wala pang benta para sa ${r.label}.`));
          const st = computeSalesStats(list, ctx.products);
          const top = Object.entries(st.products)
            .sort((a, b) => b[1].amt - a[1].amt)
            .slice(0, 7);
          return reply(
            intent,
            `**${T('Best sellers - ', 'Pinakamabenta - ')}${r.label}**\n` +
              top.map(([n, v], i) => `${i + 1}. ${n} - ${qtyTxt(v.qty, v.unit)}, ${P(v.amt)}`).join('\n'),
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
            );
          }
          return reply(
            intent,
            `**${T('Top profit items - ', 'Pinakamalaking tubo - ')}${r.label}**\n` +
              ranked.slice(0, 7).map((x, i) => `${i + 1}. [${x.cls}] ${x.name} - ${T('profit ', 'tubo ')}${P(x.profit)}`).join('\n') +
              (unknownCount
                ? '\n' + T(`(${unknownCount} sold item(s) have no capital and are not ranked)`, `(${unknownCount} item na naibenta ay walang puhunan kaya hindi isinama)`)
                : ''),
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
          );
        }
        case 'peak': {
          const r = range(rq, '30d');
          const st = computeSalesStats(liveSales(r), ctx.products);
          const hrs = Object.entries(st.hours)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
          if (!hrs.length) return reply(intent, T(`No sales for ${r.label} yet.`, `Wala pang benta para sa ${r.label}.`));
          const lab = (h: string) => {
            const n = Number(h);
            return (n % 12 || 12) + (n < 12 ? ' AM' : ' PM');
          };
          return reply(
            intent,
            `**${T('Busiest hours - ', 'Pinaka-busy na oras - ')}${r.label}**\n` + hrs.map(([h, v], i) => `${i + 1}. ${lab(h)} - ${P(v)}`).join('\n'),
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
          const body = ms
            .map((p) => {
              const e = expiryInfo(p, warnDays, now);
              const parts = [
                `**${p.name}**`,
                `- ${T('Price: ', 'Presyo: ')}${P(p.retailPrice)}/${p.unit}${p.wholesalePrice < p.retailPrice ? T(` (wholesale ${P(p.wholesalePrice)} at ${p.wholesaleMinQty}+)`, ` (wholesale ${P(p.wholesalePrice)} kapag ${p.wholesaleMinQty}+)`) : ''}`,
                `- Stock: ${qtyTxt(p.stock, p.unit)}${p.stock <= 0 ? T(' (OUT)', ' (UBOS NA)') : p.stock <= th() ? T(' (low)', ' (mababa na)') : ''}`,
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
          return reply(intent, near + body + more);
        }
        default:
          return reply('', helpText());
      }
    };

    if (this.lastIntent && RANGE_AWARE.has(this.lastIntent) && this.isRangeOnly(q)) {
      return run(this.lastIntent, q, this.lastProducts);
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
    if (/^(stock|inventory)$/.test(q)) return run('inventory', q);

    if (asksProduct && ms.toks.length) {
      const what = q.split(' ').filter((w) => w.length >= 3 && !STOP.has(w)).slice(0, 3).join(' ') || ms.toks.slice(0, 3).join(' ');
      return reply(
        '',
        T(
          `I couldn't find a product matching "${what}". Check the spelling, or try part of the name or the barcode.\n\nYou can also ask about sales, low stock or expiring items.`,
          `Hindi ko makita ang produktong "${what}". Tingnan ang spelling, o subukan ang bahagi ng pangalan o ang barcode.\n\nPuwede mo ring itanong ang benta, paubos na stock, o malapit nang ma-expire.`,
        ),
      );
    }
    return reply('', T("I didn't quite get that.\n\n", 'Hindi ko po masyadong naintindihan iyon.\n\n') + helpText());
  }

  private detectLang(tokens: string[], prev: Lang): Lang {
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
        'Hello! What would you like to check? Sales, low stock, expiring items, or the price of a product?',
        'Kumusta po! Ano ang gusto mong tingnan? Benta, paubos na stock, malapit nang ma-expire, o presyo ng produkto?',
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
