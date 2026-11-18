import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  ClipboardCheck,
  Download,
  History,
  PackagePlus,
  Pencil,
  Percent,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Product, SaleRecord, StoreSettings } from '../types';
import {
  computeProductVelocities,
  computeStockHealthSummary,
  escapeCsvCell,
  expiryInfo,
  expiryLabel,
  formatPeso,
  lineTotalPeso,
} from '../utils/posMath';
import { CategoryBar } from './CategoryBar';
import { ProductIconBadge } from './ProductIconBadge';

export type StockFilter =
  | 'ALL'
  | 'LOW'
  | 'OUT'
  | 'FAST_LOW'
  | 'DEAD'
  | 'EXPIRED'
  | 'SOON'
  | 'NO_CAP'
  | 'LOSS';

type StockSort =
  | 'default'
  | 'cover-asc'
  | 'stock-asc'
  | 'stock-desc'
  | 'velocity-desc'
  | 'value-desc'
  | 'expiry-asc'
  | 'margin-asc'
  | 'name-asc';

interface InventoryViewProps {
  products: Product[];
  sales: SaleRecord[];
  settings: StoreSettings;
  selectedCategory: string;
  activeStockFilter?: StockFilter;
  onChangeStockFilter?: (f: StockFilter) => void;
  lowStockThreshold: number;
  expiryWarnDays: number;
  stockLogCount: number;
  searchQuery: string;
  onSetSearchQuery: (q: string) => void;
  onSelectCategory: (cat: string) => void;
  onOpenCategorySheet: () => void;
  onOpenScanner: () => void;
  onOpenScReview: () => void;
  onOpenReorder: () => void;
  onOpenBatchStock: (mode?: 'delta' | 'set') => void;
  onOpenCsvImport: () => void;
  onOpenStockLog: () => void;
  onOpenProductModal: (productId?: string) => void;
  onOpenStockAdjust: (productId: string) => void;
  onPullExpiredBatch?: () => void;
  onAskDeleteProduct: (productId: string) => void;
  onToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  sales,
  settings,
  selectedCategory,
  activeStockFilter,
  onChangeStockFilter,
  lowStockThreshold,
  expiryWarnDays,
  stockLogCount,
  searchQuery,
  onSetSearchQuery,
  onSelectCategory,
  onOpenCategorySheet,
  onOpenScanner,
  onOpenScReview,
  onOpenReorder,
  onOpenBatchStock,
  onOpenCsvImport,
  onOpenStockLog,
  onOpenProductModal,
  onOpenStockAdjust,
  onPullExpiredBatch,
  onAskDeleteProduct,
  onToast,
}) => {
  const [localFilter, setLocalFilter] = useState<StockFilter>('ALL');
  const stockFilter = activeStockFilter ?? localFilter;
  const setStockFilter = (next: StockFilter | ((prev: StockFilter) => StockFilter)) => {
    const resolved = typeof next === 'function' ? next(stockFilter) : next;
    setLocalFilter(resolved);
    onChangeStockFilter?.(resolved);
  };
  const [sortBy, setSortBy] = useState<StockSort>('default');
  const [shownCount, setShownCount] = useState(60);

  useEffect(() => {
    setShownCount(60);
  }, [searchQuery, stockFilter, selectedCategory, sortBy]);

  const kpis = useMemo(
    () => computeStockHealthSummary(products, sales, settings),
    [products, sales, settings],
  );

  const velocity = useMemo(
    () => computeProductVelocities(products, sales),
    [products, sales],
  );

  const expiryMap = useMemo(() => {
    const m = new Map<string, ReturnType<typeof expiryInfo>>();
    for (const p of products) {
      m.set(p.id, expiryInfo(p, expiryWarnDays));
    }
    return m;
  }, [products, expiryWarnDays]);

  const coverWarnDays =
    (Number(settings.reorderLeadDays) || 3) + (Number(settings.reorderSafetyDays) || 2);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      const st = expiryMap.get(p.id)?.status ?? 'none';
      const vel = velocity.byId.get(p.id);
      const cap = Number(p.capital) || 0;
      const isFastLow =
        p.stock > 0 && vel?.daysOfCover !== null && vel !== undefined && vel.daysOfCover <= coverWarnDays;
      const isLoss =
        cap > 0 && (p.retailPrice < cap || (p.wholesalePrice > 0 && p.wholesalePrice < cap));

      const matchF =
        stockFilter === 'ALL' ||
        (stockFilter === 'LOW' && p.stock > 0 && p.stock <= lowStockThreshold) ||
        (stockFilter === 'OUT' && p.stock <= 0) ||
        (stockFilter === 'FAST_LOW' && isFastLow) ||
        (stockFilter === 'DEAD' && !!vel?.isDeadStock) ||
        (stockFilter === 'EXPIRED' && st === 'expired') ||
        (stockFilter === 'SOON' && st === 'soon') ||
        (stockFilter === 'NO_CAP' && !(cap > 0)) ||
        (stockFilter === 'LOSS' && isLoss);

      const matchC = selectedCategory === 'All' || p.category === selectedCategory;
      return matchQ && matchF && matchC;
    });

    if (sortBy === 'default') return list;
    return [...list].sort((a, b) => {
      if (sortBy === 'stock-asc') return a.stock - b.stock;
      if (sortBy === 'stock-desc') return b.stock - a.stock;
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      if (sortBy === 'cover-asc') {
        const ca = velocity.byId.get(a.id)?.daysOfCover ?? 999999;
        const cb = velocity.byId.get(b.id)?.daysOfCover ?? 999999;
        return ca - cb;
      }
      if (sortBy === 'velocity-desc') {
        const va = velocity.byId.get(a.id)?.avgDaily ?? 0;
        const vb = velocity.byId.get(b.id)?.avgDaily ?? 0;
        return vb - va;
      }
      if (sortBy === 'value-desc') {
        return lineTotalPeso(b.retailPrice, b.stock) - lineTotalPeso(a.retailPrice, a.stock);
      }
      if (sortBy === 'expiry-asc') {
        const da = expiryMap.get(a.id)?.days ?? 999999;
        const db = expiryMap.get(b.id)?.days ?? 999999;
        return da - db;
      }
      if (sortBy === 'margin-asc') {
        const ma =
          Number(a.capital) > 0 && a.retailPrice > 0
            ? (a.retailPrice - Number(a.capital)) / a.retailPrice
            : 999;
        const mb =
          Number(b.capital) > 0 && b.retailPrice > 0
            ? (b.retailPrice - Number(b.capital)) / b.retailPrice
            : 999;
        return ma - mb;
      }
      return 0;
    });
  }, [
    products,
    searchQuery,
    stockFilter,
    selectedCategory,
    sortBy,
    lowStockThreshold,
    expiryMap,
    velocity.byId,
    coverWarnDays,
  ]);

  const visibleRows = filtered.slice(0, shownCount);
  const hasActiveFilters =
    stockFilter !== 'ALL' || selectedCategory !== 'All' || searchQuery.trim() !== '';

  const exportStockCsv = () => {
    const rows: (string | number)[][] = [
      [
        'ID',
        'Barcode',
        'Name',
        'Category',
        'Unit',
        'Capital',
        'Retail Price',
        'Wholesale Price',
        'Wholesale Min',
        'Stock',
        '30d Daily Velocity',
        'Est Days Cover',
        'Expiry',
        'SC/PWD',
      ],
    ];
    filtered.forEach((p) => {
      const vel = velocity.byId.get(p.id);
      rows.push([
        p.id,
        p.barcode,
        p.name,
        p.category,
        p.unit,
        p.capital || '',
        p.retailPrice,
        p.wholesalePrice,
        p.wholesaleMinQty,
        p.stock,
        vel && vel.avgDaily > 0 ? Number(vel.avgDaily.toFixed(2)) : 0,
        vel && vel.daysOfCover !== null ? Math.round(vel.daysOfCover) : '',
        p.expiry || '',
        p.scEligible === true ? 'Yes' : p.scEligible === false ? 'No' : 'Auto',
      ]);
    });
    const csv = '\uFEFF' + rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${new Date().toLocaleDateString('en-CA')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    onToast('Stock CSV downloaded');
  };

  const renderMarginBadge = (p: Product) => {
    const cap = Number(p.capital) || 0;
    if (!(cap > 0) || !(p.retailPrice > 0)) {
      return cap > 0 && p.retailPrice <= 0 ? (
        <span className="text-rose-600 font-extrabold">LOSS</span>
      ) : (
        <span className="text-slate-400">—</span>
      );
    }
    const pct = ((p.retailPrice - cap) / p.retailPrice) * 100;
    const txt = `${pct.toFixed(1)}%`;
    if (pct < 0) {
      return (
        <span className="text-rose-600 font-extrabold inline-flex items-center gap-0.5">
          <AlertTriangle className="w-3 h-3" />
          {txt}
        </span>
      );
    }
    if (pct < 10) return <span className="text-amber-600">{txt}</span>;
    return <span className="text-emerald-700">{txt}</span>;
  };

  const renderVelocityCell = (p: Product) => {
    const vel = velocity.byId.get(p.id);
    if (!vel || !velocity.hasSalesInWindow) {
      return <span className="text-slate-300">—</span>;
    }
    if (vel.isDeadStock) {
      return <span className="text-[11px] font-bold text-slate-400">0 sold ({velocity.windowDays}d)</span>;
    }
    if (vel.avgDaily <= 0) {
      return <span className="text-slate-300">—</span>;
    }
    const coverDays = vel.daysOfCover !== null ? Math.max(0, Math.round(vel.daysOfCover)) : null;
    const urgent = coverDays !== null && coverDays <= coverWarnDays;
    return (
      <span className="font-mono-num text-[11px] whitespace-nowrap">
        <span className={urgent ? 'font-extrabold text-amber-700' : 'font-bold text-slate-700'}>
          {coverDays !== null ? `~${coverDays}d` : '—'}
        </span>
        <span className="text-slate-400"> · {Number(vel.avgDaily.toFixed(1))}/d</span>
      </span>
    );
  };

  const renderExpiryCell = (p: Product) => {
    const e = expiryMap.get(p.id) ?? expiryInfo(p, expiryWarnDays);
    if (e.status === 'none') return <span className="text-slate-300">—</span>;
    const lbl = expiryLabel(p, expiryWarnDays);
    const cls =
      e.status === 'expired'
        ? 'text-rose-700'
        : e.status === 'soon'
          ? 'text-amber-700'
          : 'text-slate-500';
    return (
      <span className="font-mono-num text-[11px] whitespace-nowrap">
        <span className="text-slate-600">{p.expiry}</span>
        {lbl && <span className={`font-extrabold ml-1.5 ${cls}`}>{lbl}</span>}
      </span>
    );
  };

  const toggleFilter = (target: StockFilter) => {
    setStockFilter((prev) => (prev === target ? 'ALL' : target));
  };

  return (
    <section className="h-full flex flex-col overflow-y-auto md:overflow-hidden scroll-contain p-3 sm:p-4 lg:p-6 gap-2.5 sm:gap-3">
      {/* Interactive KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-2.5 shrink-0">
        <button
          type="button"
          onClick={() => setStockFilter('ALL')}
          className={`bg-white p-2.5 sm:p-3 rounded-2xl border text-left transition cursor-pointer ${
            stockFilter === 'ALL' ? 'border-emerald-500 ring-1 ring-emerald-500/40' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase">Total SKUs</div>
          <div className="font-mono-num font-extrabold text-base sm:text-lg text-slate-900 mt-0.5">{kpis.totalSkus}</div>
          <div className="text-[10px] font-bold text-slate-500 mt-0.5 truncate">
            {stockFilter === 'ALL' ? 'Showing all items' : `Filtered: ${filtered.length} shown`}
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleFilter(kpis.lossMarginCount > 0 ? 'LOSS' : 'ALL')}
          className={`bg-white p-2.5 sm:p-3 rounded-2xl border text-left transition cursor-pointer ${
            stockFilter === 'LOSS' ? 'border-rose-500 ring-1 ring-rose-500/40' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase">Stock Retail Value</div>
          <div className="font-mono-num font-extrabold text-base sm:text-lg text-emerald-700 mt-0.5">
            {formatPeso(kpis.stockRetailValue)}
          </div>
          <div
            className={`text-[10px] font-bold mt-0.5 truncate ${
              kpis.lossMarginCount > 0 ? 'text-rose-600' : 'text-slate-500'
            }`}
          >
            {kpis.lossMarginCount > 0
              ? `${kpis.lossMarginCount} below capital — tap`
              : `Est. profit ${formatPeso(kpis.potentialProfit)}`}
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleFilter(kpis.missingCapitalCount > 0 ? 'NO_CAP' : 'ALL')}
          className={`bg-white p-2.5 sm:p-3 rounded-2xl border text-left transition cursor-pointer ${
            stockFilter === 'NO_CAP' ? 'border-indigo-500 ring-1 ring-indigo-500/40' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase">Capital in Stock</div>
          <div className="font-mono-num font-extrabold text-base sm:text-lg text-indigo-700 mt-0.5">
            {formatPeso(kpis.capitalInStock)}
          </div>
          <div className="text-[10px] font-bold text-slate-500 mt-0.5 truncate">
            {kpis.missingCapitalCount
              ? `${kpis.missingCapitalCount} missing capital — tap`
              : 'All items have capital'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleFilter(kpis.fastLowCount > 0 ? 'FAST_LOW' : kpis.deadStockCount > 0 ? 'DEAD' : 'ALL')}
          className={`bg-white p-2.5 sm:p-3 rounded-2xl border text-left transition cursor-pointer ${
            stockFilter === 'FAST_LOW' || stockFilter === 'DEAD'
              ? 'border-amber-500 ring-1 ring-amber-500/40'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase">GMROI (30 days)</div>
          <div className="font-mono-num font-extrabold text-base sm:text-lg text-emerald-700 mt-0.5">{kpis.gmroi}</div>
          <div className="text-[10px] font-bold text-slate-500 mt-0.5 truncate">
            {kpis.fastLowCount > 0
              ? `${kpis.fastLowCount} ≤${coverWarnDays}d cover left`
              : kpis.deadStockCount > 0
                ? `${kpis.deadStockCount} dead stock (30d)`
                : 'Profit ÷ capital in stock'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleFilter('LOW')}
          className={`bg-white p-2.5 sm:p-3 rounded-2xl border text-left transition cursor-pointer ${
            stockFilter === 'LOW' ? 'border-amber-500 ring-1 ring-amber-500/40' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            Low Stock (≤{lowStockThreshold})
          </div>
          <div className="font-mono-num font-extrabold text-base sm:text-lg text-amber-600 mt-0.5">{kpis.lowCount}</div>
          <div className="text-[10px] font-bold text-slate-500 mt-0.5">Tap to filter low</div>
        </button>

        <button
          type="button"
          onClick={() => toggleFilter('OUT')}
          className={`bg-white p-2.5 sm:p-3 rounded-2xl border text-left transition cursor-pointer ${
            stockFilter === 'OUT' ? 'border-rose-500 ring-1 ring-rose-500/40' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase">Out of Stock</div>
          <div className="font-mono-num font-extrabold text-base sm:text-lg text-rose-600 mt-0.5">{kpis.outCount}</div>
          <div className="text-[10px] font-bold text-slate-500 mt-0.5">Tap to filter empty</div>
        </button>
      </div>

      {/* Inventory Toolbar — Balanced 2-tier layout */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200 flex flex-col gap-2 shrink-0">
        {/* Primary Row: Search + Scan on Row 1, Filter/Sort/Add on responsive wrap */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
          <div className="flex items-center gap-2 sm:flex-1 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSetSearchQuery(e.target.value)}
                placeholder="Search stock name or barcode..."
                aria-label="Search stock name or barcode"
                className="w-full pl-9 pr-8 min-h-[42px] bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSetSearchQuery('')}
                  aria-label="Clear stock search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onOpenScanner}
              className="px-3 min-h-[42px] rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Scan Stock</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as StockFilter)}
              aria-label="Filter stock status"
              className="w-full sm:w-auto px-3 min-h-[42px] rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700"
            >
              <option value="ALL">All Items ({kpis.totalSkus})</option>
              <option value="LOW">Low Stock (≤{lowStockThreshold})</option>
              <option value="OUT">Out of Stock ({kpis.outCount})</option>
              <option value="FAST_LOW">Running Out (≤{coverWarnDays}d cover)</option>
              <option value="DEAD">Slow / Dead Stock (30d)</option>
              <option value="EXPIRED">Expired ({kpis.expiredCount})</option>
              <option value="SOON">Expiring Soon ({kpis.soonCount})</option>
              <option value="NO_CAP">Missing Capital ({kpis.missingCapitalCount})</option>
              <option value="LOSS">Below Capital ({kpis.lossMarginCount})</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as StockSort)}
              aria-label="Sort stock"
              className="w-full sm:w-auto px-3 min-h-[42px] rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700"
            >
              <option value="default">Sort: Default</option>
              <option value="cover-asc">Cover: Soonest Out</option>
              <option value="velocity-desc">Fastest Moving (30d)</option>
              <option value="stock-asc">Stock: Low → High</option>
              <option value="stock-desc">Stock: High → Low</option>
              <option value="value-desc">Highest Value</option>
              <option value="expiry-asc">Expiry: Soonest</option>
              <option value="margin-asc">Margin: Low → High</option>
              <option value="name-asc">Name: A → Z</option>
            </select>
            <button
              type="button"
              onClick={() => onOpenProductModal()}
              className="col-span-2 sm:col-span-1 px-4 min-h-[42px] rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 sm:ml-auto cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Product</span>
            </button>
          </div>
        </div>

        {/* Utility Row: Single horizontal strip on mobile, clean left-aligned actions on desktop */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onOpenBatchStock('delta')}
            className="px-3 min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Batch / Audit</span>
          </button>
          <button
            type="button"
            onClick={onOpenStockLog}
            className="px-3 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>History{stockLogCount > 0 ? ` (${stockLogCount})` : ''}</span>
          </button>
          <button
            type="button"
            onClick={onOpenReorder}
            className="px-3 min-h-[40px] rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-300 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PackagePlus className="w-3.5 h-3.5" />
            <span>Reorder</span>
          </button>
          <button
            type="button"
            onClick={onOpenScReview}
            className="px-3 min-h-[40px] rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Percent className="w-3.5 h-3.5" />
            <span>SC/PWD</span>
          </button>
          <button
            type="button"
            onClick={onOpenCsvImport}
            className="px-3 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV</span>
          </button>
          <button
            type="button"
            onClick={exportStockCsv}
            className="px-3 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Expiry Alert Banner */}
      {(kpis.expiredCount > 0 || kpis.soonCount > 0) && (
        <div
          className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold flex flex-wrap items-center gap-x-3 gap-y-1.5 ${
            kpis.expiredCount
              ? 'border-rose-300 bg-rose-50 text-rose-700'
              : 'border-amber-300 bg-amber-50 text-amber-800'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Expiry alert:
          </span>
          {kpis.expiredCount > 0 && (
            <button
              type="button"
              onClick={() => setStockFilter('EXPIRED')}
              className="underline cursor-pointer"
            >
              {kpis.expiredCount} expired — filter view
            </button>
          )}
          {kpis.soonCount > 0 && (
            <button
              type="button"
              onClick={() => setStockFilter('SOON')}
              className="underline cursor-pointer"
            >
              {kpis.soonCount} expiring within {expiryWarnDays} days
            </button>
          )}
          {kpis.expiredCount > 0 && onPullExpiredBatch && (
            <button
              type="button"
              onClick={onPullExpiredBatch}
              data-testid="pull-expired-batch-btn"
              className="ml-auto px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
            >
              Pull Expired (Batch Audit)
            </button>
          )}
        </div>
      )}

      {/* Stock Category Pills */}
      <CategoryBar
        products={products}
        selectedCategory={selectedCategory}
        lowStockThreshold={lowStockThreshold}
        mode="inventory"
        onSelectCategory={onSelectCategory}
        onOpenSheet={onOpenCategorySheet}
      />

      {/* Active Filter Status Bar */}
      {hasActiveFilters && (
        <div
          data-testid="inventory-active-filter-bar"
          className="shrink-0 bg-slate-900 text-white rounded-xl px-3 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono-num font-bold text-emerald-400">
              {filtered.length} matching item{filtered.length === 1 ? '' : 's'}
            </span>
            {stockFilter !== 'ALL' && (
              <span className="text-slate-300">· Filter: {stockFilter.replace('_', ' ')}</span>
            )}
            {selectedCategory !== 'All' && (
              <span className="text-slate-300">· Category: {selectedCategory}</span>
            )}
            {searchQuery.trim() && (
              <span className="text-slate-300">· Query: &ldquo;{searchQuery.trim()}&rdquo;</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setStockFilter('ALL');
              onSelectCategory('All');
              onSetSearchQuery('');
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Mobile Card List */}
      <div className="md:hidden space-y-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {visibleRows.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
            No matching stock items.
          </div>
        ) : (
          visibleRows.map((p) => (
            <div
              key={p.id}
              className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center justify-between gap-2"
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <ProductIconBadge product={p} size="md" muted={p.stock <= 0} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-xs text-slate-900 truncate">{p.name}</div>
                  <div className="text-[11px] font-mono-num text-slate-500">
                    {p.barcode} · {formatPeso(p.retailPrice)}/{p.unit}
                  </div>
                  <div className="text-[11px] font-mono-num text-slate-500">
                    Cap: {Number(p.capital) > 0 ? formatPeso(p.capital) : '—'}/{p.unit} · Margin:{' '}
                    {renderMarginBadge(p)}
                  </div>
                  <div className="text-[11px] font-mono-num mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span
                      className={`font-bold ${
                        p.stock <= 0
                          ? 'text-rose-600'
                          : p.stock <= lowStockThreshold
                            ? 'text-amber-600'
                            : 'text-emerald-700'
                      }`}
                    >
                      Stock: {p.stock} {p.unit}
                    </span>
                    {velocity.hasSalesInWindow && (
                      <span className="text-slate-500">· Cover: {renderVelocityCell(p)}</span>
                    )}
                  </div>
                  {p.expiry && <div className="text-[11px] mt-0.5">Exp: {renderExpiryCell(p)}</div>}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenStockAdjust(p.id)}
                  aria-label={`Adjust stock for ${p.name}`}
                  title="Restock / Audit Stock"
                  className="min-w-[44px] h-11 px-2.5 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs cursor-pointer"
                >
                  ±
                </button>
                <button
                  type="button"
                  onClick={() => onOpenProductModal(p.id)}
                  aria-label={`Edit ${p.name}`}
                  className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onAskDeleteProduct(p.id)}
                  aria-label={`Delete ${p.name}`}
                  className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
        {filtered.length > visibleRows.length && (
          <button
            type="button"
            onClick={() => setShownCount((c) => c + 60)}
            className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
          >
            Show more ({visibleRows.length} of {filtered.length})
          </button>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block flex-1 overflow-y-auto scroll-contain bg-white rounded-2xl border border-slate-200">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase sticky top-0 z-10">
            <tr>
              <th className="py-3 px-4">Barcode</th>
              <th className="py-3 px-4">Product Name</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4 text-right">Capital</th>
              <th className="py-3 px-4 text-right">Retail Price</th>
              <th className="py-3 px-4 text-right">Margin</th>
              <th className="py-3 px-4 text-center">Stock</th>
              <th className="py-3 px-4">Cover (30d)</th>
              <th className="py-3 px-4">Expiry</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 text-center text-xs text-slate-400">
                  No matching stock items.
                </td>
              </tr>
            ) : (
              visibleRows.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono-num text-slate-500">{p.barcode}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ProductIconBadge product={p} size="sm" muted={p.stock <= 0} />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900">{p.name}</div>
                        {p.wholesalePrice > 0 && p.wholesalePrice < p.retailPrice && (
                          <div className="text-[10px] font-mono-num text-indigo-600">
                            Whls: {formatPeso(p.wholesalePrice)} ({p.wholesaleMinQty}+)
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">{p.category}</td>
                  <td className="py-2.5 px-4 text-right font-mono-num text-slate-600">
                    {Number(p.capital) > 0 ? formatPeso(p.capital) : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-num font-bold text-emerald-700">
                    {formatPeso(p.retailPrice)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-num font-bold">
                    {renderMarginBadge(p)}
                  </td>
                  <td
                    className={`py-2.5 px-4 text-center font-mono-num font-bold whitespace-nowrap ${
                      p.stock <= 0
                        ? 'text-rose-600'
                        : p.stock <= lowStockThreshold
                          ? 'text-amber-600'
                          : 'text-slate-800'
                    }`}
                  >
                    {p.stock} {p.unit}
                  </td>
                  <td className="py-2.5 px-4">{renderVelocityCell(p)}</td>
                  <td className="py-2.5 px-4 text-[11px]">{renderExpiryCell(p)}</td>
                  <td className="py-2.5 px-4 text-right space-x-1 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpenStockAdjust(p.id)}
                      aria-label={`Adjust stock for ${p.name}`}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold cursor-pointer"
                    >
                      ± Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenProductModal(p.id)}
                      aria-label={`Edit ${p.name}`}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onAskDeleteProduct(p.id)}
                      aria-label={`Delete ${p.name}`}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
            {filtered.length > visibleRows.length && (
              <tr>
                <td colSpan={10} className="p-3">
                  <button
                    type="button"
                    onClick={() => setShownCount((c) => c + 60)}
                    className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    Show more ({visibleRows.length} of {filtered.length})
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

