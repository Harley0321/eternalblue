import React, { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { KpiCard } from '../components/CommonGraphics';
import { PosMath } from '../domain/posMath';
import {
  computeCategorySales,
  computeHourlySales,
  computeProductProfitRanking,
  getSalesPeriodRange,
  type SalesPeriod,
} from '../domain/salesAnalytics';
import { DeviceBridge } from '../hardware/deviceBridge';
import { usePos } from '../state/PosContext';

function safeCsvCell(raw: string): string {
  const clean = raw.replace(/\r/g, ' ').replace(/\n/g, ' ');
  const trimmed = clean.trimStart();
  const neutralized =
    trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')
      ? `'${clean}`
      : clean;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export const SalesScreen: React.FC = () => {
  const { state, productMap, openReceipt, toast } = usePos();
  const [period, setPeriod] = useState<SalesPeriod>('LAST_7_DAYS');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [denomOpen, setDenomOpen] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>({});

  const startToday = PosMath.startOfDayMs();
  const range = getSalesPeriodRange(period, new Date(), customFrom, customTo);
  const { fromMs, toMs, label: periodLabel } = range;

  const stats = useMemo(
    () => PosMath.computeSalesStats(state.sales, fromMs, toMs, productMap),
    [state.sales, fromMs, toMs, productMap]
  );

  const filteredSales = useMemo(
    () =>
      state.sales.filter((s) => {
        const ms = PosMath.parseIsoMs(s.dateIso);
        return ms >= fromMs && ms < toMs;
      }),
    [state.sales, fromMs, toMs]
  );

  const hourlySales = useMemo(
    () => computeHourlySales(state.sales, fromMs, toMs),
    [state.sales, fromMs, toMs]
  );
  const categorySales = useMemo(
    () => computeCategorySales(state.sales, fromMs, toMs, productMap),
    [state.sales, fromMs, toMs, productMap]
  );
  const profitRanking = useMemo(
    () => computeProductProfitRanking(state.sales, fromMs, toMs, productMap),
    [state.sales, fromMs, toMs, productMap]
  );

  const tenderBreakdown = useMemo(() => {
    const map: Record<string, { label: string; totalCents: number; count: number }> = {
      Cash: { label: 'Cash', totalCents: 0, count: 0 },
      GCash: { label: 'GCash / QR Ph', totalCents: 0, count: 0 },
      Card: { label: 'Card', totalCents: 0, count: 0 },
      Split: { label: 'Split', totalCents: 0, count: 0 },
      Utang: { label: 'Utang', totalCents: 0, count: 0 },
    };
    for (const s of filteredSales) {
      if (s.voided === true) continue;
      const key = map[s.paymentMethod] ? s.paymentMethod : 'Cash';
      map[key].totalCents += PosMath.toCents(s.grandTotal);
      map[key].count += 1;
    }
    return Object.values(map);
  }, [filteredSales]);

  const topSkus = useMemo(() => {
    const agg = new Map<
      string,
      { key: string; name: string; qtyMilli: number; revCents: number; profitCents: number }
    >();
    for (const s of filteredSales) {
      if (s.voided === true) continue;
      const netCents = PosMath.allocateSaleLineNetCents(s, productMap);
      s.items.forEach((it, idx) => {
        const key = it.productId || it.name;
        const cur = agg.get(key) ?? { key, name: it.name, qtyMilli: 0, revCents: 0, profitCents: 0 };
        const revC = netCents[idx] ?? PosMath.toCents(it.lineTotal);
        const cap = it.capital ?? (it.productId ? productMap.get(it.productId)?.capital : undefined) ?? 0;
        const costC = cap > 0 ? PosMath.lineCents(cap, it.qty) : 0;
        cur.qtyMilli += PosMath.toMilli(it.qty);
        cur.revCents += revC;
        cur.profitCents += revC - costC;
        agg.set(key, cur);
      });
    }
    return Array.from(agg.values())
      .map((entry) => ({
        ...entry,
        qty: PosMath.fromMilli(entry.qtyMilli),
      }))
      .sort((a, b) => b.revCents - a.revCents)
      .slice(0, 5);
  }, [filteredSales, productMap]);

  const dayBuckets = useMemo(() => {
    const arr: Array<{ label: string; amount: number }> = [];
    for (let offset = 6; offset >= 0; offset--) {
      const dStart = startToday - offset * PosMath.DAY_MS;
      const dEnd = dStart + PosMath.DAY_MS;
      const dStat = PosMath.computeSalesStats(state.sales, dStart, dEnd, productMap);
      arr.push({ label: offset === 0 ? 'Today' : `${offset}d`, amount: dStat.revenue });
    }
    return arr;
  }, [state.sales, productMap, startToday]);

  const peak = Math.max(1, ...dayBuckets.map((b) => b.amount));
  const peakHour = Math.max(1, ...hourlySales.map((bucket) => bucket.revenueCents));
  const categoryTotalCents = categorySales.reduce((sum, item) => sum + item.revenueCents, 0);
  const peakCategory = Math.max(1, ...categorySales.map((item) => item.revenueCents));

  const denomTotal = PosMath.fromCents(
    PosMath.PH_DENOMINATIONS.reduce(
      (sum, d) => sum + PosMath.toCents(d) * Math.max(0, parseInt(counts[d] ?? '0', 10) || 0),
      0
    )
  );

  const handleExportSalesCsv = () => {
    const header = 'ReceiptNo,Date,Cashier,Customer,PaymentMethod,GrandTotal,Voided';
    const rows = filteredSales.map((s) =>
      [
        safeCsvCell(s.receiptNo),
        safeCsvCell(s.dateFormatted),
        safeCsvCell(s.cashierName ?? ''),
        safeCsvCell(s.customerName ?? 'Walk-in'),
        safeCsvCell(s.paymentMethod),
        s.grandTotal.toFixed(2),
        s.voided ? 'YES' : 'NO',
      ].join(',')
    );
    void DeviceBridge.shareOrDownloadTextFile('eternalblue_sales.csv', [header, ...rows].join('\n'), 'text/csv');
    toast(`Exported ${filteredSales.length} receipts CSV`);
  };

  const handleCopyXRead = async () => {
    const lines = [
      `${state.settings.storeName} — X-READ SUMMARY`,
      `Period: ${periodLabel}`,
      `Cashier: ${state.activeShift?.cashierName ?? 'Active'}`,
      `Orders: ${stats.orders} | Avg Basket: ${PosMath.formatPeso(stats.avgTicket)}`,
      `Net Revenue: ${PosMath.formatPeso(stats.revenue)}`,
      `Est. Profit: ${PosMath.formatPeso(stats.profit)} (${stats.marginPct}%)`,
      '--- Tenders ---',
      ...tenderBreakdown
        .filter((t) => t.count > 0)
        .map((t) => `${t.label}: ${PosMath.formatPeso(PosMath.fromCents(t.totalCents))} (${t.count})`),
    ];
    await DeviceBridge.copyText(lines.join('\n'));
    toast('X-Read summary copied to clipboard');
  };

  return (
    <div className="p-3 space-y-2.5 overflow-y-auto h-full bg-[#F4F6F8]">
      {/* Period Filters & Actions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <select
          aria-label="Sales date range"
          value={period}
          onChange={(e) => setPeriod(e.target.value as SalesPeriod)}
          className="min-h-[36px] rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs font-bold text-[#0F172A]"
        >
          <option value="TODAY">Today</option>
          <option value="YESTERDAY">Yesterday</option>
          <option value="LAST_7_DAYS">Last 7 Days</option>
          <option value="LAST_30_DAYS">Last 30 Days</option>
          <option value="THIS_MONTH">This Month</option>
          <option value="LAST_MONTH">Last Month</option>
          <option value="ALL_TIME">All Time</option>
          <option value="CUSTOM">Custom Range</option>
        </select>
        {period === 'CUSTOM' && (
          <>
            <input
              type="date"
              aria-label="Sales start date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="min-h-[36px] rounded-lg border border-[#E2E8F0] bg-white px-2 text-xs"
            />
            <input
              type="date"
              aria-label="Sales end date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="min-h-[36px] rounded-lg border border-[#E2E8F0] bg-white px-2 text-xs"
            />
          </>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void handleCopyXRead()}
          className="px-2.5 py-1.5 rounded-[10px] bg-white border border-[#E2E8F0] text-xs font-bold text-[#4F46E5] hover:bg-indigo-50 inline-flex items-center gap-1 cursor-pointer"
        >
          <FileText size={13} />
          <span>X-Read</span>
        </button>
        <button
          type="button"
          onClick={handleExportSalesCsv}
          className="px-2.5 py-1.5 rounded-[10px] bg-white border border-[#E2E8F0] text-xs font-bold text-[#047857] hover:bg-emerald-50 inline-flex items-center gap-1 cursor-pointer"
        >
          <Download size={13} />
          <span>CSV</span>
        </button>
        <button
          type="button"
          onClick={() => setDenomOpen(true)}
          className="px-3 py-1.5 rounded-[10px] bg-white border border-[#E2E8F0] text-xs font-bold text-[#0F172A] hover:bg-slate-50 cursor-pointer"
        >
          Count Cash
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <KpiCard
          title="Net Revenue"
          value={PosMath.formatPeso(stats.revenue)}
          sub={`${stats.orders} orders · Avg ${PosMath.formatPeso(stats.avgTicket)}`}
          valueClass="text-[#047857]"
        />
        <KpiCard
          title="Est. Profit"
          value={PosMath.formatPeso(stats.profit)}
          sub={`${stats.marginPct}% margin · ${PosMath.formatQty(stats.itemsCount)} units`}
          valueClass="text-[#4F46E5]"
        />
      </div>
      {stats.uncostedLines > 0 && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Estimated profit may be overstated: {stats.uncostedLines} sold line(s) have no recorded capital cost.
        </div>
      )}

      {/* Tender Mix */}
      <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-3 space-y-2">
        <div className="font-bold text-sm text-[#0F172A]">Payment Tender Breakdown</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {tenderBreakdown.map((t) => (
            <div key={t.label} className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-2">
              <div className="text-[10px] font-bold text-[#64748B] truncate">{t.label}</div>
              <div className="font-mono font-extrabold text-xs text-[#0F172A] mt-0.5">
                {PosMath.formatPeso(PosMath.fromCents(t.totalCents))}
              </div>
              <div className="text-[10px] text-[#64748B]">{t.count} orders</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-3">
        <div className="font-bold text-sm text-[#0F172A]">Sales by Hour</div>
        {hourlySales.every((bucket) => bucket.orders === 0) ? (
          <div className="mt-2 text-xs text-[#64748B]">No sales in this period</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[560px] h-28 flex items-end gap-1">
              {hourlySales.map((bucket) => {
                const height = Math.round((68 * bucket.revenueCents) / peakHour);
                return (
                  <div key={bucket.hour} className="flex-1 h-full flex flex-col items-center justify-end">
                    <div
                      title={`${String(bucket.hour).padStart(2, '0')}:00 · ${bucket.orders} orders · ${PosMath.formatPeso(PosMath.fromCents(bucket.revenueCents))}`}
                      style={{ height: `${height}px` }}
                      className={`w-full rounded-t-sm ${bucket.revenueCents > 0 ? 'bg-[#4F46E5]' : 'bg-[#E2E8F0]'}`}
                    />
                    <span className="mt-1 text-[9px] text-[#64748B]">
                      {bucket.hour % 3 === 0 ? String(bucket.hour).padStart(2, '0') : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 7-Day Sales Bar Chart */}
      <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-3">
        <div className="font-bold text-sm text-[#0F172A]">Last 7 Days Sales Trend</div>
        <div className="mt-3 h-24 flex items-end gap-1.5">
          {dayBuckets.map((b) => {
            const pct = Math.max(6, Math.min(100, (b.amount / peak) * 100));
            return (
              <div key={b.label} className="flex-1 flex flex-col items-center h-full justify-end">
                <div
                  title={`${b.label}: ${PosMath.formatPeso(b.amount)}`}
                  style={{ height: `${Math.round((68 * pct) / 100)}px` }}
                  className={`w-full rounded-t-md ${b.amount > 0 ? 'bg-[#047857]' : 'bg-[#E2E8F0]'}`}
                />
                <span className="text-[10px] text-[#64748B] mt-1">{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-3 space-y-2">
        <div className="font-bold text-sm text-[#0F172A]">Sales by Category</div>
        {categorySales.length === 0 ? (
          <div className="text-xs text-[#64748B]">No sales in this period</div>
        ) : (
          <div className="space-y-2">
            {categorySales.slice(0, 8).map((item) => (
              <div key={item.category} className="flex items-center gap-2 text-xs">
                <span className="w-28 truncate font-semibold text-[#334155]">{item.category}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[#059669]"
                    style={{ width: `${Math.max(2, (item.revenueCents / peakCategory) * 100)}%` }}
                  />
                </div>
                <span className="w-20 text-right font-mono font-bold text-[#0F172A]">
                  {PosMath.formatPeso(PosMath.fromCents(item.revenueCents))}
                </span>
              </div>
            ))}
            <div className="border-t border-[#E2E8F0] pt-1 text-right text-[10px] text-[#64748B]">
              {PosMath.formatPeso(PosMath.fromCents(categoryTotalCents))} net category sales
            </div>
          </div>
        )}
      </div>

      {/* Top Selling SKUs */}
      {topSkus.length > 0 && (
        <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-3 space-y-1.5">
          <div className="font-bold text-sm text-[#0F172A]">Top Performing SKUs</div>
          <div className="divide-y divide-[#E2E8F0]">
            {topSkus.map((sku, idx) => (
              <div key={sku.key} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <span className="font-mono font-bold text-[#64748B] mr-1.5">#{idx + 1}</span>
                  <span className="font-bold text-[#0F172A] truncate">{sku.name}</span>
                  <span className="text-[11px] text-[#64748B] ml-1.5">({PosMath.formatQty(sku.qty)} sold)</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-extrabold text-[#047857]">
                    {PosMath.formatPeso(PosMath.fromCents(sku.revCents))}
                  </div>
                  <div className="text-[10px] font-mono text-[#4F46E5]">
                    +{PosMath.formatPeso(PosMath.fromCents(sku.profitCents))} profit
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-3 space-y-2">
        <div>
          <div className="font-bold text-sm text-[#0F172A]">Profit Ranking (ABC)</div>
          <p className="mt-0.5 text-[10px] text-[#64748B]">
            A: top 70% of gross profit · B: next 20% · C: remaining or loss-making items
          </p>
        </div>
        {profitRanking.uncostedLines > 0 && (
          <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-900">
            {profitRanking.uncostedLines} line(s) without capital are excluded from ranking.
          </p>
        )}
        {profitRanking.products.length === 0 ? (
          <div className="text-xs text-[#64748B]">
            No sales with capital data in this period. Add capital to products in Stock.
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0]">
            {profitRanking.products.slice(0, 8).map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                <div className="min-w-0">
                  <span
                    className={`mr-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-extrabold ${
                      item.grade === 'A'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.grade === 'B'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {item.grade}
                  </span>
                  <span className="font-semibold text-[#0F172A]">{item.name}</span>
                  <span className="ml-1 text-[10px] text-[#64748B]">
                    ({PosMath.formatQty(PosMath.fromMilli(item.qtyMilli))} sold)
                  </span>
                </div>
                <span className={`shrink-0 font-mono font-bold ${item.profitCents < 0 ? 'text-rose-700' : 'text-[#047857]'}`}>
                  {PosMath.formatPeso(PosMath.fromCents(item.profitCents))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 className="font-extrabold text-sm text-[#0F172A]">Receipts ({filteredSales.length})</h3>

      <div className="space-y-2">
        {filteredSales.map((s) => (
          <button
            key={s.receiptNo}
            type="button"
            onClick={() => openReceipt(s)}
            className="w-full text-left bg-white rounded-[14px] border border-[#E2E8F0] hover:border-[#059669]/60 p-3 flex items-center justify-between gap-2 cursor-pointer transition-colors"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-extrabold font-mono text-sm text-[#0F172A]">{s.receiptNo}</span>
                <span className="bg-[#F1F5F9] text-[#0F172A] text-[10px] font-bold px-1.5 py-0.5 rounded">
                  {s.paymentMethod}
                </span>
                {s.voided && (
                  <span className="bg-[#FFF1F2] text-[#E11D48] text-[10px] font-bold px-1.5 py-0.5 rounded">
                    VOIDED
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#64748B] mt-0.5">
                {s.dateFormatted} · {s.items.length} lines
              </div>
            </div>
            <div
              className={`font-extrabold font-mono text-[15px] shrink-0 ${
                s.voided ? 'text-[#64748B]' : 'text-[#047857]'
              }`}
            >
              {PosMath.formatPeso(s.grandTotal)}
            </div>
          </button>
        ))}
      </div>

      {denomOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3 shadow-xl">
            <h3 className="font-bold text-lg text-[#0F172A]">PH Cash Denomination Counter</h3>
            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {PosMath.PH_DENOMINATIONS.map((denom) => (
                <div key={denom} className="flex items-center justify-between gap-3">
                  <span className="font-mono font-bold text-sm w-28">{PosMath.formatPeso(denom)}</span>
                  <input
                    type="number"
                    min="0"
                    value={counts[denom] ?? ''}
                    onChange={(e) =>
                      setCounts((prev) => ({
                        ...prev,
                        [denom]: e.target.value.replace(/\D/g, ''),
                      }))
                    }
                    placeholder="0"
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-[#E2E8F0] font-mono"
                  />
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
              <span className="font-extrabold text-base text-[#047857] font-mono">
                Total Counted: {PosMath.formatPeso(denomTotal)}
              </span>
              <button
                type="button"
                onClick={() => setDenomOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#059669] text-white text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
