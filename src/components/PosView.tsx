import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Barcode,
  Camera,
  ChevronDown,
  Filter,
  History,
  Monitor,
  Pause,
  ShoppingBasket,
  ShoppingCart,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { CartLine, CartTotals, PriceType, Product, SaleRecord } from '../types';
import {
  buildProductMap,
  expiryInfo,
  expiryLabel,
  formatPeso,
  getLinePrice,
  isWholesaleLine,
  linePricing,
  lineTotalPeso,
  scEligibleLine,
  wholesaleBlock,
  type QuickActionsDock,
} from '../utils/posMath';
import { getEffectiveLowStockThreshold } from '../utils/stockAlerts';
import {
  loadQuickActionsDockFromStorage,
  saveQuickActionsDockToStorage,
} from '../utils/storage';
import { CategoryBar } from './CategoryBar';
import { PosQuickActions } from './PosQuickActions';
import { ProductIconBadge } from './ProductIconBadge';

interface PosViewProps {
  products: Product[];
  cart: CartLine[];
  totals: CartTotals;
  priceMode: PriceType;
  selectedCategory: string;
  searchQuery: string;
  lowStockThreshold: number;
  expiryWarnDays: number;
  heldCount: number;
  isSeniorPwd: boolean;
  mobileCartOpen: boolean;
  fastMoverIds?: Set<string>;
  lastVoidableSale: SaleRecord | null;
  onSetSearchQuery: (q: string) => void;
  onSearchEnter: (q: string) => void;
  onSetPriceMode: (mode: PriceType) => void;
  onSelectCategory: (cat: string) => void;
  onOpenCategorySheet: () => void;
  onOpenScanner: () => void;
  onOpenRapidScanner: () => void;
  onReprintLastSale: () => void;
  onVoidLastSale: () => void;
  onProductClick: (productId: string) => void;
  onChangeCartQty: (productId: string, delta: number) => void;
  onSetCartQty: (productId: string, rawValue: string) => void;
  onRemoveCartLine: (productId: string) => void;
  onSetLinePriceType: (productId: string, type: PriceType) => void;
  onUnlockWholesaleLine?: (productId: string, minQty: number) => void;
  onToggleSeniorPwd: (checked: boolean) => void;
  onHoldCart: () => void;
  onOpenHeldModal: () => void;
  onClearCart: () => void;
  onOpenCheckout: () => void;
  onOpenMobileCart: () => void;
  onCloseMobileCart: () => void;
  onOpenCustomerDisplay?: () => void;
}

interface ProductTileProps {
  product: Product;
  inCartQty: number;
  priceMode: PriceType;
  lowStockThreshold: number;
  expiryWarnDays: number;
  onProductClick: (productId: string) => void;
}

const ProductTile = memo<ProductTileProps>(
  ({ product: p, inCartQty, priceMode, lowStockThreshold, expiryWarnDays, onProductClick }) => {
    const exInfo = expiryInfo(p, expiryWarnDays);
    const expired = exInfo.status === 'expired';
    const out = p.stock <= 0 || expired;
    const low = p.stock > 0 && p.stock <= getEffectiveLowStockThreshold(p, lowStockThreshold);
    const hasWholesale = p.wholesalePrice > 0 && p.wholesalePrice < p.retailPrice;

    return (
      <button
        type="button"
        onClick={() => onProductClick(p.id)}
        disabled={out}
        className={`relative block w-full text-left bg-white p-2.5 sm:p-3 rounded-xl border transition pos-ease cursor-pointer ${
          out
            ? 'border-slate-200/80 bg-slate-50/50 opacity-60 cursor-not-allowed'
            : inCartQty > 0
              ? 'border-emerald-500 ring-1 ring-emerald-500/30 bg-emerald-50/20 hover:border-emerald-600 active:scale-[0.985]'
              : 'border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/40 active:scale-[0.985]'
        }`}
      >
        <div className="w-full h-full min-h-[112px] flex flex-col justify-between gap-2">
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <ProductIconBadge product={p} size="sm" muted={out} />
              <div className="min-w-0 flex-1 text-right flex flex-col items-end gap-0.5">
                <div className="flex items-center justify-end gap-1.5">
                  {inCartQty > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white font-mono-num text-[10px] font-bold leading-none">
                      ×{Number(inCartQty.toFixed(3))}
                    </span>
                  )}
                  <span
                    className={`text-[11px] font-mono-num font-bold leading-tight ${
                      out ? 'text-rose-600' : low ? 'text-amber-600' : 'text-slate-600'
                    }`}
                  >
                    {expired ? 'EXPIRED' : p.stock <= 0 ? 'OUT' : `${p.stock} ${p.unit}`}
                  </span>
                </div>
                <span className="text-[10.5px] text-slate-500 font-medium truncate max-w-full">
                  {p.category}
                </span>
              </div>
            </div>

            <div className="font-semibold text-[13px] text-slate-900 line-clamp-2 leading-snug min-h-[34px]">
              {p.name}
            </div>

            {(exInfo.status === 'expired' || exInfo.status === 'soon') && (
              <div
                className={`text-[10.5px] font-semibold flex items-center gap-1 ${
                  expired ? 'text-rose-600' : 'text-amber-600'
                }`}
              >
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span className="truncate">{expiryLabel(p, expiryWarnDays)}</span>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-col gap-0.5">
            <div className="font-mono-num font-extrabold text-[15px] text-slate-900 leading-tight whitespace-nowrap">
              {formatPeso(p.retailPrice)}
              <span className="text-[10.5px] font-normal text-slate-400">/{p.unit}</span>
            </div>
            {hasWholesale && (
              <div
                className={`text-[10.5px] font-mono-num font-semibold leading-tight whitespace-nowrap ${
                  priceMode === 'wholesale' ? 'text-indigo-700' : 'text-indigo-600/85'
                }`}
              >
                {formatPeso(p.wholesalePrice)} ({p.wholesaleMinQty}+)
              </div>
            )}
          </div>
        </div>
      </button>
    );
  },
);
ProductTile.displayName = 'ProductTile';

export const PosView: React.FC<PosViewProps> = ({
  products,
  cart,
  totals,
  priceMode,
  selectedCategory,
  searchQuery,
  lowStockThreshold,
  expiryWarnDays,
  heldCount,
  isSeniorPwd,
  mobileCartOpen,
  fastMoverIds,
  lastVoidableSale,
  onSetSearchQuery,
  onSearchEnter,
  onSetPriceMode,
  onSelectCategory,
  onOpenCategorySheet,
  onOpenScanner,
  onOpenRapidScanner,
  onReprintLastSale,
  onVoidLastSale,
  onProductClick,
  onChangeCartQty,
  onSetCartQty,
  onRemoveCartLine,
  onSetLinePriceType,
  onUnlockWholesaleLine,
  onToggleSeniorPwd,
  onHoldCart,
  onOpenHeldModal,
  onClearCart,
  onOpenCheckout,
  onOpenMobileCart,
  onCloseMobileCart,
  onOpenCustomerDisplay,
}) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const gridBoundsRef = useRef<HTMLDivElement>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [fastMoversOnly, setFastMoversOnly] = useState(false);
  const [quickActionsDock, setQuickActionsDock] = useState<QuickActionsDock>(() =>
    loadQuickActionsDockFromStorage(),
  );

  const handleChangeQuickActionsDock = (nextDock: QuickActionsDock) => {
    setQuickActionsDock(nextDock);
    saveQuickActionsDockToStorage(nextDock);
  };

  // Focus search with `/` or `Ctrl+K` / `Cmd+K` when not typing in another field
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
      if ((e.key === '/' && !isInput) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const productMap = useMemo(() => buildProductMap(products), [products]);
  const hasFastMovers = Boolean(fastMoverIds && fastMoverIds.size > 0);

  const cartQtyMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const line of cart) {
      m.set(line.productId, line.qty);
    }
    return m;
  }, [cart]);

  const filteredProducts = useMemo(() => {
    const raw = searchQuery.trim();
    const multMatch = raw.match(/^\d+(?:\.\d{1,3})?\s*\*\s*(.*)$/);
    const q = (multMatch ? multMatch[1] : raw).trim().toLowerCase();

    return products.filter((p) => {
      if (fastMoversOnly && fastMoverIds && fastMoverIds.size > 0 && !fastMoverIds.has(p.id)) {
        return false;
      }
      if (inStockOnly) {
        if (p.stock <= 0 || expiryInfo(p, expiryWarnDays).status === 'expired') return false;
      }
      const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
      if (!matchCat) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategory, searchQuery, inStockOnly, fastMoversOnly, fastMoverIds, expiryWarnDays]);

  return (
    <section className="h-full flex flex-col md:flex-row overflow-hidden relative">
      {/* LEFT: PRODUCT BROWSER & BARCODE SEARCH */}
      <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden p-2.5 sm:p-3.5 lg:p-4 gap-2.5">
        {/* Search & Scan Row */}
        <div className="bg-white p-1.5 rounded-xl border border-slate-200/90 flex items-center gap-2 shrink-0">
          <div className="relative flex-1 min-w-0">
            <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={(e) => onSetSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSearchEnter(searchQuery);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (searchQuery) {
                    onSetSearchQuery('');
                  } else {
                    e.currentTarget.blur();
                  }
                }
              }}
              inputMode="search"
              enterKeyHint="search"
              placeholder="Search item, barcode, or 5*code... [/]"
              aria-label="Search item or scan barcode"
              className="w-full pl-9 pr-9 py-2 min-h-[42px] bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-colors"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  onSetSearchQuery('');
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onOpenScanner}
            className="justify-center px-3.5 py-2 min-h-[42px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.98] font-semibold text-xs flex items-center gap-1.5 transition pos-ease whitespace-nowrap shrink-0 cursor-pointer"
            title="Scan Barcode with Camera (F8)"
          >
            <Camera className="w-4 h-4" />
            <span>Scan</span>
          </button>
        </div>

        {/* Retail / Wholesale Price Mode & Quick Filters */}
        <div className="flex items-center justify-between gap-2 shrink-0 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="inline-flex p-0.5 rounded-xl bg-slate-200/80 border border-slate-200/90 shrink-0"
              role="group"
              aria-label="Price mode"
            >
              <button
                type="button"
                onClick={() => onSetPriceMode('retail')}
                className={`px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold transition pos-ease cursor-pointer ${
                  priceMode === 'retail'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Retail
              </button>
              <button
                type="button"
                onClick={() => onSetPriceMode('wholesale')}
                className={`px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold transition pos-ease cursor-pointer ${
                  priceMode === 'wholesale'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Wholesale
              </button>
            </div>
            <span className="hidden lg:inline text-[11px] font-medium text-slate-500 leading-tight truncate">
              {priceMode === 'wholesale'
                ? 'Wholesale tier applies at min qty'
                : 'Standard retail pricing'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {hasFastMovers && (
              <button
                type="button"
                onClick={() => setFastMoversOnly((v) => !v)}
                aria-pressed={fastMoversOnly}
                data-testid="pos-fast-movers-btn"
                className={`px-2.5 py-1.5 min-h-[34px] rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition pos-ease cursor-pointer whitespace-nowrap ${
                  fastMoversOnly
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-slate-700 border-slate-200/90 hover:bg-slate-50'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Fast Movers ({fastMoverIds!.size})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setInStockOnly((v) => !v)}
              aria-pressed={inStockOnly}
              className={`px-2.5 py-1.5 min-h-[34px] rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition pos-ease cursor-pointer whitespace-nowrap ${
                inStockOnly
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200/90 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-3 h-3" />
              <span>In Stock Only</span>
            </button>
            {onOpenCustomerDisplay && (
              <button
                type="button"
                onClick={onOpenCustomerDisplay}
                data-testid="pos-customer-display-btn"
                title="Customer Display & Payment QR Screen"
                className="px-2.5 py-1.5 min-h-[34px] rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold flex items-center gap-1.5 transition pos-ease cursor-pointer whitespace-nowrap"
              >
                <Monitor className="w-3.5 h-3.5 text-emerald-600" />
                <span>2nd Screen</span>
              </button>
            )}
            <span className="text-[11px] font-mono-num font-medium text-slate-500 hidden sm:inline pl-1">
              {filteredProducts.length}/{products.length}
            </span>
          </div>
        </div>

        {/* Category Filter Bar */}
        <CategoryBar
          products={products}
          selectedCategory={selectedCategory}
          lowStockThreshold={lowStockThreshold}
          mode="pos"
          onSelectCategory={onSelectCategory}
          onOpenSheet={onOpenCategorySheet}
        />

        {/* Responsive Product Grid + Floating Quick Actions Dock */}
        <div ref={gridBoundsRef} className="relative flex-1 min-h-0 flex flex-col">
          <div
            className={`flex-1 overflow-y-auto scroll-contain grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-2.5 content-start ${
              quickActionsDock.startsWith('top-')
                ? 'pt-11 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-3'
                : 'pb-[calc(6.75rem+env(safe-area-inset-bottom))] md:pb-14'
            }`}
          >
            {filteredProducts.length === 0 ? (
              <div className="col-span-full py-12 text-center text-xs text-slate-500 space-y-2">
                <p>No matching products found.</p>
                {(searchQuery || selectedCategory !== 'All' || inStockOnly || fastMoversOnly) && (
                  <button
                    type="button"
                    onClick={() => {
                      onSetSearchQuery('');
                      onSelectCategory('All');
                      setInStockOnly(false);
                      setFastMoversOnly(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              filteredProducts.map((p) => (
                <ProductTile
                  key={p.id}
                  product={p}
                  inCartQty={cartQtyMap.get(p.id) || 0}
                  priceMode={priceMode}
                  lowStockThreshold={lowStockThreshold}
                  expiryWarnDays={expiryWarnDays}
                  onProductClick={onProductClick}
                />
              ))
            )}
          </div>

          <PosQuickActions
            dock={quickActionsDock}
            boundsRef={gridBoundsRef}
            priceMode={priceMode}
            isSeniorPwd={isSeniorPwd}
            lastVoidableSale={lastVoidableSale}
            cartCount={cart.length}
            heldCount={heldCount}
            hidden={mobileCartOpen}
            onChangeDock={handleChangeQuickActionsDock}
            onQuickScan={onOpenScanner}
            onRapidScan={onOpenRapidScanner}
            onTogglePriceMode={() => onSetPriceMode(priceMode === 'retail' ? 'wholesale' : 'retail')}
            onToggleSeniorPwd={() => onToggleSeniorPwd(!isSeniorPwd)}
            onReprintLastSale={onReprintLastSale}
            onVoidLastSale={onVoidLastSale}
            onHoldCart={onHoldCart}
            onOpenHeldModal={onOpenHeldModal}
            onClearCart={onClearCart}
            onOpenCheckout={onOpenCheckout}
          />
        </div>
      </div>

      {/* Mobile Bottom Floating Cart Bar (compact to stay within 15% mobile sticky cap) */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-slate-950 text-white px-3 py-1.5 pb-safe border-t border-slate-800 flex items-center justify-between gap-2 z-20 shadow-xl">
        <button
          type="button"
          onClick={onOpenMobileCart}
          className="flex items-center gap-2.5 text-left min-w-0 flex-1 min-h-[44px] cursor-pointer"
        >
          <div className="relative w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
            <ShoppingCart className="w-4 h-4" />
            <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-extrabold text-[10px] font-mono-num leading-none">
              {cart.length}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-[10.5px] text-slate-400 font-semibold">Basket</div>
            <div className="font-mono-num font-extrabold text-sm text-emerald-400 leading-tight">
              {formatPeso(totals.grandTotal)}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={onOpenCheckout}
          disabled={cart.length === 0}
          className="px-4 py-2 min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-extrabold text-xs shrink-0 transition-colors cursor-pointer"
        >
          Pay Now
        </button>
      </div>

      {/* Mobile Cart Drawer Backdrop */}
      {mobileCartOpen && (
        <div
          onClick={onCloseMobileCart}
          className="md:hidden fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-30"
        />
      )}

      {/* RIGHT / MOBILE DRAWER: ORDER BASKET */}
      <aside
        className={`fixed md:static inset-x-0 bottom-0 h-[84dvh] md:h-full w-full md:w-[376px] lg:w-[416px] bg-white border-t md:border-t-0 md:border-l border-slate-200 rounded-t-2xl md:rounded-none shadow-2xl md:shadow-none flex flex-col z-40 md:z-10 transition-transform duration-200 shrink-0 ${
          mobileCartOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'
        }`}
      >
        <div className="md:hidden w-10 h-1 rounded-full bg-slate-300 mx-auto mt-2 shrink-0" />
        {/* Cart Header */}
        <div className="px-4 py-2.5 sm:py-3 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-bold text-sm text-slate-900">Order Basket</h2>
            <span className="text-xs text-slate-500 font-medium font-mono-num">
              · {cart.length} {cart.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onHoldCart}
              disabled={cart.length === 0}
              className="px-2.5 py-1.5 min-h-[34px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title="Park / Hold Order (F4)"
            >
              <Pause className="w-3 h-3 text-amber-600" />
              <span>Hold</span>
            </button>
            <button
              type="button"
              onClick={onOpenHeldModal}
              className="relative px-2.5 py-1.5 min-h-[34px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title="Recall Parked Orders"
              aria-label={`Parked orders (${heldCount})`}
            >
              <History className="w-3.5 h-3.5 text-indigo-600" />
              {heldCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-mono-num font-bold leading-none">
                  {heldCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onClearCart}
              disabled={cart.length === 0}
              className="px-2.5 py-1.5 min-h-[34px] rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 disabled:opacity-40 text-rose-600 text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer"
              title="Clear Basket"
              aria-label="Clear basket"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onCloseMobileCart}
              aria-label="Close basket drawer"
              className="md:hidden w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Cart Lines — Flat Hairline List for Higher Scannability */}
        <div className="flex-1 overflow-y-auto scroll-contain divide-y divide-slate-100">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 px-6 py-10">
              <ShoppingBasket className="w-10 h-10 mb-2.5 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">Basket is empty</p>
              <p className="text-xs text-slate-400 mt-1">
                Tap any item on the left, scan a barcode, or type 5*barcode
              </p>
            </div>
          ) : (
            cart.map((item) => {
              const isW = isWholesaleLine(item, productMap);
              const pr = linePricing(item, productMap);
              const block = wholesaleBlock(item, productMap);
              const activePrice = getLinePrice(item, productMap);
              const lineTotal = lineTotalPeso(activePrice, item.qty);
              const hasW = block !== 'none';
              const wantsW = item.priceType === 'wholesale';
              const prod = productMap.get(item.productId);
              const stk = Number(prod?.stock) || 0;
              const need = Number((pr.minQty - item.qty).toFixed(3));
              const savedPeso = isW
                ? Math.max(0, Number(((pr.retail - pr.wholesale) * item.qty).toFixed(2)))
                : 0;

              return (
                <div
                  key={item.productId}
                  className={`px-3.5 py-2.5 transition-colors ${isW ? 'bg-indigo-50/25' : 'bg-white'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <ProductIconBadge product={prod || item} size="xs" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs sm:text-[13px] text-slate-900 truncate">
                          {item.name}
                        </div>
                        <div className="text-[11px] font-mono-num text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                          <span>
                            {formatPeso(activePrice)}/{item.unit}
                          </span>
                          {isW && (
                            <span className="font-sans text-indigo-700 font-semibold text-[10.5px]">
                              · Wholesale{savedPeso > 0 ? ` (−${formatPeso(savedPeso)})` : ''}
                            </span>
                          )}
                          {isSeniorPwd && scEligibleLine(item, productMap) && (
                            <span className="font-sans text-amber-700 font-semibold text-[10.5px]">
                              · SC/PWD 5%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onChangeCartQty(item.productId, -1)}
                        aria-label={`Decrease quantity for ${item.name}`}
                        className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm sm:text-xs cursor-pointer"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step={item.unit === 'kg' ? '0.001' : '1'}
                        value={item.qty}
                        aria-label={`Quantity for ${item.name}`}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => onSetCartQty(item.productId, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        className="w-12 h-9 sm:h-8 text-center font-mono-num font-bold text-sm sm:text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => onChangeCartQty(item.productId, 1)}
                        aria-label={`Increase quantity for ${item.name}`}
                        className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm sm:text-xs cursor-pointer"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveCartLine(item.productId)}
                        aria-label={`Remove ${item.name}`}
                        className="w-8 h-9 sm:w-7 sm:h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="w-16 text-right font-mono-num font-bold text-xs sm:text-[13px] text-slate-900 shrink-0">
                      {formatPeso(lineTotal)}
                    </div>
                  </div>

                  {hasW && (
                    <div className="mt-2 pl-9 flex flex-wrap items-center gap-2">
                      <div
                        className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200/80"
                        role="group"
                        aria-label={`Price type for ${item.name}`}
                      >
                        <button
                          type="button"
                          onClick={() => onSetLinePriceType(item.productId, 'retail')}
                          className={`px-2 py-0.5 min-h-[24px] rounded-md text-[10.5px] font-semibold cursor-pointer ${
                            !wantsW ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Retail
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetLinePriceType(item.productId, 'wholesale')}
                          className={`px-2 py-0.5 min-h-[24px] rounded-md text-[10.5px] font-semibold cursor-pointer ${
                            wantsW ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                          } ${block === 'cost' ? 'opacity-50' : ''}`}
                        >
                          Wholesale
                        </button>
                      </div>

                      {block === 'cost' && (
                        <span className="text-[11px] font-semibold text-rose-700">
                          Wholesale below capital — not applied
                        </span>
                      )}
                      {wantsW && block === 'qty' && (
                        <span className="text-[11px] font-semibold text-slate-700 flex flex-wrap items-center gap-1.5">
                          <span>
                            {formatPeso(pr.wholesale)} starts at {pr.minQty} {item.unit} (+{need})
                          </span>
                          {pr.minQty <= stk && (
                            <button
                              type="button"
                              onClick={() => onSetCartQty(item.productId, String(pr.minQty))}
                              className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold cursor-pointer"
                            >
                              Set {pr.minQty}
                            </button>
                          )}
                        </span>
                      )}
                      {!wantsW && (
                        <span className="text-[11px] font-medium text-slate-500 flex flex-wrap items-center gap-1.5">
                          <span>
                            WS {formatPeso(pr.wholesale)} at {pr.minQty}+ {item.unit}
                          </span>
                          {block === null && (
                            <button
                              type="button"
                              onClick={() => onSetLinePriceType(item.productId, 'wholesale')}
                              className="px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold cursor-pointer"
                            >
                              Apply Wholesale
                            </button>
                          )}
                          {block === 'qty' &&
                            item.qty >= pr.minQty * 0.5 &&
                            pr.minQty <= stk &&
                            onUnlockWholesaleLine && (
                              <button
                                type="button"
                                onClick={() => onUnlockWholesaleLine(item.productId, pr.minQty)}
                                className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold cursor-pointer"
                              >
                                +{need} for Wholesale
                              </button>
                            )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Totals & Flagship Fitts's Law Checkout Footer */}
        <div className="p-4 pb-safe bg-slate-50/90 border-t border-slate-200 space-y-3 shrink-0">
          <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer min-h-[28px]">
            <span>Senior Citizen / PWD (5% Off)</span>
            <input
              type="checkbox"
              checked={isSeniorPwd}
              onChange={(e) => onToggleSeniorPwd(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
          </label>

          {isSeniorPwd && cart.length > 0 && (
            <div
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium border ${
                totals.seniorBase <= 0 || totals.seniorCapped || totals.scKinds < 4
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-200'
              }`}
            >
              {totals.seniorBase <= 0
                ? 'No Senior/PWD-eligible items in this basket, so no discount is given.'
                : `5% applies to ${formatPeso(totals.seniorBase)} of eligible items (${totals.scKinds} kind${
                    totals.scKinds === 1 ? '' : 's'
                  }).${
                    totals.scOtherLines > 0 ? ` ${totals.scOtherLines} other item(s) not discounted.` : ''
                  }${totals.seniorCapped ? ` Capped at ${formatPeso(totals.seniorCap)}.` : ''}${
                    totals.scKinds < 4
                      ? ' Rules usually require at least 4 kinds of eligible items — confirm first.'
                      : ''
                  }`}
            </div>
          )}

          <div className="space-y-1.5 text-xs border-t border-slate-200 pt-2.5">
            <div className="flex justify-between text-slate-500">
              <span>Retail Subtotal</span>
              <span className="font-mono-num font-semibold text-slate-700">{formatPeso(totals.retailSubtotal)}</span>
            </div>
            <div className="flex justify-between text-indigo-600">
              <span>Wholesale Tier Savings</span>
              <span className="font-mono-num font-semibold">−{formatPeso(totals.wholesaleSavings)}</span>
            </div>
            <div className="flex justify-between text-amber-700">
              <span>Senior / PWD Discount</span>
              <span className="font-mono-num font-semibold">−{formatPeso(totals.seniorDiscount)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
              <span className="font-bold text-sm text-slate-900">Total Due</span>
              <span className="font-mono-num font-extrabold text-2xl text-emerald-700">
                {formatPeso(totals.grandTotal)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenCheckout}
            disabled={cart.length === 0}
            className="w-full py-3.5 px-4 min-h-[52px] rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-sm shadow-xs transition pos-ease flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              <Banknote className="w-4 h-4" />
              <span>Checkout &amp; Pay</span>
            </span>
            <span className="font-mono-num text-xs opacity-90">
              {cart.length > 0 ? `${formatPeso(totals.grandTotal)} · F2` : 'F2'}
            </span>
          </button>

          <div className="hidden md:flex items-center justify-center gap-2.5 text-[11px] text-slate-400 font-medium">
            <span>/ Search</span>
            <span aria-hidden="true">·</span>
            <span>F4 Hold</span>
            <span aria-hidden="true">·</span>
            <span>F8 Scan</span>
            <span aria-hidden="true">·</span>
            <span>F9 Wholesale</span>
          </div>
        </div>
      </aside>
    </section>
  );
};
