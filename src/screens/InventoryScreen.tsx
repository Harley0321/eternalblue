import React, { useMemo } from 'react';
import {
  Edit3,
  History,
  ListChecks,
  Package,
  Plus,
  QrCode,
  Search,
  X,
} from 'lucide-react';
import { KpiCard, ProductCategoryBadge } from '../components/CommonGraphics';
import { InventoryFilter } from '../domain/inventoryFilter';
import { PosMath } from '../domain/posMath';
import { StockAlerts } from '../domain/stockAlerts';
import { usePos } from '../state/PosContext';
import { STOCK_FILTER_LABELS } from '../types/pos';

export const InventoryScreen: React.FC = () => {
  const {
    state,
    setStockSearch,
    setStockFilter,
    openScanner,
    openProductModal,
    setBatchModalOpen,
    setStockLogModalOpen,
    openStockAdjust,
  } = usePos();

  const summary = useMemo(
    () => PosMath.computeStockHealthSummary(state.products, state.sales, state.settings),
    [state.products, state.sales, state.settings]
  );

  const filtered = useMemo(
    () =>
      InventoryFilter.filterAndSort(
        state.products,
        state.sales,
        state.settings,
        state.stockSearch,
        state.stockFilter,
        state.stockSort
      ),
    [state.products, state.sales, state.settings, state.stockSearch, state.stockFilter, state.stockSort]
  );

  return (
    <div className="flex flex-col h-full bg-[#F4F6F8] overflow-hidden">
      {/* KPI Drilldown Row */}
      <div className="flex items-stretch gap-2 px-3 py-2.5 overflow-x-auto shrink-0">
        <KpiCard
          title="All SKUs"
          value={String(summary.totalSkus)}
          sub={PosMath.formatPeso(summary.retailValue)}
          active={state.stockFilter === 'ALL'}
          onClick={() => setStockFilter('ALL')}
          className="min-w-[136px] shrink-0"
        />
        <KpiCard
          title="Low Stock"
          value={String(summary.lowCount)}
          valueClass="text-[#D97706]"
          active={state.stockFilter === 'LOW'}
          onClick={() => setStockFilter('LOW')}
          className="min-w-[116px] shrink-0"
        />
        <KpiCard
          title="Out of Stock"
          value={String(summary.outCount)}
          valueClass="text-[#E11D48]"
          active={state.stockFilter === 'OUT'}
          onClick={() => setStockFilter('OUT')}
          className="min-w-[116px] shrink-0"
        />
        <KpiCard
          title="Fast-Low"
          value={String(summary.fastLowCount)}
          valueClass="text-[#4F46E5]"
          active={state.stockFilter === 'FAST_LOW'}
          onClick={() => setStockFilter('FAST_LOW')}
          className="min-w-[116px] shrink-0"
        />
        <KpiCard
          title="Expiring"
          value={String(summary.expiredCount + summary.soonCount)}
          valueClass="text-[#D97706]"
          active={state.stockFilter === 'SOON'}
          onClick={() => setStockFilter('SOON')}
          className="min-w-[116px] shrink-0"
        />
      </div>

      {/* Toolbar */}
      <div className="bg-white px-3 py-2.5 border-y border-[#E2E8F0] space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={state.stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              placeholder="Search SKU or barcode…"
              className="w-full pl-9 pr-8 py-2 text-[13px] rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
            />
            {state.stockSearch && (
              <button
                type="button"
                onClick={() => setStockSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => openScanner('inventory')}
            title="Scan SKU"
            aria-label="Scan SKU"
            className="p-2.5 rounded-xl text-[#4F46E5] hover:bg-indigo-50 border border-[#E2E8F0] cursor-pointer"
          >
            <QrCode size={18} />
          </button>
          <button
            type="button"
            onClick={() => openProductModal(null)}
            className="bg-[#059669] hover:bg-[#047857] text-white font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Plus size={16} />
            <span>Add</span>
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setBatchModalOpen(true)}
            className="px-3 py-1.5 rounded-[10px] border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <ListChecks size={15} />
            <span>Batch Receive / Audit</span>
          </button>
          <button
            type="button"
            onClick={() => setStockLogModalOpen(true)}
            className="px-3 py-1.5 rounded-[10px] border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <History size={15} />
            <span>Movement Log ({state.stockLog.length})</span>
          </button>
          {state.stockFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setStockFilter('ALL')}
              className="px-3 py-1.5 rounded-[10px] bg-[#ECFDF5] border border-[#059669] text-xs font-bold text-[#047857] whitespace-nowrap cursor-pointer"
            >
              Filter: {STOCK_FILTER_LABELS[state.stockFilter]} ×
            </button>
          )}
        </div>
      </div>

      {/* Product List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.map((p) => {
          const out = StockAlerts.isOutOfStock(p);
          const low = StockAlerts.isLowStock(p, state.settings);
          return (
            <div
              key={p.id}
              className="bg-white rounded-[14px] border border-[#E2E8F0] p-3 flex items-center gap-2.5"
            >
              <ProductCategoryBadge category={p.category} size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-[#0F172A] truncate">{p.name}</div>
                <div className="text-[11px] text-[#64748B] truncate">
                  {p.category} · {p.barcode}
                </div>
                <div className="flex items-center gap-2.5 mt-1">
                  <span className="text-xs font-bold font-mono text-[#047857]">
                    Retail {PosMath.formatPeso(p.retailPrice)}
                  </span>
                  {p.capital != null && (
                    <span className="text-[11px] font-mono text-[#64748B]">
                      Cap {PosMath.formatPeso(p.capital)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span
                  className={`px-2 py-0.5 rounded-lg text-xs font-extrabold font-mono ${
                    out
                      ? 'bg-[#FFF1F2] text-[#E11D48]'
                      : low
                      ? 'bg-[#FFFBEB] text-[#D97706]'
                      : 'bg-[#ECFDF5] text-[#047857]'
                  }`}
                >
                  {PosMath.formatQty(p.stock, p.unit)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openStockAdjust(p)}
                    title="Adjust stock"
                    aria-label={`Adjust stock for ${p.name}`}
                    className="p-1.5 rounded-lg text-[#4F46E5] hover:bg-indigo-50 cursor-pointer"
                  >
                    <Package size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openProductModal(p)}
                    title="Edit product"
                    aria-label={`Edit ${p.name}`}
                    className="p-1.5 rounded-lg text-[#0F172A] hover:bg-slate-100 cursor-pointer"
                  >
                    <Edit3 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
