import React, { useMemo, useRef, useState } from 'react';
import {
  Minus,
  PauseCircle,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { ProductCategoryBadge } from '../components/CommonGraphics';
import { PosMath } from '../domain/posMath';
import { StockAlerts } from '../domain/stockAlerts';
import { DeviceBridge } from '../hardware/deviceBridge';
import { usePos } from '../state/PosContext';
import type { CartLine, Product } from '../types/pos';

const ProductQuickCard: React.FC<{
  product: Product;
  defaultWholesaleMinQty: number;
  out: boolean;
  low: boolean;
  inCartQty: number;
  onClick: () => void;
}> = ({ product, defaultWholesaleMinQty, out, low, inCartQty, onClick }) => {
  const minQty = PosMath.effectiveWholesaleMinQty(product, null, defaultWholesaleMinQty);
  const hasValidWs =
    PosMath.toCents(product.wholesalePrice) > 0 &&
    PosMath.toCents(product.wholesalePrice) < PosMath.toCents(product.retailPrice) &&
    !(
      product.capital != null &&
      PosMath.toCents(product.capital) > 0 &&
      PosMath.toCents(product.wholesalePrice) < PosMath.toCents(product.capital)
    );
  const autoWsActive =
    hasValidWs && inCartQty > 0 && PosMath.toMilli(inCartQty) >= PosMath.toMilli(minQty);
  const activePrice = autoWsActive ? product.wholesalePrice : product.retailPrice;

  return (
    <button
      type="button"
      disabled={out}
      onClick={onClick}
      className={`text-left w-full h-full min-w-0 min-h-[116px] overflow-hidden rounded-xl p-3.5 flex flex-col justify-between gap-2.5 transition-all duration-150 ${
        out
          ? 'bg-slate-100/80 opacity-65 cursor-not-allowed border border-[#E2E8F0]'
          : inCartQty > 0
          ? 'bg-white border-2 border-[#059669] cursor-pointer hover:bg-[#ECFDF5]/25 active:scale-[0.98]'
          : 'bg-white border border-[#E2E8F0] cursor-pointer hover:border-[#059669]/60 active:scale-[0.98]'
      }`}
    >
      <div className="w-full min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2 w-full min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <ProductCategoryBadge category={product.category} size={22} />
            <span className="text-[11px] font-medium text-[#64748B] truncate">
              {product.category}
            </span>
          </div>
          {inCartQty > 0 ? (
            <span className="text-xs font-extrabold font-mono tabular-nums text-[#047857] shrink-0">
              {PosMath.formatQty(inCartQty)}×
            </span>
          ) : (
            <span
              className={`text-[11px] font-semibold font-mono tabular-nums shrink-0 ${
                out ? 'text-[#E11D48]' : low ? 'text-[#D97706]' : 'text-[#64748B]'
              }`}
            >
              {out ? 'Out' : PosMath.formatQty(product.stock, product.unit)}
            </span>
          )}
        </div>

        <div
          className={`text-[13px] sm:text-sm font-bold leading-snug break-words line-clamp-2 ${
            out ? 'text-[#64748B]' : 'text-[#0F172A]'
          }`}
        >
          {product.name}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between w-full gap-x-2 gap-y-0.5 pt-1 border-t border-slate-100">
        <span
          className={`text-base font-extrabold font-mono tabular-nums ${
            out ? 'text-[#64748B]' : autoWsActive ? 'text-[#4F46E5]' : 'text-[#047857]'
          }`}
        >
          {PosMath.formatPeso(activePrice)}
        </span>
        {hasValidWs && (
          <span className="text-[11px] font-semibold text-[#4F46E5] whitespace-nowrap tabular-nums">
            {autoWsActive ? 'Auto WS' : `WS ≥${PosMath.formatQty(minQty)}`}
          </span>
        )}
      </div>
    </button>
  );
};

const CartLineRow: React.FC<{
  line: CartLine;
  effectivePrice: number;
  isWs: boolean;
  wsBlock: ReturnType<typeof PosMath.wholesaleBlock>;
  minQty: number;
  nearDiff: number | null;
  onDec: () => void;
  onInc: () => void;
}> = ({ line, effectivePrice, isWs, wsBlock, minQty, nearDiff, onDec, onInc }) => (
  <div className="py-2.5 flex items-center gap-2.5">
    <div className="flex-1 min-w-0">
      <div className="text-[13px] font-bold text-[#0F172A] leading-snug line-clamp-2">{line.name}</div>
      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[#64748B] flex-wrap">
        <span className="font-mono tabular-nums">
          {PosMath.formatPeso(effectivePrice)} / {line.unit}
        </span>
        {isWs && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-bold text-[#4F46E5]">Auto WS</span>
          </>
        )}
        {!isWs && wsBlock === 'QTY' && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-[#4F46E5]">
              {nearDiff !== null
                ? `+${PosMath.formatQty(nearDiff)} for WS`
                : `WS ≥${PosMath.formatQty(minQty)}`}
            </span>
          </>
        )}
        {wsBlock === 'COST' && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-[#E11D48]">WS Below Cap</span>
          </>
        )}
      </div>
    </div>

    <div className="flex items-center gap-1 shrink-0 bg-slate-100 rounded-lg p-0.5">
      <button
        type="button"
        onClick={onDec}
        aria-label="Decrease quantity"
        className="w-8 h-8 rounded-md hover:bg-white flex items-center justify-center text-[#0F172A] cursor-pointer transition-colors"
      >
        <Minus size={14} />
      </button>
      <span className="font-mono tabular-nums font-bold text-[13px] min-w-[24px] text-center">
        {PosMath.formatQty(line.qty)}
      </span>
      <button
        type="button"
        onClick={onInc}
        aria-label="Increase quantity"
        className="w-8 h-8 rounded-md hover:bg-white flex items-center justify-center text-[#0F172A] cursor-pointer transition-colors"
      >
        <Plus size={14} />
      </button>
    </div>

    <div className="font-mono tabular-nums font-extrabold text-[13px] text-[#0F172A] shrink-0 min-w-[68px] text-right">
      {PosMath.formatPeso(PosMath.lineTotalPeso(effectivePrice, line.qty))}
    </div>
  </div>
);

const CartPanelContent: React.FC<{ onCloseAfterAction?: () => void }> = ({ onCloseAfterAction }) => {
  const {
    state,
    productMap,
    cartTotals,
    setHoldCartOpen,
    setHeldOrdersOpen,
    clearCart,
    toggleSeniorPwd,
    setSeniorId,
    updateCartQty,
    openCheckout,
  } = usePos();

  const defaultWsMin = state.settings.defaultWholesaleMinQty;

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header + Hold / Recall / Clear */}
      <div className="flex items-center justify-between gap-2 pb-2">
        <h2 className="font-extrabold text-base text-[#0F172A] tabular-nums">
          Current Order ({state.cart.length})
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={state.cart.length === 0}
            onClick={() => setHoldCartOpen(true)}
            title="Park order"
            aria-label="Park order"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#0F172A] hover:bg-slate-100 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <PauseCircle size={18} />
          </button>
          <button
            type="button"
            onClick={() => setHeldOrdersOpen(true)}
            title={`Recall parked (${state.heldOrders.length})`}
            aria-label="Recall parked orders"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#0F172A] hover:bg-slate-100 cursor-pointer relative transition-colors"
          >
            <RotateCcw size={18} />
            {state.heldOrders.length > 0 && (
              <span className="absolute top-0.5 right-0.5 bg-[#4F46E5] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center tabular-nums">
                {state.heldOrders.length}
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={state.cart.length === 0}
            onClick={clearCart}
            title="Clear cart"
            aria-label="Clear cart"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#E11D48] hover:bg-rose-50 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* SC/PWD Toggle */}
      <div className="flex items-center justify-between py-2.5 gap-2 border-t border-[#E2E8F0]">
        <div className="min-w-0">
          <div className="text-xs font-bold text-[#0F172A]">SC / PWD 5% Discount</div>
          <div className="text-[11px] text-[#64748B]">PH basic necessities relief</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.isSeniorPwd}
          onClick={() => toggleSeniorPwd(!state.isSeniorPwd)}
          className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
            state.isSeniorPwd ? 'bg-[#059669]' : 'bg-slate-300'
          }`}
        >
          <div
            className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
              state.isSeniorPwd ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {state.isSeniorPwd && (
        <input
          type="text"
          value={state.seniorId}
          onChange={(e) => setSeniorId(e.target.value)}
          placeholder="OSCA / PWD ID #"
          className="w-full mb-2 px-3 py-2 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
        />
      )}

      {/* Cart Lines */}
      <div className="flex-1 overflow-y-auto border-t border-[#E2E8F0] divide-y divide-slate-100 min-h-[120px]">
        {state.cart.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-[13px] text-[#64748B] px-4">
            Tap a product or scan a barcode to start
          </div>
        ) : (
          state.cart.map((line) => {
            const p = productMap.get(line.productId);
            return (
              <CartLineRow
                key={line.productId}
                line={line}
                effectivePrice={PosMath.getLinePrice(line, productMap, defaultWsMin)}
                isWs={PosMath.isWholesaleLine(line, productMap, defaultWsMin)}
                wsBlock={PosMath.wholesaleBlock(line, productMap, defaultWsMin)}
                minQty={PosMath.effectiveWholesaleMinQty(p, line, defaultWsMin)}
                nearDiff={PosMath.isWholeSaleNearThreshold(line, productMap, defaultWsMin)}
                onDec={() => updateCartQty(line.productId, line.qty - 1)}
                onInc={() => updateCartQty(line.productId, line.qty + 1)}
              />
            );
          })
        )}
      </div>

      {/* Totals & Charge CTA */}
      <div className="border-t border-[#E2E8F0] pt-3 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-[#64748B]">Subtotal</span>
          <span className="font-mono tabular-nums text-[#0F172A]">
            {PosMath.formatPeso(cartTotals.retailSubtotal)}
          </span>
        </div>
        {cartTotals.wholesaleSavings > 0 && (
          <div className="flex justify-between text-xs text-[#4F46E5] font-medium">
            <span>Wholesale Savings</span>
            <span className="font-mono tabular-nums">-{PosMath.formatPeso(cartTotals.wholesaleSavings)}</span>
          </div>
        )}
        {cartTotals.seniorDiscount > 0 && (
          <div className="flex justify-between text-xs text-[#047857] font-medium">
            <span>SC/PWD 5%{cartTotals.seniorCapped ? ' (Capped)' : ''}</span>
            <span className="font-mono tabular-nums">-{PosMath.formatPeso(cartTotals.seniorDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline pt-1">
          <span className="text-sm font-bold text-[#0F172A]">Grand Total</span>
          <span className="text-2xl font-extrabold font-mono tabular-nums text-[#047857]">
            {PosMath.formatPeso(cartTotals.grandTotal)}
          </span>
        </div>
        <button
          type="button"
          disabled={state.cart.length === 0}
          onClick={() => {
            onCloseAfterAction?.();
            openCheckout();
          }}
          className="mt-2 w-full h-12 rounded-xl bg-[#059669] hover:bg-[#047857] active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-[15px] transition-all duration-150 cursor-pointer disabled:cursor-not-allowed tabular-nums"
        >
          Charge {PosMath.formatPeso(cartTotals.grandTotal)}
        </button>
      </div>
    </div>
  );
};

export const PosScreen: React.FC = () => {
  const {
    state,
    cartTotals,
    setPosSearch,
    setPosCategory,
    openScanner,
    openProductModal,
    addToCart,
    openCheckout,
  } = usePos();
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(state.products.map((p) => p.category))).sort()],
    [state.products]
  );

  const filteredProducts = useMemo(() => {
    const q = state.posSearch.trim().toLowerCase();
    return state.products.filter((p) => {
      const matchCat = state.posCategory === 'All' || p.category === state.posCategory;
      const matchQ = !q || p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [state.products, state.posSearch, state.posCategory]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const raw = state.posSearch.trim().toLowerCase();
    if (!raw) return;
    const exactBarcodeMatch = state.products.find(
      (p) => p.barcode.trim().toLowerCase() === raw
    );
    const candidate = exactBarcodeMatch ?? (filteredProducts.length === 1 ? filteredProducts[0] : null);
    if (candidate) {
      e.preventDefault();
      addToCart(candidate, 1);
      if (state.settings.beep) DeviceBridge.playBeep();
      setPosSearch('');
    }
  };

  return (
    <div className="flex h-full w-full bg-[#F8FAFC] overflow-hidden">
      {/* Left Catalog Pane */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Search & Scanner Toolbar */}
        <div className="bg-white px-4 pt-3 pb-2.5 flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              ref={searchInputRef}
              type="text"
              value={state.posSearch}
              onChange={(e) => setPosSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search SKU or scan barcode (Enter)…"
              className="w-full min-h-[42px] pl-10 pr-9 sm:pr-20 py-2 text-[13px] rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] focus:bg-white focus:outline-none focus:border-[#059669] transition-colors"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {!state.posSearch && (
                <span className="hidden sm:inline text-[11px] font-mono tabular-nums text-[#94A3B8]">
                  {filteredProducts.length} SKUs
                </span>
              )}
              {state.posSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setPosSearch('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="p-1 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => openScanner('pos')}
            className="min-h-[42px] bg-[#4F46E5] hover:bg-[#4338CA] active:scale-[0.98] text-white font-bold text-[13px] px-4 py-2 rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer transition-all duration-150 whitespace-nowrap"
          >
            <QrCode size={17} />
            <span>Scan</span>
          </button>
        </div>

        {/* Category Filter Strip */}
        <div className="bg-white px-4 pb-3 pt-0.5 flex items-center gap-1.5 overflow-x-auto border-b border-[#E2E8F0]">
          {categories.map((cat) => {
            const active = state.posCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setPosCategory(cat)}
                className={`min-h-[34px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#0F172A] text-white'
                    : 'bg-slate-100 text-[#475569] hover:bg-slate-200/80 hover:text-[#0F172A]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Smart Grid Product Catalog */}
        <div className="flex-1 overflow-y-auto p-4">
          {state.products.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center gap-3 px-4">
              <p className="text-sm font-bold text-[#0F172A]">No products in inventory yet</p>
              <p className="text-xs text-[#64748B] max-w-sm">
                Start adding items manually or scan a barcode to register your first SKU.
              </p>
              <button
                type="button"
                onClick={() => openProductModal(null)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={15} />
                <span>Add First Product</span>
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-center gap-2">
              <p className="text-sm font-semibold text-[#64748B]">No matching products found.</p>
              <button
                type="button"
                onClick={() => {
                  setPosSearch('');
                  setPosCategory('All');
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-200/70 hover:bg-slate-200 text-xs font-bold text-[#0F172A] cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {filteredProducts.map((p) => {
                const out = StockAlerts.isOutOfStock(p);
                const low = StockAlerts.isLowStock(p, state.settings);
                const inCartQty = state.cart.find((c) => c.productId === p.id)?.qty ?? 0;
                return (
                  <ProductQuickCard
                    key={p.id}
                    product={p}
                    defaultWholesaleMinQty={state.settings.defaultWholesaleMinQty}
                    out={out}
                    low={low}
                    inCartQty={inCartQty}
                    onClick={() => addToCart(p, 1)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Mobile Compact Cart Sticky Footer */}
        <div className="md:hidden bg-white border-t border-[#E2E8F0] px-3.5 py-2.5 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="text-left flex-1 min-w-0 min-h-[44px] flex flex-col justify-center cursor-pointer"
          >
            <div className="text-[11px] font-semibold text-[#64748B] truncate">
              {state.cart.length} {state.cart.length === 1 ? 'item' : 'items'} · Tap to view order
            </div>
            <div className="text-[19px] font-extrabold font-mono tabular-nums text-[#047857]">
              {PosMath.formatPeso(cartTotals.grandTotal)}
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMobileCartOpen(true)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-xs font-bold text-[#0F172A] hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
            >
              <ShoppingCart size={15} />
              <span>Cart ({state.cart.length})</span>
            </button>
            <button
              type="button"
              disabled={state.cart.length === 0}
              onClick={openCheckout}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-extrabold cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              Charge
            </button>
          </div>
        </div>
      </div>

      {/* Desktop & Tablet Persistent Right Cart Drawer */}
      <aside className="hidden md:flex flex-col w-[330px] lg:w-[370px] bg-white border-l border-[#E2E8F0] h-full shrink-0">
        <CartPanelContent />
      </aside>

      {/* Mobile Cart Bottom Sheet */}
      {mobileCartOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] flex items-end">
          <div className="bg-white w-full h-[82vh] rounded-t-3xl flex flex-col overflow-hidden shadow-2xl">
            <div className="pt-2.5 pb-1 flex flex-col items-center border-b border-[#E2E8F0] relative">
              <div className="w-10 h-1 rounded-full bg-slate-300 mb-1.5" />
              <div className="w-full flex items-center justify-between px-4 pb-1.5">
                <span className="text-xs font-bold text-[#64748B]">Order Cart</span>
                <button
                  type="button"
                  onClick={() => setMobileCartOpen(false)}
                  aria-label="Close Order Cart"
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-slate-100 hover:text-[#0F172A] cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <CartPanelContent onCloseAfterAction={() => setMobileCartOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
