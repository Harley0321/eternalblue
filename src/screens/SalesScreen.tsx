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
    <div className="h-full overflow-y-auto bg-[#F8FAFC] p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Period Filters & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            aria-label="Sales date range"
            value={period}
            onChange={(e) => setPeriod(e.target.value as SalesPeriod)}
            className="min-h-[40px] rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-bold text-[#0F172A]"
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
                className="min-h-[40px] rounded-xl border border-[#E2E8F0] bg-white px-2.5 text-xs"
              />
              <input
                type="date"
                aria-label="Sales end date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="min-h-[40px] rounded-xl border border-[#E2E8F0] bg-white px-2.5 text-xs"
              />
            </>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void handleCopyXRead()}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white border border-[#E2E8F0] text-xs font-bold text-[#4F46E5] hover:bg-indigo-50 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileText size={14} />
            <span>X-Read</span>
          </button>
          <button
            type="button"
            onClick={handleExportSalesCsv}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white border border-[#E2E8F0] text-xs font-bold text-[#047857] hover:bg-emerald-50 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download size={14} />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setDenomOpen(true)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-xs font-bold text-white cursor-pointer"
          >
            Count Cash
          </button>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            title="Net Revenue"
            value={PosMath.formatPeso(stats.revenue)}
            sub={periodLabel}
            valueClass="text-[#047857]"
          />
          <KpiCard
            title="Est. Profit"
            value={PosMath.formatPeso(stats.profit)}
            sub={`${stats.marginPct}% gross margin`}
            valueClass="text-[#4F46E5]"
          />
          <KpiCard
            title="Completed Orders"
            value={String(stats.orders)}
            sub={`${PosMath.formatQty(stats.itemsCount)} units sold`}
          />
          <KpiCard
            title="Average Basket"
            value={PosMath.formatPeso(stats.avgTicket)}
            sub="Per completed receipt"
          />
        </div>

        {stats.uncostedLines > 0 && (
          <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
            Estimated profit may be overstated: {stats.uncostedLines} sold line(s) have no recorded capital cost.
          </div>
        )}

        {/* Tender Mix */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-3">
          <div className="font-bold text-sm text-[#0F172A]">Payment Tender Breakdown</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {tenderBreakdown.map((t) => (
              <div key={t.label} className="py-2 sm:py-0 sm:px-3 first:pl-0 last:pr-0">
                <div className="text-[11px] font-semibold text-[#64748B] truncate">{t.label}</div>
                <div className="font-mono tabular-nums font-extrabold text-sm text-[#0F172A] mt-0.5">
                  {PosMath.formatPeso(PosMath.fromCents(t.totalCents))}
                </div>
                <div className="text-[11px] text-[#64748B] tabular-nums">{t.count} orders</div>
              </div>
            ))}
          </div>
        </div>

        {/* Time-series Charts (2-Column Desktop Split) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
            <div className="font-bold text-sm text-[#0F172A]">Sales by Hour</div>
            {hourlySales.every((bucket) => bucket.orders === 0) ? (
              <div className="mt-4 text-xs text-[#64748B]">No sales in this period</div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <div className="min-w-[420px] h-28 flex items-end gap-1">
                  {hourlySales.map((bucket) => {
                    const height = Math.round((72 * bucket.revenueCents) / peakHour);
                    return (
                      <div key={bucket.hour} className="flex-1 h-full flex flex-col items-center justify-end">
                        <div
                          title={`${String(bucket.hour).padStart(2, '0')}:00 · ${bucket.orders} orders · ${PosMath.formatPeso(PosMath.fromCents(bucket.revenueCents))}`}
                          style={{ height: `${height}px` }}
                          className={`w-full rounded-t-sm ${bucket.revenueCents > 0 ? 'bg-[#4F46E5]' : 'bg-[#E2E8F0]'}`}
                        />
                        <span className="mt-1 text-[10px] font-mono tabular-nums text-[#64748B]">
                          {bucket.hour % 3 === 0 ? String(bucket.hour).padStart(2, '0') : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
            <div className="font-bold text-sm text-[#0F172A]">Last 7 Days Sales Trend</div>
            <div className="mt-4 h-28 flex items-end gap-2">
              {dayBuckets.map((b) => {
                const pct = Math.max(6, Math.min(100, (b.amount / peak) * 100));
                return (
                  <div key={b.label} className="flex-1 flex flex-col items-center h-full justify-end">
                    <div
                      title={`${b.label}: ${PosMath.formatPeso(b.amount)}`}
                      style={{ height: `${Math.round((72 * pct) / 100)}px` }}
                      className={`w-full rounded-t-md ${b.amount > 0 ? 'bg-[#059669]' : 'bg-[#E2E8F0]'}`}
                    />
                    <span className="text-[11px] font-medium text-[#64748B] mt-1">{b.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Category & SKU Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-3">
            <div className="font-bold text-sm text-[#0F172A]">Sales by Category</div>
            {categorySales.length === 0 ? (
              <div className="text-xs text-[#64748B]">No sales in this period</div>
            ) : (
              <div className="space-y-2.5">
                {categorySales.slice(0, 8).map((item) => (
                  <div key={item.category} className="flex items-center gap-2.5 text-xs">
                    <span className="w-28 truncate font-semibold text-[#334155]">{item.category}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#059669]"
                        style={{ width: `${Math.max(2, (item.revenueCents / peakCategory) * 100)}%` }}
                      />
                    </div>
                    <span className="w-24 text-right font-mono tabular-nums font-bold text-[#0F172A]">
                      {PosMath.formatPeso(PosMath.fromCents(item.revenueCents))}
                    </span>
                  </div>
                ))}
                <div className="border-t border-[#E2E8F0] pt-2 text-right text-[11px] text-[#64748B] tabular-nums">
                  {PosMath.formatPeso(PosMath.fromCents(categoryTotalCents))} net category sales
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-2.5">
            <div>
              <div className="font-bold text-sm text-[#0F172A]">Profit Ranking (ABC)</div>
              <p className="mt-0.5 text-[11px] text-[#64748B]">
                A: top 70% gross profit · B: next 20% · C: remaining or loss-making items
              </p>
            </div>
            {profitRanking.uncostedLines > 0 && (
              <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
                {profitRanking.uncostedLines} line(s) without capital are excluded from ranking.
              </p>
            )}
            {profitRanking.products.length === 0 ? (
              <div className="text-xs text-[#64748B]">
                No sales with capital data in this period. Add capital to products in Stock.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {profitRanking.products.slice(0, 8).map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-2 py-2 text-xs">
                    <div className="min-w-0">
                      <span
                        className={`mr-2 font-mono font-extrabold ${
                          item.grade === 'A'
                            ? 'text-[#047857]'
                            : item.grade === 'B'
                            ? 'text-[#D97706]'
                            : 'text-[#64748B]'
                        }`}
                      >
                        [{item.grade}]
                      </span>
                      <span className="font-semibold text-[#0F172A]">{item.name}</span>
                      <span className="ml-1.5 text-[11px] text-[#64748B] tabular-nums">
                        ({PosMath.formatQty(PosMath.fromMilli(item.qtyMilli))} sold)
                      </span>
                    </div>
                    <span
                      className={`shrink-0 font-mono tabular-nums font-bold ${
                        item.profitCents < 0 ? 'text-rose-700' : 'text-[#047857]'
                      }`}
                    >
                      {PosMath.formatPeso(PosMath.fromCents(item.profitCents))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top Performing SKUs */}
        {topSkus.length > 0 && (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-2">
            <div className="font-bold text-sm text-[#0F172A]">Top Performing SKUs</div>
            <div className="divide-y divide-slate-100">
              {topSkus.map((sku, idx) => (
                <div key={sku.key} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-[#64748B] mr-2">#{idx + 1}</span>
                    <span className="font-bold text-[#0F172A] truncate">{sku.name}</span>
                    <span className="text-[11px] text-[#64748B] ml-2 tabular-nums">
                      ({PosMath.formatQty(sku.qty)} sold)
                    </span>
                  </div>
                  <div className="text-right shrink-0 font-mono tabular-nums">
                    <div className="font-extrabold text-[#047857]">
                      {PosMath.formatPeso(PosMath.fromCents(sku.revCents))}
                    </div>
                    <div className="text-[11px] text-[#4F46E5]">
                      +{PosMath.formatPeso(PosMath.fromCents(sku.profitCents))} profit
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Receipts Ledger */}
        <div className="space-y-2.5 pb-4">
          <h3 className="font-extrabold text-sm text-[#0F172A] tabular-nums">
            Receipts ({filteredSales.length})
          </h3>
          {filteredSales.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 text-center text-xs text-[#64748B]">
              No completed sales recorded for {periodLabel}.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {filteredSales.map((s) => (
                <button
                  key={s.receiptNo}
                  type="button"
                  onClick={() => openReceipt(s)}
                  className="w-full text-left bg-white rounded-xl border border-[#E2E8F0] hover:border-[#059669]/60 p-3.5 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold font-mono text-sm text-[#0F172A]">{s.receiptNo}</span>
                      <span className="text-[11px] font-semibold text-[#475569]">{s.paymentMethod}</span>
                      {s.voided && (
                        <>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span className="text-[11px] font-bold text-[#E11D48]">Voided</span>
                        </>
                      )}
                    </div>
                    <div className="text-[11px] text-[#64748B] mt-0.5 tabular-nums">
                      {s.dateFormatted} · {s.items.length} lines
                    </div>
                  </div>
                  <div
                    className={`font-extrabold font-mono tabular-nums text-[15px] shrink-0 ${
                      s.voided ? 'text-[#64748B] line-through' : 'text-[#047857]'
                    }`}
                  >
                    {PosMath.formatPeso(s.grandTotal)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {denomOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3 shadow-xl">
            <h3 className="font-bold text-lg text-[#0F172A]">PH Cash Denomination Counter</h3>
            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {PosMath.PH_DENOMINATIONS.map((denom) => (
                <div key={denom} className="flex items-center justify-between gap-3">
                  <span className="font-mono tabular-nums font-bold text-sm w-28">
                    {PosMath.formatPeso(denom)}
                  </span>
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
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-[#E2E8F0] font-mono tabular-nums"
                  />
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
              <span className="font-extrabold text-base text-[#047857] font-mono tabular-nums">
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
