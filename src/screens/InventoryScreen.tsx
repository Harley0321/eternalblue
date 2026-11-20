import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  ClipboardList,
  Copy,
  Download,
  Edit3,
  History,
  ListChecks,
  Package,
  PackageCheck,
  Plus,
  QrCode,
  Search,
  X,
} from 'lucide-react';
import { KpiCard, ProductCategoryBadge } from '../components/CommonGraphics';
import { InventoryFilter } from '../domain/inventoryFilter';
import { PosMath } from '../domain/posMath';
import { StockAlerts } from '../domain/stockAlerts';
import { DeviceBridge } from '../hardware/deviceBridge';
import { usePos } from '../state/PosContext';
import { STOCK_FILTER_LABELS, type StockSort } from '../types/pos';

const STOCK_SORT_OPTIONS: Array<{ value: StockSort; label: string }> = [
  { value: 'DEFAULT', label: 'Default Order' },
  { value: 'COVER_ASC', label: 'Days Cover (Lowest)' },
  { value: 'STOCK_ASC', label: 'Stock Qty (Low → High)' },
  { value: 'STOCK_DESC', label: 'Stock Qty (High → Low)' },
  { value: 'VELOCITY_DESC', label: 'Fastest Selling' },
  { value: 'VALUE_DESC', label: 'Highest Stock Value' },
  { value: 'EXPIRY_ASC', label: 'Expiring Soonest' },
  { value: 'NAME_ASC', label: 'Name (A → Z)' },
];

function safeCsvCell(raw: string): string {
  const clean = raw.replace(/\r/g, ' ').replace(/\n/g, ' ');
  const trimmed = clean.trimStart();
  const neutralized =
    trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')
      ? `'${clean}`
      : clean;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export const InventoryScreen: React.FC = () => {
  const {
    state,
    setStockSearch,
    setStockFilter,
    setStockSort,
    openScanner,
    openProductModal,
    setBatchModalOpen,
    setStockLogModalOpen,
    openStockAdjust,
    applyBatchStock,
    toast,
  } = usePos();

  const [poOpen, setPoOpen] = useState(false);
  const [poShowAll, setPoShowAll] = useState(false);
  const [poNote, setPoNote] = useState('');
  const [poQtyOverrides, setPoQtyOverrides] = useState<Record<string, string>>({});

  const summary = useMemo(
    () => PosMath.computeStockHealthSummary(state.products, state.sales, state.settings),
    [state.products, state.sales, state.settings]
  );

  const velocities = useMemo(
    () => PosMath.computeProductVelocities(state.products, state.sales, 30),
    [state.products, state.sales]
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

  const reorderCandidates = useMemo(() => {
    const coverCutoff = state.settings.reorderLeadDays + state.settings.reorderSafetyDays;
    const targetDays = state.settings.reorderLeadDays + state.settings.reorderSafetyDays * 2;
    return state.products
      .map((p) => {
        const v = velocities[p.id] ?? 0;
        const out = StockAlerts.isOutOfStock(p);
        const low = StockAlerts.isLowStock(p, state.settings);
        const daysCover = v > 0 ? p.stock / v : null;
        const fastDraining = daysCover !== null && daysCover <= coverCutoff;
        const needsReorder = out || low || fastDraining;
        const byVel = v > 0 ? Math.ceil(Math.max(0, PosMath.round3(v * targetDays - p.stock))) : 0;
        const thresh = p.lowStockThreshold ?? state.settings.lowStockThreshold;
        const byThresh = Math.ceil(Math.max(0, PosMath.round3(Math.max(thresh * 2, 1) - p.stock)));
        const suggestedQty = needsReorder ? Math.max(1, byVel, byThresh) : 0;
        return {
          product: p,
          velocity: v,
          daysCover,
          needsReorder,
          suggestedQty,
        };
      })
      .sort((a, b) => {
        if (a.needsReorder !== b.needsReorder) return a.needsReorder ? -1 : 1;
        return (a.daysCover ?? 9999) - (b.daysCover ?? 9999);
      });
  }, [state.products, state.settings, velocities]);

  const urgentReorderCount = useMemo(
    () => reorderCandidates.filter((item) => item.needsReorder).length,
    [reorderCandidates]
  );

  const visiblePoItems = useMemo(
    () => (poShowAll ? reorderCandidates : reorderCandidates.filter((item) => item.needsReorder)),
    [poShowAll, reorderCandidates]
  );

  const getPoQty = (productId: string, suggested: number) => {
    const raw = poQtyOverrides[productId];
    if (raw === undefined) return suggested;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? PosMath.round3(parsed) : 0;
  };

  const poOrderLines = useMemo(
    () =>
      visiblePoItems
        .map((item) => {
          const qty = getPoQty(item.product.id, item.suggestedQty);
          const unitCost = PosMath.round2(item.product.capital ?? item.product.retailPrice * 0.8);
          return {
            ...item,
            orderQty: qty,
            unitCost,
            lineTotal: PosMath.lineTotalPeso(unitCost, qty),
          };
        })
        .filter((line) => line.orderQty > 0),
    [visiblePoItems, poQtyOverrides]
  );

  const poGrandCost = useMemo(
    () => PosMath.fromCents(poOrderLines.reduce((acc, l) => acc + PosMath.toCents(l.lineTotal), 0)),
    [poOrderLines]
  );

  const openPoModal = () => {
    setPoQtyOverrides({});
    setPoShowAll(urgentReorderCount === 0);
    setPoOpen(true);
  };

  const buildPoText = () => {
    const header = [
      `${state.settings.storeName.toUpperCase()} - PURCHASE ORDER`,
      `Date: ${PosMath.formatDateTime(new Date().toISOString())}`,
      poNote.trim() ? `Supplier / Note: ${poNote.trim()}` : '',
      `Items: ${poOrderLines.length} | Est. Capital: ${PosMath.formatPeso(poGrandCost)}`,
      `--------------------------------`,
    ]
      .filter(Boolean)
      .join('\n');
    const body = poOrderLines
      .map(
        (l, idx) =>
          `${idx + 1}. ${l.product.name} (${l.product.barcode}) — Order ${PosMath.formatQty(
            l.orderQty,
            l.product.unit
          )} @ ${PosMath.formatPeso(l.unitCost)} = ${PosMath.formatPeso(l.lineTotal)}`
      )
      .join('\n');
    return `${header}\n${body}`;
  };

  const handleExportPoCsv = () => {
    if (poOrderLines.length === 0) return;
    const rows = ['Barcode,Product,Category,CurrentStock,Unit,OrderQty,EstUnitCost,EstLineTotal'];
    poOrderLines.forEach((l) => {
      rows.push(
        [
          safeCsvCell(l.product.barcode),
          safeCsvCell(l.product.name),
          safeCsvCell(l.product.category),
          l.product.stock,
          safeCsvCell(l.product.unit),
          l.orderQty,
          PosMath.round2(l.unitCost),
          l.lineTotal,
        ].join(',')
      );
    });
    void DeviceBridge.shareOrDownloadTextFile(
      `purchase_order_${PosMath.todayYmd()}.csv`,
      rows.join('\n'),
      'text/csv'
    );
    toast('Purchase Order CSV exported');
  };

  const handleReceivePoIntoStock = () => {
    if (poOrderLines.length === 0) return;
    const deltas: Record<string, number> = {};
    poOrderLines.forEach((l) => {
      deltas[l.product.id] = l.orderQty;
    });
    applyBatchStock(deltas, false, poNote.trim() || 'PO Replenishment');
    setPoOpen(false);
    setPoNote('');
    setPoQtyOverrides({});
  };

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
            onClick={openPoModal}
            className={`px-3 py-1.5 rounded-[10px] text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              urgentReorderCount > 0
                ? 'bg-[#EEF2FF] border border-[#4F46E5]/40 text-[#4F46E5]'
                : 'border border-[#E2E8F0] text-[#0F172A] hover:bg-slate-50'
            }`}
          >
            <ClipboardList size={15} />
            <span>Reorder / PO ({urgentReorderCount})</span>
          </button>
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
            <span>Log ({state.stockLog.length})</span>
          </button>
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[10px] border border-[#E2E8F0] bg-white shrink-0">
            <ArrowUpDown size={13} className="text-[#64748B]" />
            <select
              aria-label="Sort inventory"
              value={state.stockSort}
              onChange={(e) => setStockSort(e.target.value as StockSort)}
              className="text-xs font-semibold text-[#0F172A] bg-transparent focus:outline-none cursor-pointer"
            >
              {STOCK_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
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
          const vel = velocities[p.id] ?? 0;
          const coverDays = vel > 0 ? Math.max(0, Math.round(p.stock / vel)) : null;
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
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1">
                  <span className="text-xs font-bold font-mono text-[#047857]">
                    Retail {PosMath.formatPeso(p.retailPrice)}
                  </span>
                  {p.capital != null && (
                    <span className="text-[11px] font-mono text-[#64748B]">
                      Cap {PosMath.formatPeso(p.capital)}
                    </span>
                  )}
                  {vel > 0 && (
                    <span className="text-[11px] font-mono text-[#4F46E5]">
                      ~{vel.toFixed(1)}/day{coverDays !== null ? ` · ${coverDays}d cover` : ''}
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

      {/* Smart Reorder / Purchase Order Modal */}
      {poOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-[#E2E8F0] shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
              <div>
                <h2 className="font-extrabold text-sm text-[#0F172A]">Smart Reorder & Purchase Order</h2>
                <p className="text-[11px] text-[#64748B]">
                  Target cover: {state.settings.reorderLeadDays + state.settings.reorderSafetyDays * 2} days (Lead{' '}
                  {state.settings.reorderLeadDays}d + 2×Safety {state.settings.reorderSafetyDays}d)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPoOpen(false)}
                aria-label="Close Purchase Order modal"
                className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-4 py-2.5 bg-slate-50 border-b border-[#E2E8F0] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={poNote}
                  onChange={(e) => setPoNote(e.target.value)}
                  placeholder="Supplier name / PO Ref (optional)"
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#059669]"
                />
                <button
                  type="button"
                  onClick={() => setPoShowAll((v) => !v)}
                  className="px-2.5 py-1.5 rounded-xl border border-[#E2E8F0] bg-white text-[11px] font-bold text-[#0F172A] cursor-pointer shrink-0"
                >
                  {poShowAll ? 'Urgent Only' : 'Show All SKUs'}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748B]">
                  Lines with qty &gt; 0: <strong className="text-[#0F172A]">{poOrderLines.length}</strong>
                </span>
                <span className="font-mono font-extrabold text-[#047857]">
                  Est. PO Total: {PosMath.formatPeso(poGrandCost)}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {visiblePoItems.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-xs font-semibold text-[#64748B]">
                    All SKUs are currently above reorder thresholds.
                  </p>
                  <button
                    type="button"
                    onClick={() => setPoShowAll(true)}
                    className="px-3 py-1.5 rounded-xl bg-[#EEF2FF] text-[#4F46E5] text-xs font-bold cursor-pointer"
                  >
                    Browse All SKUs to Create Manual PO
                  </button>
                </div>
              ) : (
                visiblePoItems.map((item) => {
                  const p = item.product;
                  const qty = getPoQty(p.id, item.suggestedQty);
                  const unitCost = PosMath.round2(p.capital ?? p.retailPrice * 0.8);
                  return (
                    <div
                      key={p.id}
                      className={`rounded-xl border p-2.5 flex items-center justify-between gap-2 ${
                        item.needsReorder ? 'bg-[#FFFBEB]/60 border-[#D97706]/30' : 'bg-white border-[#E2E8F0]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-[#0F172A] truncate">{p.name}</div>
                        <div className="text-[11px] text-[#64748B] font-mono">
                          Stock: {PosMath.formatQty(p.stock, p.unit)}
                          {item.velocity > 0 ? ` · ${item.velocity.toFixed(1)}/day` : ''}
                          {item.daysCover !== null ? ` · ${Math.round(item.daysCover)}d cover` : ''}
                        </div>
                        <div className="text-[11px] text-[#047857] font-mono">
                          Unit Cost {PosMath.formatPeso(unitCost)} · Line{' '}
                          {PosMath.formatPeso(PosMath.lineTotalPeso(unitCost, qty))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-[#64748B]">Qty</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={poQtyOverrides[p.id] ?? String(item.suggestedQty)}
                          onChange={(e) =>
                            setPoQtyOverrides((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          className="w-16 px-2 py-1 text-right text-xs font-mono font-bold rounded-lg border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#059669]"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-[#E2E8F0] bg-slate-50 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={poOrderLines.length === 0}
                  onClick={async () => {
                    await DeviceBridge.copyText(buildPoText());
                    toast('Purchase Order copied to clipboard');
                  }}
                  className="py-2 rounded-xl border border-[#E2E8F0] bg-white disabled:opacity-50 text-xs font-semibold text-[#0F172A] flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Copy size={13} />
                  <span>Copy PO Text</span>
                </button>
                <button
                  type="button"
                  disabled={poOrderLines.length === 0}
                  onClick={handleExportPoCsv}
                  className="py-2 rounded-xl border border-[#E2E8F0] bg-white disabled:opacity-50 text-xs font-semibold text-[#0F172A] flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Download size={13} />
                  <span>Export PO CSV</span>
                </button>
              </div>
              <button
                type="button"
                disabled={poOrderLines.length === 0}
                onClick={handleReceivePoIntoStock}
                className="w-full py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:bg-slate-300 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                <PackageCheck size={15} />
                <span>Receive {poOrderLines.length} SKUs Into Stock</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

