import React, { useMemo, useState } from 'react';
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

interface InventoryViewProps {
  products: Product[];
  sales: SaleRecord[];
  settings: StoreSettings;
  selectedCategory: string;
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
  onAskDeleteProduct: (productId: string) => void;
  onToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
}

type StockFilter =
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

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  sales,
  settings,
  selectedCategory,
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
  onAskDeleteProduct,
  onToast,
}) => {
  const [stockFilter, setStockFilter] = useState<StockFilter>('ALL');
  const [sortBy, setSortBy] = useState<StockSort>('default');

  const kpis = useMemo(
    () => computeStockHealthSummary(products, sales, settings),
    [products, sales, settings],
  );

  const velocity = useMemo(
    () => computeProductVelocities(products, sales),
    [products, sales],
  );

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
      const st = expiryInfo(p, expiryWarnDays).status;
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
        const da = expiryInfo(a, expiryWarnDays).days ?? 999999;
        const db = expiryInfo(b, expiryWarnDays).days ?? 999999;
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
    expiryWarnDays,
    velocity.byId,
    coverWarnDays,
  ]);

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
    const e = expiryInfo(p, expiryWarnDays);
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
        {/* Primary Row: Search, Filters, Scan, Add Product */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSetSearchQuery(e.target.value)}
              placeholder="Search stock name or barcode..."
              aria-label="Search stock name or barcode"
              className="w-full pl-9 pr-8 min-h-[42px] bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as StockFilter)}
            aria-label="Filter stock status"
            className="px-3 min-h-[42px] rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700"
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
            className="px-3 min-h-[42px] rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700"
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
            className="px-4 min-h-[42px] rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 ml-auto cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Product</span>
          </button>
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
          className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold flex flex-wrap items-center gap-x-3 gap-y-1 ${
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
              {kpis.expiredCount} expired — pull from shelf
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

      {/* Mobile Card List */}
      <div className="md:hidden space-y-2 pb-6">
        {filtered.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
            No matching stock items.
          </div>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 text-center text-xs text-slate-400">
                  No matching stock items.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono-num text-slate-500">{p.barcode}</td>
                  <td className="py-2.5 px-4">
                    <div className="font-bold text-slate-900">{p.name}</div>
                    {p.wholesalePrice > 0 && p.wholesalePrice < p.retailPrice && (
                      <div className="text-[10px] font-mono-num text-indigo-600">
                        Whls: {formatPeso(p.wholesalePrice)} ({p.wholesaleMinQty}+)
                      </div>
                    )}
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
          </tbody>
        </table>
      </div>
    </section>
  );
};

