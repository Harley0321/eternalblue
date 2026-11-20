import React, { useMemo, useState } from 'react';
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
import { usePos } from '../state/PosContext';
import type { CartLine, Product } from '../types/pos';

const ProductQuickCard: React.FC<{
  product: Product;
  priceMode: 'retail' | 'wholesale';
  out: boolean;
  low: boolean;
  inCartQty: number;
  onClick: () => void;
}> = ({ product, priceMode, out, low, inCartQty, onClick }) => {
  const activePrice =
    priceMode === 'wholesale' && product.wholesalePrice > 0
      ? product.wholesalePrice
      : product.retailPrice;

  return (
    <button
      type="button"
      disabled={out}
      onClick={onClick}
      className={`text-left w-full h-full min-w-0 overflow-hidden rounded-[14px] p-3 flex flex-col justify-between gap-2 transition-colors ${
        out
          ? 'bg-[#F8FAFC] opacity-75 cursor-not-allowed border border-[#E2E8F0]'
          : inCartQty > 0
          ? 'bg-white border-[1.5px] border-[#059669] cursor-pointer hover:bg-[#ECFDF5]/30'
          : 'bg-white border border-[#E2E8F0] cursor-pointer hover:border-[#059669]/50'
      }`}
    >
      <div className="w-full min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-1.5 w-full min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <ProductCategoryBadge category={product.category} size={20} />
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#64748B] truncate">
              {product.category}
            </span>
          </div>
          {inCartQty > 0 ? (
            <span className="bg-[#059669] text-white text-[11px] font-extrabold px-2 py-0.5 rounded-lg font-mono shrink-0">
              {PosMath.formatQty(inCartQty)}
            </span>
          ) : (
            <span
              className={`text-[10px] font-bold font-mono shrink-0 ${
                out ? 'text-[#E11D48]' : low ? 'text-[#D97706]' : 'text-[#64748B]'
              }`}
            >
              {out ? 'OUT' : PosMath.formatQty(product.stock, product.unit)}
            </span>
          )}
        </div>

        <div
          className={`text-[13px] font-bold leading-snug break-words ${
            out ? 'text-[#64748B]' : 'text-[#0F172A]'
          }`}
        >
          {product.name}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between w-full gap-x-2 gap-y-0.5">
        <span
          className={`text-base font-extrabold font-mono ${
            out ? 'text-[#64748B]' : 'text-[#047857]'
          }`}
        >
          {PosMath.formatPeso(activePrice)}
        </span>
        {product.wholesalePrice > 0 && product.wholesalePrice < product.retailPrice && (
          <span className="text-[10px] font-semibold text-[#4F46E5] whitespace-nowrap">
            WS ≥{PosMath.formatQty(product.wholesaleMinQty)}
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
  onDec: () => void;
  onInc: () => void;
  onToggleType: () => void;
}> = ({ line, effectivePrice, isWs, wsBlock, onDec, onInc, onToggleType }) => (
  <div className="rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0] p-2 flex items-center gap-2">
    <div className="flex-1 min-w-0">
      <div className="text-[13px] font-bold text-[#0F172A] truncate">{line.name}</div>
      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
        <span className="text-[11px] font-mono text-[#64748B]">
          {PosMath.formatPeso(effectivePrice)} / {line.unit}
        </span>
        <button
          type="button"
          onClick={onToggleType}
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer ${
            isWs ? 'bg-[#EEF2FF] text-[#4F46E5]' : 'bg-[#F1F5F9] text-[#64748B]'
          }`}
        >
          {isWs ? 'WS' : 'RT'}
        </button>
        {line.priceType === 'wholesale' && wsBlock === 'QTY' && (
          <span className="text-[9px] font-semibold text-[#D97706]">
            Need ≥{PosMath.formatQty(line.wholesaleMinQty)}
          </span>
        )}
        {line.priceType === 'wholesale' && wsBlock === 'COST' && (
          <span className="text-[9px] font-semibold text-[#E11D48]">Below Cap</span>
        )}
      </div>
    </div>

    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onDec}
        aria-label="Decrease quantity"
        className="w-7 h-7 rounded-lg hover:bg-slate-200 flex items-center justify-center text-[#0F172A] cursor-pointer"
      >
        <Minus size={14} />
      </button>
      <span className="font-mono font-bold text-[13px] min-w-[20px] text-center">
        {PosMath.formatQty(line.qty)}
      </span>
      <button
        type="button"
        onClick={onInc}
        aria-label="Increase quantity"
        className="w-7 h-7 rounded-lg hover:bg-slate-200 flex items-center justify-center text-[#0F172A] cursor-pointer"
      >
        <Plus size={14} />
      </button>
    </div>

    <div className="font-mono font-extrabold text-[13px] text-[#0F172A] shrink-0 pl-1">
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
    togglePriceMode,
    toggleSeniorPwd,
    setSeniorId,
    updateCartQty,
    toggleLinePriceType,
    openCheckout,
  } = usePos();

  return (
    <div className="flex flex-col h-full p-3">
      {/* Header + Hold / Recall / Clear */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-extrabold text-base text-[#0F172A]">Current Order ({state.cart.length})</h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={state.cart.length === 0}
            onClick={() => setHoldCartOpen(true)}
            title="Park order"
            aria-label="Park order"
            className="p-2 rounded-lg text-[#0F172A] hover:bg-slate-100 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
          >
            <PauseCircle size={18} />
          </button>
          <button
            type="button"
            onClick={() => setHeldOrdersOpen(true)}
            title={`Recall parked (${state.heldOrders.length})`}
            aria-label="Recall parked orders"
            className="p-2 rounded-lg text-[#0F172A] hover:bg-slate-100 cursor-pointer relative"
          >
            <RotateCcw size={18} />
            {state.heldOrders.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-[#4F46E5] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
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
            className="p-2 rounded-lg text-[#E11D48] hover:bg-rose-50 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Retail vs Wholesale */}
      <div className="grid grid-cols-2 gap-1.5 mt-2">
        <button
          type="button"
          onClick={() => togglePriceMode('retail')}
          className={`py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
            state.priceMode === 'retail'
              ? 'bg-[#ECFDF5] border-[#059669] text-[#047857]'
              : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-slate-50'
          }`}
        >
          Retail
        </button>
        <button
          type="button"
          onClick={() => togglePriceMode('wholesale')}
          className={`py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
            state.priceMode === 'wholesale'
              ? 'bg-[#EEF2FF] border-[#4F46E5] text-[#4F46E5]'
              : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-slate-50'
          }`}
        >
          Wholesale
        </button>
      </div>

      {/* SC/PWD Toggle */}
      <div className="flex items-center justify-between py-2 gap-2">
        <div className="min-w-0">
          <div className="text-xs font-bold text-[#0F172A]">SC / PWD 5% Discount</div>
          <div className="text-[10px] text-[#64748B]">Applies to eligible PH basic necessities</div>
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
          className="w-full mb-2 px-3 py-1.5 text-xs rounded-lg border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
        />
      )}

      <div className="border-t border-[#E2E8F0]" />

      {/* Cart Lines */}
      <div className="flex-1 overflow-y-auto py-2 space-y-2 min-h-[120px]">
        {state.cart.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-[13px] text-[#64748B] px-4">
            Tap a product or scan a barcode to start
          </div>
        ) : (
          state.cart.map((line) => (
            <CartLineRow
              key={line.productId}
              line={line}
              effectivePrice={PosMath.getLinePrice(line, productMap)}
              isWs={PosMath.isWholesaleLine(line, productMap)}
              wsBlock={PosMath.wholesaleBlock(line, productMap)}
              onDec={() => updateCartQty(line.productId, line.qty - 1)}
              onInc={() => updateCartQty(line.productId, line.qty + 1)}
              onToggleType={() => toggleLinePriceType(line.productId)}
            />
          ))
        )}
      </div>

      <div className="border-t border-[#E2E8F0] pt-2 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-[#64748B]">Subtotal</span>
          <span className="font-mono text-[#0F172A]">{PosMath.formatPeso(cartTotals.retailSubtotal)}</span>
        </div>
        {cartTotals.wholesaleSavings > 0 && (
          <div className="flex justify-between text-xs text-[#4F46E5]">
            <span>Wholesale Savings</span>
            <span className="font-mono">-{PosMath.formatPeso(cartTotals.wholesaleSavings)}</span>
          </div>
        )}
        {cartTotals.seniorDiscount > 0 && (
          <div className="flex justify-between text-xs text-[#047857]">
            <span>SC/PWD 5%{cartTotals.seniorCapped ? ' (Capped)' : ''}</span>
            <span className="font-mono">-{PosMath.formatPeso(cartTotals.seniorDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-1">
          <span className="text-base font-extrabold text-[#0F172A]">Grand Total</span>
          <span className="text-xl font-extrabold font-mono text-[#047857]">
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
          className="mt-2 w-full h-12 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:bg-slate-300 text-white font-extrabold text-[15px] transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          Charge {PosMath.formatPeso(cartTotals.grandTotal)}
        </button>
      </div>
    </div>
  );
};

export const PosScreen: React.FC = () => {
  const { state, cartTotals, setPosSearch, setPosCategory, openScanner, openProductModal, addToCart, openCheckout } = usePos();
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

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

  return (
    <div className="flex h-full w-full bg-[#F4F6F8] overflow-hidden">
      {/* Left Catalog Pane */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Search & Scanner */}
        <div className="bg-white px-3 py-2.5 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={state.posSearch}
              onChange={(e) => setPosSearch(e.target.value)}
              placeholder="Search product or barcode…"
              className="w-full pl-9 pr-8 py-2.5 text-[13px] rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
            />
            {state.posSearch && (
              <button
                type="button"
                onClick={() => setPosSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => openScanner('pos')}
            className="bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[13px] px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
          >
            <QrCode size={17} />
            <span>Scan</span>
          </button>
        </div>

        {/* Category Filter Bar */}
        <div className="bg-white px-3 pb-2.5 pt-0.5 flex items-center gap-1.5 overflow-x-auto border-b border-[#E2E8F0]">
          {categories.map((cat) => {
            const active = state.posCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setPosCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#ECFDF5] border-[#059669] text-[#047857]'
                    : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {state.products.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center text-center gap-2.5 px-4">
              <p className="text-sm font-semibold text-[#0F172A]">No products in inventory yet</p>
              <p className="text-xs text-[#64748B]">
                Start adding items manually or scan a barcode to register your first SKU.
              </p>
              <button
                type="button"
                onClick={() => openProductModal(null)}
                className="px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Add First Product</span>
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-[#64748B]">
              No matching products found.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
              {filteredProducts.map((p) => {
                const out = StockAlerts.isOutOfStock(p);
                const low = StockAlerts.isLowStock(p, state.settings);
                const inCartQty = state.cart.find((c) => c.productId === p.id)?.qty ?? 0;
                return (
                  <ProductQuickCard
                    key={p.id}
                    product={p}
                    priceMode={state.priceMode}
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
        <div className="md:hidden bg-white border-t border-[#E2E8F0] px-3 py-2.5 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="text-left flex-1 min-w-0 cursor-pointer"
          >
            <div className="text-[11px] font-semibold text-[#64748B]">
              {state.cart.length} items · Tap to edit cart
            </div>
            <div className="text-[19px] font-extrabold font-mono text-[#047857]">
              {PosMath.formatPeso(cartTotals.grandTotal)}
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMobileCartOpen(true)}
              className="px-3 py-2 rounded-[10px] border border-[#E2E8F0] text-xs font-bold text-[#0F172A] flex items-center gap-1.5 cursor-pointer"
            >
              <ShoppingCart size={15} />
              <span>Cart ({state.cart.length})</span>
            </button>
            <button
              type="button"
              disabled={state.cart.length === 0}
              onClick={openCheckout}
              className="px-4 py-2 rounded-[10px] bg-[#059669] disabled:bg-slate-300 text-white text-xs font-extrabold cursor-pointer disabled:cursor-not-allowed"
            >
              Charge
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Right Cart Pane */}
      <aside className="hidden md:flex flex-col w-[310px] lg:w-[350px] bg-white border-l border-[#E2E8F0] h-full shrink-0">
        <CartPanelContent />
      </aside>

      {/* Mobile Cart Drawer */}
      {mobileCartOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50 flex items-end">
          <div className="bg-white w-full h-[80vh] rounded-t-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#E2E8F0]">
              <span className="text-xs font-bold text-[#64748B]">Order Cart</span>
              <button
                type="button"
                onClick={() => setMobileCartOpen(false)}
                className="p-1.5 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
              >
                <X size={18} />
              </button>
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
