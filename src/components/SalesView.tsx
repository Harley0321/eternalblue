import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Coins, FileSpreadsheet, Printer, RotateCcw, TrendingUp, X } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ActiveShiftState,
  CashDrawerEvent,
  DigitalServiceEntry,
  Product,
  SaleRecord,
  UtangTransaction,
} from '../types';
import { computeShiftLedgerSummary } from '../utils/opsMath';
import {
  computeCashDrawerSummary,
  computeHourlySalesSeries,
  computeLast7DaysNetSales,
  computeProfitRanking,
  computeSalesStats,
  DAY_MS,
  escapeCsvCell,
  formatPeso,
  formatQty,
  inRange,
  itemUnitCapital,
  PH_DENOMINATIONS,
  round2,
  saleProfitCalc,
  startOfDay,
  summarize7DayTrend,
  sumPeso,
} from '../utils/posMath';

type SalesPeriod = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'lastmonth' | 'all' | 'date';

interface SalesViewProps {
  sales: SaleRecord[];
  products: Product[];
  drawerEvents?: CashDrawerEvent[];
  utangTxs?: UtangTransaction[];
  serviceEntries?: DigitalServiceEntry[];
  activeShift?: ActiveShiftState | null;
  openCashDrawerSignal?: number;
  onReprintReceipt: (sale: SaleRecord) => void;
  onVoidSale: (receiptNo: string) => void;
  onPrintReading: (isZ: boolean) => void;
  onToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
}

export const SalesView: React.FC<SalesViewProps> = ({
  sales,
  products,
  drawerEvents = [],
  utangTxs = [],
  serviceEntries = [],
  activeShift = null,
  openCashDrawerSignal,
  onReprintReceipt,
  onVoidSale,
  onPrintReading,
  onToast,
}) => {
  const [period, setPeriod] = useState<SalesPeriod>('today');
  const [pickedDate, setPickedDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VALID' | 'VOID'>('ALL');
  const [expandedReceipts, setExpandedReceipts] = useState<Set<string>>(() => new Set());
  const [shownCount, setShownCount] = useState(100);
  const [showCashDrawer, setShowCashDrawer] = useState(false);
  const [openingFloatStr, setOpeningFloatStr] = useState(() =>
    String(activeShift?.openingFloat ?? 1000),
  );
  const [denomCounts, setDenomCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    if (openCashDrawerSignal && openCashDrawerSignal > 0) {
      setShowCashDrawer(true);
    }
  }, [openCashDrawerSignal]);

  const toggleReceiptExpanded = (receiptNo: string) => {
    setExpandedReceipts((prev) => {
      const next = new Set(prev);
      if (next.has(receiptNo)) next.delete(receiptNo);
      else next.add(receiptNo);
      return next;
    });
  };

  const range = useMemo(() => {
    const today = startOfDay(new Date());
    let from = today;
    let to = new Date(today.getTime() + DAY_MS);
    let label = 'Today';

    if (period === 'yesterday') {
      from = new Date(today.getTime() - DAY_MS);
      to = today;
      label = 'Yesterday';
    } else if (period === '7d') {
      from = new Date(today.getTime() - 6 * DAY_MS);
      label = 'Last 7 Days';
    } else if (period === '30d') {
      from = new Date(today.getTime() - 29 * DAY_MS);
      label = 'Last 30 Days';
    } else if (period === 'month') {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      label = 'This Month';
    } else if (period === 'lastmonth') {
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to = new Date(today.getFullYear(), today.getMonth(), 1);
      label = 'Last Month';
    } else if (period === 'all') {
      from = new Date(0);
      to = new Date(8640000000000000);
      label = 'All Time';
    } else if (period === 'date') {
      const d = pickedDate ? startOfDay(new Date(`${pickedDate}T00:00:00`)) : today;
      from = d;
      to = new Date(d.getTime() + DAY_MS);
      label = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return { from, to, label };
  }, [period, pickedDate]);

  const paymentMethods = useMemo(
    () => Array.from(new Set(sales.map((s) => s.paymentMethod || 'Cash'))),
    [sales],
  );

  const inPeriod = useMemo(
    () => sales.filter((s) => inRange(s, range.from, range.to)),
    [sales, range],
  );
  const valid = useMemo(() => inPeriod.filter((s) => !s.voided), [inPeriod]);
  const voided = useMemo(() => inPeriod.filter((s) => s.voided), [inPeriod]);
  const stats = useMemo(() => computeSalesStats(valid, products), [valid, products]);
  const abc = useMemo(() => computeProfitRanking(valid, products), [valid, products]);

  const noCapCount = useMemo(() => {
    const prodById = new Map(products.map((p) => [p.id, p]));
    const set = new Set<string>();
    valid.forEach((s) =>
      (s.items || []).forEach((it) => {
        if (!(itemUnitCapital(it, prodById, products) > 0)) set.add(it.name);
      }),
    );
    return set.size;
  }, [valid, products]);

  const trend = useMemo(() => {
    if (period === 'all') return null;
    const span = range.to.getTime() - range.from.getTime();
    const elapsed = Math.min(span, Math.max(0, Date.now() - range.from.getTime()));
    const prevFrom = new Date(range.from.getTime() - span);
    const prevTo = new Date(prevFrom.getTime() + (elapsed > 0 ? elapsed : span));
    const prev =
      sales
        .filter((s) => !s.voided && inRange(s, prevFrom, prevTo))
        .reduce((a, s) => a + Math.round((Number(s.grandTotal) || 0) * 100), 0) / 100;
    if (!(prev > 0)) return null;
    const pct = ((stats.net - prev) / prev) * 100;
    return { pct, up: pct >= 0 };
  }, [period, range, sales, stats.net]);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inPeriod.filter((s) => {
      if (payFilter !== 'ALL' && (s.paymentMethod || 'Cash') !== payFilter) return false;
      if (statusFilter === 'VALID' && s.voided) return false;
      if (statusFilter === 'VOID' && !s.voided) return false;
      if (!q) return true;
      return (
        String(s.receiptNo).toLowerCase().includes(q) ||
        (s.items || []).some((it) => String(it.name).toLowerCase().includes(q))
      );
    });
  }, [inPeriod, payFilter, statusFilter, search]);

  const visibleList = filteredList.slice(0, shownCount);
  const prodById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const allVisibleExpanded =
    visibleList.length > 0 && visibleList.every((s) => expandedReceipts.has(s.receiptNo));

  const openingFloatNum = Math.max(0, parseFloat(openingFloatStr) || 0);

  const cashDrawer = useMemo(
    () =>
      computeCashDrawerSummary(
        sales,
        range.from,
        range.to,
        denomCounts,
        openingFloatNum,
      ),
    [sales, range.from, range.to, denomCounts, openingFloatNum],
  );

  const opsShiftLedger = useMemo(
    () =>
      computeShiftLedgerSummary({
        sales,
        products,
        drawerEvents,
        utangTransactions: utangTxs,
        serviceEntries,
        openingFloat: openingFloatNum,
        from: range.from,
        to: range.to,
      }),
    [sales, products, drawerEvents, utangTxs, serviceEntries, openingFloatNum, range.from, range.to],
  );

  const adjustedExpectedDrawer = opsShiftLedger.expectedDrawerCash;
  const adjustedVariance = round2(cashDrawer.countedTotal - adjustedExpectedDrawer);
  const adjustedStatus: 'balanced' | 'over' | 'short' =
    Math.abs(adjustedVariance) < 0.005 ? 'balanced' : adjustedVariance > 0 ? 'over' : 'short';

  const exportSalesCsv = () => {
    const prodByName = new Map<string, Product>();
    products.forEach((p) => {
      if (!prodByName.has(p.name)) prodByName.set(p.name, p);
    });
    const rows: (string | number)[][] = [
      ['Receipt', 'Date', 'Item', 'Category', 'Qty', 'Unit', 'Unit Price', 'Line Total', 'Payment', 'Status', 'Receipt Total'],
    ];
    inPeriod
      .slice()
      .reverse()
      .forEach((s) => {
        s.items.forEach((it) => {
          const prod = (it.productId && prodById.get(it.productId)) || prodByName.get(it.name);
          const cat = it.category || (prod ? prod.category : 'Uncategorized');
          rows.push([
            s.receiptNo,
            s.dateFormatted,
            it.name,
            cat,
            it.qty,
            it.unit,
            it.unitPrice,
            it.lineTotal,
            s.paymentMethod,
            s.voided ? 'VOID' : 'OK',
            s.grandTotal,
          ]);
        });
      });
    if (rows.length === 1) {
      onToast('No sales to export for this period', 'warning');
      return;
    }
    const csv = '\uFEFF' + rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-${new Date().toLocaleDateString('en-CA')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast('Sales CSV downloaded');
  };

  const hourlySeries = useMemo(() => computeHourlySalesSeries(stats.hours), [stats.hours]);

  const topProducts = Object.entries(stats.products)
    .sort((a, b) => b[1].amt - a[1].amt)
    .slice(0, 5);
  const topCats = Object.entries(stats.cats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const last7DaysTrend = useMemo(() => computeLast7DaysNetSales(sales), [sales]);
  const last7DaysSummary = useMemo(() => summarize7DayTrend(last7DaysTrend), [last7DaysTrend]);

  return (
    <section className="h-full flex flex-col overflow-hidden p-3 sm:p-4 lg:p-6 gap-3">
      <div className="flex-1 overflow-y-auto scroll-contain space-y-3 pb-4">
        {/* Sales Toolbar */}
        <div className="bg-white p-2.5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
          <div className="relative w-full sm:flex-1 sm:min-w-[160px]">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShownCount(100);
              }}
              placeholder="Search receipt # or item..."
              aria-label="Search receipts or items"
              className="w-full pl-3 pr-8 py-2 min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setShownCount(100);
                }}
                aria-label="Clear sales search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 flex items-center justify-center cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 sm:flex sm:items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value as SalesPeriod);
                setShownCount(100);
              }}
              aria-label="Sales period"
              className="w-full sm:w-auto px-1.5 sm:px-3 py-2 min-h-[40px] rounded-xl bg-slate-50 border border-slate-200 text-[11px] sm:text-xs font-bold text-slate-700"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="month">This month</option>
              <option value="lastmonth">Last month</option>
              <option value="all">All time</option>
              <option value="date">Pick a date…</option>
            </select>

            <select
              value={payFilter}
              onChange={(e) => setPayFilter(e.target.value)}
              aria-label="Filter by payment method"
              className="w-full sm:w-auto px-1.5 sm:px-3 py-2 min-h-[40px] rounded-xl bg-slate-50 border border-slate-200 text-[11px] sm:text-xs font-bold text-slate-700"
            >
              <option value="ALL">All Pay</option>
              {paymentMethods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'VALID' | 'VOID')}
              aria-label="Filter by receipt status"
              className="w-full sm:w-auto px-1.5 sm:px-3 py-2 min-h-[40px] rounded-xl bg-slate-50 border border-slate-200 text-[11px] sm:text-xs font-bold text-slate-700"
            >
              <option value="ALL">All Status</option>
              <option value="VALID">Valid only</option>
              <option value="VOID">Voided only</option>
            </select>
          </div>

          {period === 'date' && (
            <input
              type="date"
              value={pickedDate}
              onChange={(e) => setPickedDate(e.target.value)}
              aria-label="Pick a date"
              className="w-full sm:w-auto px-3 py-2 min-h-[40px] rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700"
            />
          )}

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowCashDrawer((v) => !v)}
              aria-pressed={showCashDrawer}
              data-testid="toggle-cash-drawer-btn"
              className={`px-2.5 sm:px-3 py-2 min-h-[40px] rounded-xl font-bold text-[11px] sm:text-xs whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer border transition flex-1 sm:flex-initial ${
                showCashDrawer
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}
            >
              <Coins className="w-3.5 h-3.5 shrink-0" />
              <span>Cash Drawer</span>
            </button>
            <button
              type="button"
              onClick={exportSalesCsv}
              className="px-2.5 sm:px-3 py-2 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] sm:text-xs whitespace-nowrap flex items-center justify-center gap-1 cursor-pointer shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() => onPrintReading(false)}
              className="px-2.5 sm:px-3 py-2 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] sm:text-xs whitespace-nowrap flex items-center justify-center gap-1 cursor-pointer shrink-0"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>X-Read</span>
            </button>
            <button
              type="button"
              onClick={() => onPrintReading(true)}
              className="px-2.5 sm:px-3 py-2 min-h-[40px] rounded-xl bg-slate-900 text-emerald-400 font-bold text-[11px] sm:text-xs whitespace-nowrap flex items-center justify-center gap-1 cursor-pointer shrink-0"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>Z-Read</span>
            </button>
          </div>
        </div>

        {/* Collapsible PH Cash Drawer Reconciliation */}
        {showCashDrawer && (
          <div
            data-testid="cash-drawer-card"
            className="bg-white p-3.5 sm:p-4 rounded-2xl border border-emerald-200 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div>
                <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-emerald-600" />
                  <span>Cash Drawer Count &amp; Reconciliation ({range.label})</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Counts Cash sales ({cashDrawer.cashOrders}) + Split cash ({cashDrawer.splitCashOrders}). GCash/Card/voids excluded.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <span>Opening Float ₱</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    data-testid="drawer-float-input"
                    value={openingFloatStr}
                    onChange={(e) => setOpeningFloatStr(e.target.value)}
                    className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono-num font-bold text-xs text-right bg-slate-50 focus:bg-white focus:border-emerald-600 focus:outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setDenomCounts({})}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {PH_DENOMINATIONS.map((denom) => {
                const count = denomCounts[denom] ?? 0;
                const subtotal = denom * count;
                return (
                  <div
                    key={denom}
                    className="p-2 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-mono-num font-extrabold text-xs text-slate-900">
                        {denom >= 1 ? `₱${denom}` : '25¢'}
                      </div>
                      <div className="font-mono-num text-[10px] text-slate-500 truncate">
                        {formatPeso(subtotal)}
                      </div>
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      aria-label={`Count for ${denom >= 1 ? `${denom} peso` : '25 centavo'}`}
                      data-testid={`denom-input-${String(denom).replace('.', '_')}`}
                      value={count === 0 ? '' : count}
                      placeholder="0"
                      onChange={(e) => {
                        const val = Math.max(0, Math.floor(parseFloat(e.target.value) || 0));
                        setDenomCounts((prev) => ({ ...prev, [denom]: val }));
                      }}
                      className="w-14 px-1.5 py-1.5 min-h-[36px] sm:min-h-0 rounded-lg border border-slate-300 bg-white text-center font-mono-num font-bold text-sm sm:text-xs focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">Cash Sales + Utang Bayad</div>
                <div className="font-mono-num font-extrabold text-sm text-slate-900 mt-0.5">
                  {formatPeso(cashDrawer.expectedCashSales + opsShiftLedger.utangCashCollected)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono-num">
                  Svc {opsShiftLedger.serviceCashImpact >= 0 ? '+' : ''}
                  {formatPeso(opsShiftLedger.serviceCashImpact)} · Out −{formatPeso(opsShiftLedger.expensesTotal + opsShiftLedger.cashDrops)}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">Expected in Drawer</div>
                <div className="font-mono-num font-extrabold text-sm text-indigo-700 mt-0.5">
                  {formatPeso(adjustedExpectedDrawer)}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">Physical Count</div>
                <div
                  data-testid="drawer-counted-total"
                  className="font-mono-num font-extrabold text-sm text-slate-900 mt-0.5"
                >
                  {formatPeso(cashDrawer.countedTotal)}
                </div>
              </div>
              <div
                data-testid="drawer-variance-box"
                className={`p-2.5 rounded-xl border ${
                  adjustedStatus === 'balanced'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : adjustedStatus === 'over'
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="text-[10px] font-bold uppercase opacity-80">
                  Variance ({adjustedStatus === 'balanced' ? 'Balanced' : adjustedStatus === 'over' ? 'Over' : 'Short'})
                </div>
                <div className="font-mono-num font-extrabold text-sm mt-0.5">
                  {adjustedVariance > 0 ? `+${formatPeso(adjustedVariance)}` : formatPeso(adjustedVariance)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase">{range.label} · Net Sales</div>
            <div className="font-mono-num font-extrabold text-xl text-emerald-700 mt-0.5">
              {formatPeso(stats.net)}
            </div>
            <div
              className={`text-[10px] font-bold mt-0.5 ${
                trend ? (trend.up ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400'
              }`}
            >
              {trend
                ? `${trend.up ? '▲' : '▼'} ${Math.abs(trend.pct).toFixed(1)}% vs same elapsed period`
                : '\u00A0'}
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Net Profit</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <div className="font-mono-num font-extrabold text-xl text-emerald-700">
                {formatPeso(opsShiftLedger.trueNetProfit)}
              </div>
              {stats.net > 0 && (
                <span className="font-mono-num text-[11px] font-bold text-slate-500">
                  {((opsShiftLedger.trueNetProfit / stats.net) * 100).toFixed(1)}%
                </span>
              )}
            </div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5 truncate">
              {opsShiftLedger.expensesTotal > 0 || opsShiftLedger.serviceFeesTotal > 0
                ? `+Fees ${formatPeso(opsShiftLedger.serviceFeesTotal)} · −Gastos ${formatPeso(opsShiftLedger.expensesTotal)}`
                : noCapCount
                  ? `Sales − Capital · ${noCapCount} lack capital`
                  : 'Sales − Capital'}
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Orders</div>
            <div className="font-mono-num font-extrabold text-xl text-slate-900 mt-0.5">
              {stats.count}
            </div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5">
              {voided.length
                ? `${voided.length} voided (${formatPeso(sumPeso(voided, (s) => s.grandTotal))})`
                : '\u00A0'}
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Avg. Basket</div>
            <div className="font-mono-num font-extrabold text-xl text-slate-900 mt-0.5">
              {formatPeso(stats.count ? stats.net / stats.count : 0)}
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Items Sold</div>
            <div className="font-mono-num font-extrabold text-xl text-slate-900 mt-0.5">
              {Number(stats.items.toFixed(2))}
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Discounts Given</div>
            <div className="font-mono-num font-extrabold text-xl text-amber-600 mt-0.5">
              {formatPeso(stats.seniorDisc + stats.wholesaleDisc)}
            </div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5 truncate">
              SC/PWD {formatPeso(stats.seniorDisc)} · Wholesale {formatPeso(stats.wholesaleDisc)}
            </div>
          </div>
        </div>

        {/* Daily Sales Trend (Last 7 Days · Recharts) */}
        <div
          className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200"
          data-testid="daily-sales-trend-card"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>Daily Sales Trend</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Net sales performance across the last 7 days (excludes voided receipts)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">7-Day Total</div>
                <div className="font-mono-num text-sm font-extrabold text-emerald-700">
                  {formatPeso(last7DaysSummary.total)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Daily Avg</div>
                <div className="font-mono-num text-sm font-extrabold text-slate-800">
                  {formatPeso(last7DaysSummary.average)}
                </div>
              </div>
              {last7DaysSummary.bestDay && (
                <div className="hidden sm:block">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">
                    Peak ({last7DaysSummary.bestDay.label})
                  </div>
                  <div className="font-mono-num text-sm font-extrabold text-slate-800">
                    {formatPeso(last7DaysSummary.bestDay.netSales)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-full h-[210px]" data-testid="daily-sales-trend-chart">
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={last7DaysTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dailySalesNetGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                  dy={6}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  tickFormatter={(val: number) => {
                    if (val >= 1000) return `₱${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`;
                    return `₱${val}`;
                  }}
                />
                <Tooltip
                  cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const pt = payload[0].payload as {
                      fullDate: string;
                      netSales: number;
                      orders: number;
                    };
                    return (
                      <div className="bg-slate-900 text-white px-3 py-2 rounded-xl shadow-lg border border-slate-700 text-xs">
                        <div className="font-bold text-slate-300 mb-0.5">{pt.fullDate}</div>
                        <div className="font-mono-num font-extrabold text-emerald-400 text-sm">
                          {formatPeso(pt.netSales)}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {pt.orders} {pt.orders === 1 ? 'order' : 'orders'}
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="netSales"
                  name="Net Sales"
                  stroke="#059669"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#dailySalesNetGradient)"
                  dot={{ r: 3.5, fill: '#059669', stroke: '#ffffff', strokeWidth: 1.5 }}
                  activeDot={{ r: 5.5, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {last7DaysSummary.activeDays === 0 && (
            <p className="text-[11px] text-slate-400 text-center mt-1">
              No completed sales recorded in the last 7 days yet. Completed checkouts will appear here.
            </p>
          )}
        </div>

        {/* Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
          {/* Hourly Sales BarChart (Recharts) */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase">
                Sales by Hour ({range.label})
              </div>
            </div>

            {hourlySeries.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-[11px] text-slate-400">
                No sales in this period
              </div>
            ) : (
              <div className="w-full h-32">
                <ResponsiveContainer width="100%" height={128}>
                  <BarChart data={hourlySeries} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
                      tickFormatter={(v: number) => (v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`)}
                    />
                    <Tooltip
                      cursor={{ fill: '#f1f5f9' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const pt = payload[0].payload as { label: string; sales: number };
                        return (
                          <div className="bg-slate-900 text-white px-2.5 py-1.5 rounded-lg text-[11px] shadow-md">
                            <span className="text-slate-300 font-semibold">{pt.label}: </span>
                            <span className="font-mono-num font-bold text-emerald-400">
                              {formatPeso(pt.sales)}
                            </span>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="sales" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Top Products */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase mb-2">Top Products</div>
            <div className="space-y-1.5">
              {topProducts.length === 0 ? (
                <div className="text-[11px] text-slate-400">No sales in this period</div>
              ) : (
                topProducts.map(([n, v]) => {
                  const mx = topProducts[0][1].amt;
                  const pct = mx > 0 ? Math.max(4, Math.round((v.amt / mx) * 100)) : 0;
                  return (
                    <div key={n}>
                      <div className="flex justify-between gap-2 text-[11px]">
                        <span className="truncate font-semibold text-slate-700">{n}</span>
                        <span className="font-mono-num text-slate-500 shrink-0">
                          {Number(v.qty.toFixed(2))} {v.unit} · {formatPeso(v.amt)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 mt-0.5">
                        <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Payments & Categories */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase">
                Payments &amp; Categories
              </div>
              {payFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setPayFilter('ALL')}
                  className="text-[10px] font-bold text-indigo-700 hover:underline cursor-pointer"
                >
                  Clear ({payFilter})
                </button>
              )}
            </div>
            <div className="space-y-1 text-[11px] font-mono-num text-slate-700 mb-2">
              {Object.keys(stats.tender).length === 0 ? (
                <div className="text-slate-400 font-sans">No payments yet</div>
              ) : (
                Object.entries(stats.tender).map(([m, v]) => {
                  const activePay = payFilter === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayFilter(activePay ? 'ALL' : m)}
                      aria-pressed={activePay}
                      className={`w-full flex justify-between px-2 py-1 rounded-lg transition cursor-pointer ${
                        activePay
                          ? 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <span>
                        {m} ({v.n})
                      </span>
                      <span className="font-bold">{formatPeso(v.amt)}</span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="space-y-1.5">
              {topCats.map(([n, v]) => {
                const mx = topCats[0][1];
                const pct = mx > 0 ? Math.max(4, Math.round((v / mx) * 100)) : 0;
                return (
                  <div key={n}>
                    <div className="flex justify-between gap-2 text-[11px]">
                      <span className="truncate font-semibold text-slate-700">{n}</span>
                      <span className="font-mono-num text-slate-500 shrink-0">{formatPeso(v)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 mt-0.5">
                      <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Profit Ranking (ABC) */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Profit Ranking (ABC)</div>
            {abc.unknownCount > 0 && (
              <div className="text-[10px] font-semibold text-slate-400 text-right">
                {abc.unknownCount} sold item(s) have no capital and are not ranked
              </div>
            )}
          </div>
          <div className="text-[10px] text-slate-500 mb-2">
            A = items earning the top 70% of profit · B = next 20% · C = the rest (or losing money)
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto scroll-contain">
            {abc.ranked.length === 0 ? (
              <div className="text-[11px] text-slate-400">
                No sales with capital data in this period. Add capital to your items in Stock.
              </div>
            ) : (
              (() => {
                const mx = Math.max(...abc.ranked.map((r) => r.profit), 0);
                const clsColor = {
                  A: 'bg-emerald-100 text-emerald-700',
                  B: 'bg-amber-100 text-amber-800',
                  C: 'bg-slate-100 text-slate-600',
                };
                return abc.ranked.map((r) => {
                  const pct = mx > 0 && r.profit > 0 ? Math.max(3, Math.round((r.profit / mx) * 100)) : 0;
                  const margin = r.rev > 0 ? `${((r.profit / r.rev) * 100).toFixed(1)}%` : '—';
                  return (
                    <div key={r.name}>
                      <div className="flex justify-between gap-2 text-[11px]">
                        <span className="truncate font-semibold text-slate-700">
                          <span
                            className={`inline-block w-5 text-center rounded font-extrabold text-[10px] mr-1 ${clsColor[r.cls]}`}
                          >
                            {r.cls}
                          </span>
                          {r.name}
                        </span>
                        <span
                          className={`font-mono-num shrink-0 ${
                            r.profit < 0 ? 'text-rose-600 font-bold' : 'text-slate-600'
                          }`}
                        >
                          {Number(r.qty.toFixed(2))} {r.unit} · {margin} · {formatPeso(r.profit)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 mt-0.5">
                        <div
                          className={`h-1.5 rounded-full ${
                            r.cls === 'A' ? 'bg-emerald-500' : r.cls === 'B' ? 'bg-amber-500' : 'bg-slate-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                });
              })()
            )}
          </div>
        </div>

        {/* Receipts List Header & Bulk Expand */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">
            Receipts ({filteredList.length})
          </div>
          {visibleList.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (allVisibleExpanded) {
                  setExpandedReceipts(new Set());
                } else {
                  setExpandedReceipts(new Set(visibleList.map((s) => s.receiptNo)));
                }
              }}
              className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-bold text-slate-700 cursor-pointer"
            >
              {allVisibleExpanded ? 'Collapse All Items' : 'Expand All Items'}
            </button>
          )}
        </div>

        {/* Mobile Transactions List */}
        <div className="md:hidden space-y-2">
          {visibleList.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-400">
              No transactions match this view.
            </div>
          ) : (
            visibleList.map((s) => {
              const pr = saleProfitCalc(s, prodById, products);
              const isExpanded = expandedReceipts.has(s.receiptNo);
              return (
                <div
                  key={s.receiptNo}
                  className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono-num font-extrabold text-xs text-slate-900 truncate">
                        {s.receiptNo}
                      </span>
                      <span className="text-[11px] font-bold text-indigo-700">· {s.paymentMethod}</span>
                      {s.voided && (
                        <span className="text-[10px] font-extrabold text-rose-600">· VOID</span>
                      )}
                    </div>
                    <span
                      className={`font-mono-num font-extrabold text-sm ${
                        s.voided ? 'line-through text-slate-400' : 'text-emerald-700'
                      }`}
                    >
                      {formatPeso(s.grandTotal)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {s.dateFormatted} · {s.items.length} item(s) · Profit:{' '}
                    {s.voided || pr === null ? '—' : formatPeso(pr)}
                  </div>
                  {s.voided && s.voidReason && (
                    <div className="text-[10px] text-rose-600 font-semibold">
                      Void reason: {s.voidReason}
                    </div>
                  )}
                  {isExpanded && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1 text-[11px]">
                      {s.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between gap-2">
                          <span className="text-slate-700 truncate">
                            {it.name} ({formatQty(it.qty, it.unit)})
                          </span>
                          <span className="font-mono-num font-bold text-slate-900 shrink-0">
                            {formatPeso(it.lineTotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => toggleReceiptExpanded(s.receiptNo)}
                      className="px-3 py-1.5 min-h-[36px] rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      {isExpanded ? 'Hide Items' : 'Items'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onReprintReceipt(s)}
                      className="px-3 py-1.5 min-h-[36px] rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      Receipt
                    </button>
                    {!s.voided && (
                      <button
                        type="button"
                        onClick={() => onVoidSale(s.receiptNo)}
                        className="px-3 py-1.5 min-h-[36px] rounded-lg bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-600 cursor-pointer"
                      >
                        Void
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {filteredList.length > visibleList.length && (
            <button
              type="button"
              onClick={() => setShownCount((c) => c + 200)}
              className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
            >
              Show more ({visibleList.length} of {filteredList.length})
            </button>
          )}
        </div>

        {/* Desktop Transactions Table */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Date &amp; Time</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Profit</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {visibleList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-slate-400">
                    No transactions match this view.
                  </td>
                </tr>
              ) : (
                visibleList.map((s) => {
                  const pr = saleProfitCalc(s, prodById, products);
                  const isExpanded = expandedReceipts.has(s.receiptNo);
                  return (
                    <React.Fragment key={s.receiptNo}>
                      <tr className={`hover:bg-slate-50 transition ${s.voided ? 'bg-rose-50/40' : ''}`}>
                        <td className="py-3 px-4 font-mono-num font-bold text-xs text-slate-800">
                          <button
                            type="button"
                            onClick={() => toggleReceiptExpanded(s.receiptNo)}
                            aria-expanded={isExpanded}
                            className="inline-flex items-center gap-1.5 hover:text-emerald-700 cursor-pointer"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span>{s.receiptNo}</span>
                          </button>
                          {s.voided && (
                            <span className="ml-1.5 text-rose-600 text-[10px] font-extrabold">VOID</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500">{s.dateFormatted}</td>
                        <td className="py-3 px-4 text-xs text-slate-700">
                          {s.items.length} item(s)
                          {s.voided && s.voidReason && (
                            <span className="block text-[10px] text-rose-600">{s.voidReason}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold text-indigo-600">
                          {s.paymentMethod}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono-num font-extrabold ${
                            s.voided ? 'line-through text-slate-400' : 'text-emerald-700'
                          }`}
                        >
                          {formatPeso(s.grandTotal)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono-num font-bold text-xs ${
                            s.voided ? 'text-slate-400' : 'text-emerald-700'
                          }`}
                        >
                          {s.voided || pr === null ? '—' : formatPeso(pr)}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onReprintReceipt(s)}
                            aria-label={`Receipt ${s.receiptNo}`}
                            className="px-3 py-1.5 min-h-[34px] rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
                          >
                            Receipt
                          </button>
                          {!s.voided && (
                            <button
                              type="button"
                              onClick={() => onVoidSale(s.receiptNo)}
                              aria-label={`Void ${s.receiptNo}`}
                              className="px-3 py-1.5 min-h-[34px] rounded-lg bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-600 cursor-pointer"
                            >
                              Void
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={7} className="px-6 py-2.5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-[11px]">
                              {s.items.map((it, idx) => (
                                <div key={idx} className="flex justify-between gap-2 py-0.5 border-b border-slate-200/70">
                                  <span className="text-slate-700 truncate">
                                    {it.name} · <span className="text-slate-500">{formatQty(it.qty, it.unit)}</span>
                                  </span>
                                  <span className="font-mono-num font-bold text-slate-900 shrink-0">
                                    {formatPeso(it.lineTotal)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
              {filteredList.length > visibleList.length && (
                <tr>
                  <td colSpan={7} className="p-3">
                    <button
                      type="button"
                      onClick={() => setShownCount((c) => c + 200)}
                      className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      Show more ({visibleList.length} of {filteredList.length})
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
