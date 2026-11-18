import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Barcode,
  Camera,
  ChevronDown,
  Filter,
  History,
  Pause,
  ShoppingBasket,
  ShoppingCart,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { CartLine, CartTotals, PriceType, Product } from '../types';
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
} from '../utils/posMath';
import { CategoryBar } from './CategoryBar';

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
  onSetSearchQuery: (q: string) => void;
  onSearchEnter: (q: string) => void;
  onSetPriceMode: (mode: PriceType) => void;
  onSelectCategory: (cat: string) => void;
  onOpenCategorySheet: () => void;
  onOpenScanner: () => void;
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
    const low = p.stock > 0 && p.stock <= lowStockThreshold;
    const hasWholesale = p.wholesalePrice > 0 && p.wholesalePrice < p.retailPrice;

    return (
      <button
        type="button"
        onClick={() => onProductClick(p.id)}
        disabled={out}
        className={`relative text-left bg-white p-3 rounded-2xl border transition flex flex-col justify-between gap-2 cursor-pointer ${
          out
            ? 'border-slate-200 opacity-55 cursor-not-allowed'
            : inCartQty > 0
              ? 'border-emerald-500 ring-1 ring-emerald-500/35 hover:border-emerald-600 active:scale-[0.98]'
              : 'border-slate-200 hover:border-emerald-500 active:scale-[0.98]'
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-1.5 text-[11px]">
            <span className="text-slate-500 font-semibold truncate">{p.category}</span>
            <span
              className={`font-mono-num font-bold shrink-0 ${
                out ? 'text-rose-600' : low ? 'text-amber-600' : 'text-slate-500'
              }`}
            >
              {expired ? 'EXPIRED' : p.stock <= 0 ? 'OUT' : `${p.stock} ${p.unit}`}
            </span>
          </div>
          <div className="font-bold text-xs sm:text-[13px] text-slate-900 line-clamp-2 mt-1 leading-snug">
            {p.name}
          </div>
          {inCartQty > 0 && (
            <div className="text-[10px] font-mono-num font-extrabold text-emerald-700 mt-1">
              {Number(inCartQty.toFixed(3))} {p.unit} in basket
            </div>
          )}
          {(exInfo.status === 'expired' || exInfo.status === 'soon') && (
            <div
              className={`text-[10px] font-bold mt-1 flex items-center gap-1 ${
                expired ? 'text-rose-600' : 'text-amber-600'
              }`}
            >
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>{expiryLabel(p, expiryWarnDays)}</span>
            </div>
          )}
        </div>

        <div className="pt-1.5 border-t border-slate-100 flex flex-wrap items-baseline justify-between gap-1">
          <span className="font-mono-num font-extrabold text-sm text-emerald-700 whitespace-nowrap">
            {formatPeso(p.retailPrice)}
            <span className="text-[10px] font-normal text-slate-400">/{p.unit}</span>
          </span>
          {hasWholesale && (
            <span
              className={`text-[10px] font-mono-num font-semibold whitespace-nowrap ${
                priceMode === 'wholesale'
                  ? 'text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded'
                  : 'text-indigo-600'
              }`}
            >
              {formatPeso(p.wholesalePrice)} ({p.wholesaleMinQty}+)
            </span>
          )}
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
  onSetSearchQuery,
  onSearchEnter,
  onSetPriceMode,
  onSelectCategory,
  onOpenCategorySheet,
  onOpenScanner,
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
}) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [fastMoversOnly, setFastMoversOnly] = useState(false);

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
      <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden p-2 sm:p-3 lg:p-4 gap-2">
        {/* Search & Scan Row */}
        <div className="bg-white p-2 rounded-2xl border border-slate-200 flex items-center gap-2 shrink-0">
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
              className="w-full pl-9 pr-8 py-2 min-h-[42px] bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
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
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onOpenScanner}
            className="justify-center px-3.5 py-2 min-h-[42px] rounded-xl text-xs font-bold border border-emerald-500/40 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 active:scale-[0.98] flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
            title="Scan Barcode with Camera (F8)"
          >
            <Camera className="w-4 h-4 text-emerald-700" />
            <span>Scan</span>
          </button>
        </div>

        {/* Retail / Wholesale Price Mode & In-Stock Filter */}
        <div className="flex items-center justify-between gap-2 shrink-0 px-0.5 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide shrink-0">
              Price
            </span>
            <div
              className="inline-flex border border-slate-300 rounded-xl overflow-hidden bg-white shrink-0"
              role="group"
              aria-label="Price mode"
            >
              <button
                type="button"
                onClick={() => onSetPriceMode('retail')}
                className={`px-3 py-1.5 min-h-[36px] text-xs font-extrabold transition cursor-pointer ${
                  priceMode === 'retail' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Retail
              </button>
              <button
                type="button"
                onClick={() => onSetPriceMode('wholesale')}
                className={`px-3 py-1.5 min-h-[36px] text-xs font-extrabold transition cursor-pointer ${
                  priceMode === 'wholesale' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Wholesale
              </button>
            </div>
            <span className="hidden lg:inline text-[11px] font-semibold text-slate-600 leading-tight truncate">
              {priceMode === 'wholesale'
                ? 'Wholesale applies at minimum qty'
                : 'Retail pricing active'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasFastMovers && (
              <button
                type="button"
                onClick={() => setFastMoversOnly((v) => !v)}
                aria-pressed={fastMoversOnly}
                data-testid="pos-fast-movers-btn"
                className={`px-2.5 py-1.5 min-h-[34px] rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  fastMoversOnly
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50'
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>Fast Movers ({fastMoverIds!.size})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setInStockOnly((v) => !v)}
              aria-pressed={inStockOnly}
              className={`px-2.5 py-1.5 min-h-[34px] rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                inStockOnly
                  ? 'bg-slate-900 text-emerald-400 border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-3 h-3" />
              <span>In Stock Only</span>
            </button>
            <span className="text-[11px] font-mono-num font-semibold text-slate-500 hidden sm:inline">
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

        {/* Responsive Product Grid */}
        <div className="flex-1 overflow-y-auto scroll-contain grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-2.5 pb-20 md:pb-3 content-start">
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
      </div>

      {/* Mobile Bottom Floating Cart Bar (compact <= 60px to stay within mobile sticky cap) */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-slate-900 text-white px-3 py-2 pb-safe border-t border-slate-800 flex items-center justify-between gap-2 z-20 shadow-2xl">
        <button
          type="button"
          onClick={onOpenMobileCart}
          className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
        >
          <div className="relative w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shrink-0">
            <ShoppingCart className="w-4 h-4" />
            <span className="absolute -top-1.5 -right-1.5 px-1.5 rounded-full bg-emerald-500 text-slate-950 font-extrabold text-[10px] font-mono-num">
              {cart.length}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
              Basket
            </div>
            <div className="font-mono-num font-extrabold text-base text-emerald-400 leading-tight">
              {formatPeso(totals.grandTotal)}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={onOpenCheckout}
          disabled={cart.length === 0}
          className="px-5 py-2.5 min-h-[44px] rounded-xl bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider shrink-0 cursor-pointer"
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
        className={`fixed md:static inset-x-0 bottom-0 h-[84dvh] md:h-full w-full md:w-[360px] lg:w-[400px] bg-white border-t md:border-t-0 md:border-l border-slate-200 rounded-t-3xl md:rounded-none shadow-2xl md:shadow-none flex flex-col z-40 md:z-10 transition-transform duration-200 shrink-0 ${
          mobileCartOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'
        }`}
      >
        {/* Cart Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-extrabold text-sm text-slate-900">Order Basket</h2>
            <span className="text-[11px] text-slate-500 font-semibold font-mono-num">
              · {cart.length} line{cart.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onHoldCart}
              disabled={cart.length === 0}
              className="px-2.5 py-1.5 min-h-[34px] rounded-lg bg-amber-50 hover:bg-amber-100 disabled:opacity-45 text-amber-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              title="Park / Hold Order (F4)"
            >
              <Pause className="w-3 h-3" />
              <span>Hold</span>
            </button>
            <button
              type="button"
              onClick={onOpenHeldModal}
              className="relative px-2.5 py-1.5 min-h-[34px] rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              title="Recall Parked Orders"
              aria-label={`Parked orders (${heldCount})`}
            >
              <History className="w-3.5 h-3.5" />
              {heldCount > 0 && (
                <span className="px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-mono-num">
                  {heldCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onClearCart}
              disabled={cart.length === 0}
              className="px-2.5 py-1.5 min-h-[34px] rounded-lg bg-rose-50 hover:bg-rose-100 disabled:opacity-45 text-rose-600 text-[11px] font-bold flex items-center justify-center cursor-pointer"
              title="Clear Basket"
              aria-label="Clear basket"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onCloseMobileCart}
              aria-label="Close basket drawer"
              className="md:hidden w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Cart Lines */}
        <div className="flex-1 overflow-y-auto scroll-contain p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-10">
              <ShoppingBasket className="w-10 h-10 mb-2 text-slate-300" />
              <p className="text-xs font-semibold text-slate-500">Basket is empty</p>
              <p className="text-[11px] mt-0.5">Tap an item, scan a barcode, or type 5*barcode</p>
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
                  className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs text-slate-900 truncate">{item.name}</div>
                      <div className="text-[11px] font-mono-num text-slate-500 mt-0.5">
                        {formatPeso(activePrice)}/{item.unit}
                        {isW && (
                          <span className="ml-1.5 text-indigo-700 font-bold text-[10px]">
                            · Wholesale{savedPeso > 0 ? ` (Save ${formatPeso(savedPeso)})` : ''}
                          </span>
                        )}
                        {isSeniorPwd && scEligibleLine(item, productMap) && (
                          <span className="ml-1.5 text-amber-700 font-bold text-[10px]">
                            · SC/PWD 5%
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onChangeCartQty(item.productId, -1)}
                        aria-label={`Decrease quantity for ${item.name}`}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                      >
                        -
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
                        className="w-12 h-8 text-center font-mono-num font-bold text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => onChangeCartQty(item.productId, 1)}
                        aria-label={`Increase quantity for ${item.name}`}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveCartLine(item.productId)}
                        aria-label={`Remove ${item.name}`}
                        className="w-7 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="w-16 text-right font-mono-num font-extrabold text-xs text-slate-900 shrink-0">
                      {formatPeso(lineTotal)}
                    </div>
                  </div>

                  {hasW && (
                    <div className="mt-2">
                      <div
                        className="inline-flex border border-slate-300 rounded-lg overflow-hidden bg-white"
                        role="group"
                        aria-label={`Price type for ${item.name}`}
                      >
                        <button
                          type="button"
                          onClick={() => onSetLinePriceType(item.productId, 'retail')}
                          className={`px-2.5 py-1 min-h-[28px] text-[10px] font-extrabold cursor-pointer ${
                            !wantsW ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600'
                          }`}
                        >
                          Retail
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetLinePriceType(item.productId, 'wholesale')}
                          className={`px-2.5 py-1 min-h-[28px] text-[10px] font-extrabold cursor-pointer ${
                            wantsW ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'
                          } ${block === 'cost' ? 'opacity-50' : ''}`}
                        >
                          Wholesale
                        </button>
                      </div>
                      {block === 'cost' && (
                        <div className="text-[11px] font-extrabold text-slate-900 mt-1">
                          Wholesale price is below capital — not applied
                        </div>
                      )}
                      {wantsW && block === 'qty' && (
                        <div className="text-[11px] font-extrabold text-slate-900 mt-1 flex flex-wrap items-center gap-1.5">
                          <span>
                            Wholesale {formatPeso(pr.wholesale)} starts at {pr.minQty} {item.unit} — add{' '}
                            {need} more
                          </span>
                          {pr.minQty <= stk && (
                            <button
                              type="button"
                              onClick={() => onSetCartQty(item.productId, String(pr.minQty))}
                              className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-extrabold cursor-pointer"
                            >
                              Set {pr.minQty}
                            </button>
                          )}
                        </div>
                      )}
                      {!wantsW && (
                        <div className="text-[11px] font-semibold text-slate-600 mt-1 flex flex-wrap items-center gap-1.5">
                          <span>
                            Wholesale {formatPeso(pr.wholesale)} at {pr.minQty}+ {item.unit}
                          </span>
                          {block === null && (
                            <button
                              type="button"
                              onClick={() => onSetLinePriceType(item.productId, 'wholesale')}
                              className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-extrabold cursor-pointer"
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
                                className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-extrabold cursor-pointer"
                              >
                                +{need} for Wholesale
                              </button>
                            )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Totals & Checkout Footer */}
        <div className="p-3.5 pb-safe bg-slate-50 border-t border-slate-200 space-y-2.5 shrink-0">
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
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border ${
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

          <div className="space-y-1 text-xs border-t border-slate-200 pt-2">
            <div className="flex justify-between text-slate-500">
              <span>Retail Subtotal</span>
              <span className="font-mono-num font-semibold">{formatPeso(totals.retailSubtotal)}</span>
            </div>
            <div className="flex justify-between text-indigo-600">
              <span>Wholesale Tier Savings</span>
              <span className="font-mono-num font-semibold">-{formatPeso(totals.wholesaleSavings)}</span>
            </div>
            <div className="flex justify-between text-amber-700">
              <span>Senior / PWD Discount</span>
              <span className="font-mono-num font-semibold">-{formatPeso(totals.seniorDiscount)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-1.5 border-t border-slate-200">
              <span className="font-extrabold text-sm text-slate-900">TOTAL DUE</span>
              <span className="font-mono-num font-extrabold text-xl text-emerald-700">
                {formatPeso(totals.grandTotal)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenCheckout}
            disabled={cart.length === 0}
            className="w-full py-3.5 min-h-[48px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:text-slate-500 text-white font-extrabold text-sm shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Banknote className="w-4 h-4" />
            <span>Checkout &amp; Pay (F2)</span>
          </button>

          <div className="hidden md:flex items-center justify-center gap-2 text-[10px] text-slate-400 font-medium">
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
