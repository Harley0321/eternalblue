import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Minus, PackagePlus, Plus, Search, X } from 'lucide-react';
import type { Product, StockLogEntry } from '../types';
import {
  computeWeightedAverageCapital,
  formatPeso,
  round2,
  type BatchStockAdjustmentInput,
} from '../utils/posMath';
import { matchesInventorySearch } from '../utils/inventoryFilter';

export interface BatchPrefillItem {
  productId: string;
  value: number;
  note?: string;
}

interface BatchStockModalProps {
  open: boolean;
  products: Product[];
  initialMode?: 'delta' | 'set';
  initialReason?: StockLogEntry['reason'];
  prefill?: BatchPrefillItem[];
  onClose: () => void;
  onApplyBatch: (adjustments: BatchStockAdjustmentInput[]) => void;
}

interface RowDraft {
  qtyInput: string;
  costInput: string;
  useWeightedAvg: boolean;
  expiryInput: string;
}

export const BatchStockModal: React.FC<BatchStockModalProps> = ({
  open,
  products,
  initialMode = 'delta',
  initialReason,
  prefill,
  onClose,
  onApplyBatch,
}) => {
  const [mode, setMode] = useState<'delta' | 'set'>(initialMode);
  const [reason, setReason] = useState<StockLogEntry['reason']>(
    initialReason || (initialMode === 'set' ? 'Count Correction' : 'Restock'),
  );
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setReason(initialReason || (initialMode === 'set' ? 'Count Correction' : 'Restock'));
    setSearch('');

    const initDrafts: Record<string, RowDraft> = {};
    if (prefill && prefill.length > 0) {
      for (const item of prefill) {
        initDrafts[item.productId] = {
          qtyInput: String(item.value),
          costInput: '',
          useWeightedAvg: true,
          expiryInput: '',
        };
      }
      setNote(prefill[0]?.note || 'Suggested reorder restock');
      setOnlyChanged(true);
    } else {
      setNote('');
      setOnlyChanged(false);
    }
    setDrafts(initDrafts);
  }, [open, initialMode, initialReason, prefill]);

  const handleSwitchMode = (nextMode: 'delta' | 'set') => {
    setMode(nextMode);
    setReason(nextMode === 'set' ? 'Count Correction' : 'Restock');
    setDrafts({});
    setOnlyChanged(false);
  };

  const updateDraft = (productId: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => {
      const curr = prev[productId] || {
        qtyInput: '',
        costInput: '',
        useWeightedAvg: true,
        expiryInput: '',
      };
      return {
        ...prev,
        [productId]: { ...curr, ...patch },
      };
    });
  };

  const bumpQty = (p: Product, stepDelta: number) => {
    const currDraft = drafts[p.id];
    const currentVal =
      currDraft && currDraft.qtyInput !== ''
        ? parseFloat(currDraft.qtyInput) || 0
        : mode === 'set'
          ? p.stock
          : 0;
    const nextVal = Math.max(0, Number((currentVal + stepDelta).toFixed(3)));
    updateDraft(p.id, { qtyInput: mode === 'delta' && nextVal === 0 ? '' : String(nextVal) });
  };

  const adjustments = useMemo<BatchStockAdjustmentInput[]>(() => {
    const list: BatchStockAdjustmentInput[] = [];
    for (const p of products) {
      const d = drafts[p.id];
      if (!d || d.qtyInput.trim() === '') continue;
      const num = parseFloat(d.qtyInput);
      if (!Number.isFinite(num) || num < 0) continue;
      if (mode === 'delta' && num === 0) continue;

      const delta = mode === 'set' ? Number((num - p.stock).toFixed(3)) : num;
      if (mode === 'set' && delta === 0 && !d.expiryInput && !d.costInput) continue;

      let resolvedCapital: number | undefined;
      if (mode === 'delta' && d.costInput.trim() !== '') {
        const enteredCost = parseFloat(d.costInput);
        if (Number.isFinite(enteredCost) && enteredCost >= 0) {
          resolvedCapital =
            d.useWeightedAvg && Number(p.capital) > 0 && p.stock > 0
              ? computeWeightedAverageCapital(p.stock, Number(p.capital), num, enteredCost)
              : Number(enteredCost.toFixed(4));
        }
      }

      list.push({
        productId: p.id,
        mode,
        value: num,
        reason,
        note: note.trim() || undefined,
        newExpiry: mode === 'delta' && d.expiryInput ? d.expiryInput : undefined,
        newCapital: resolvedCapital,
      });
    }
    return list;
  }, [products, drafts, mode, reason, note]);

  const changedIds = useMemo(() => new Set(adjustments.map((a) => a.productId)), [adjustments]);

  const summary = useMemo(() => {
    const prodMap = new Map(products.map((p) => [p.id, p]));
    let netDelta = 0;
    let estCostCents = 0;
    for (const adj of adjustments) {
      const p = prodMap.get(adj.productId);
      if (!p) continue;
      const d = adj.mode === 'set' ? adj.value - p.stock : adj.value;
      netDelta += d;
      if (d > 0) {
        const unitCap =
          adj.newCapital !== undefined
            ? adj.newCapital
            : Number(p.capital) > 0
              ? Number(p.capital)
              : 0;
        estCostCents += Math.round(unitCap * d * 100);
      }
    }
    return {
      count: adjustments.length,
      netDelta: Number(netDelta.toFixed(3)),
      estCost: round2(estCostCents / 100),
    };
  }, [adjustments, products]);

  const visibleProducts = useMemo(() => {
    const q = search.trim();
    return products.filter((p) => {
      if (onlyChanged && !changedIds.has(p.id)) return false;
      if (!q) return true;
      return matchesInventorySearch(p, q);
    });
  }, [products, search, onlyChanged, changedIds]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adjustments.length === 0) return;
    onApplyBatch(adjustments);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white w-full max-w-3xl rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col max-h-[94dvh] gap-3"
      >
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h3 className="font-extrabold text-base text-slate-900">
              {mode === 'delta' ? 'Batch Receive / Restock' : 'Physical Shelf Cycle Count'}
            </h3>
            <p className="text-[11px] text-slate-500">
              {mode === 'delta'
                ? 'Receive multiple deliveries in one step with optional weighted-average capital.'
                : 'Enter actual counted shelf stock — exact variance is logged automatically.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close batch stock modal"
            className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switch */}
        <div className="grid grid-cols-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleSwitchMode('delta')}
            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'delta'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            <PackagePlus className="w-4 h-4 shrink-0" />
            <span>Batch Receive (+Qty)</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('set')}
            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'set'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <span>Physical Audit (= Count)</span>
          </button>
        </div>

        {/* Filter & Batch Note Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 shrink-0 text-xs">
          <div className="relative sm:col-span-5">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Scan barcode or search product..."
              aria-label="Search batch products"
              className="w-full pl-9 pr-3 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
          <div className="sm:col-span-3">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as StockLogEntry['reason'])}
              aria-label="Batch adjustment reason"
              className="w-full px-3 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700"
            >
              <option value="Restock">Restock / Delivery</option>
              <option value="Count Correction">Count Correction</option>
              <option value="Spoilage / Expired">Spoilage / Expired</option>
              <option value="Damage">Damage</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="sm:col-span-4">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={80}
              placeholder="Supplier / DR# / Audit note..."
              aria-label="Batch reference note"
              className="w-full px-3 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 shrink-0 px-1">
          <span>
            Showing {visibleProducts.length} of {products.length} items
          </span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={onlyChanged}
              onChange={(e) => setOnlyChanged(e.target.checked)}
              className="w-4 h-4 accent-emerald-600"
            />
            <span>Changed only ({summary.count})</span>
          </label>
        </div>

        {/* Rows List */}
        <div className="flex-1 min-h-0 overflow-y-auto scroll-contain border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {visibleProducts.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No matching products. Clear filters or enter counts to update inventory.
            </div>
          ) : (
            visibleProducts.map((p) => {
              const d = drafts[p.id];
              const valStr = d?.qtyInput ?? '';
              const parsed = valStr.trim() !== '' ? parseFloat(valStr) : NaN;
              const isValid = Number.isFinite(parsed) && parsed >= 0;
              const nextStk =
                isValid && mode === 'set'
                  ? parsed
                  : isValid && mode === 'delta'
                    ? Number((p.stock + parsed).toFixed(3))
                    : p.stock;
              const delta = isValid ? Number((nextStk - p.stock).toFixed(3)) : 0;
              const isModified = isValid && (mode === 'delta' ? parsed > 0 : delta !== 0);
              const costNum = d?.costInput?.trim() ? parseFloat(d.costInput) : NaN;
              const weightedPreview =
                mode === 'delta' &&
                isValid &&
                parsed > 0 &&
                Number.isFinite(costNum) &&
                costNum >= 0 &&
                d?.useWeightedAvg &&
                Number(p.capital) > 0 &&
                p.stock > 0
                  ? computeWeightedAverageCapital(p.stock, Number(p.capital), parsed, costNum)
                  : null;

              return (
                <div
                  key={p.id}
                  className={`p-3 flex flex-col gap-2 ${isModified ? 'bg-emerald-50/40' : 'bg-white'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs text-slate-900 truncate">{p.name}</div>
                      <div className="text-[11px] font-mono-num text-slate-500">
                        {p.barcode} · On hand:{' '}
                        <strong className="text-slate-800">
                          {p.stock} {p.unit}
                        </strong>
                        {Number(p.capital) > 0 ? ` · Cap ${formatPeso(p.capital)}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => bumpQty(p, mode === 'set' ? -1 : -1)}
                        aria-label={`Decrease ${mode === 'delta' ? 'add qty' : 'count'} for ${p.name}`}
                        className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={valStr}
                        onChange={(e) => updateDraft(p.id, { qtyInput: e.target.value })}
                        placeholder={mode === 'set' ? String(p.stock) : '+0'}
                        aria-label={`${mode === 'delta' ? 'Add quantity' : 'Counted stock'} for ${p.name}`}
                        className="w-24 min-h-[44px] px-2 text-center border border-slate-300 rounded-xl font-mono-num font-bold text-sm bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => bumpQty(p, mode === 'delta' && p.unit !== 'kg' ? 5 : 1)}
                        aria-label={`Increase ${mode === 'delta' ? 'add qty' : 'count'} for ${p.name}`}
                        className="w-11 h-11 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {(isModified || mode === 'delta') && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      {mode === 'delta' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex items-center gap-1 text-slate-600">
                            <span>New Cost ₱:</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={d?.costInput ?? ''}
                              onChange={(e) => updateDraft(p.id, { costInput: e.target.value })}
                              placeholder={Number(p.capital) > 0 ? String(p.capital) : 'optional'}
                              className="w-20 px-2 py-1 border border-slate-200 rounded-lg font-mono-num bg-white text-slate-800"
                            />
                          </label>
                          {d?.costInput && Number(p.capital) > 0 && p.stock > 0 && (
                            <label className="inline-flex items-center gap-1 text-indigo-700 font-semibold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={d.useWeightedAvg}
                                onChange={(e) =>
                                  updateDraft(p.id, { useWeightedAvg: e.target.checked })
                                }
                                className="w-3.5 h-3.5 accent-indigo-600"
                              />
                              <span>
                                Avg Cap{weightedPreview !== null ? ` (${formatPeso(weightedPreview)})` : ''}
                              </span>
                            </label>
                          )}
                        </div>
                      )}

                      {isModified && (
                        <div className="font-mono-num font-extrabold ml-auto">
                          <span className={delta >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                            {delta >= 0 ? `+${delta}` : delta} {p.unit}
                          </span>
                          <span className="text-slate-400 mx-1">→</span>
                          <span className="text-slate-900">
                            {nextStk} {p.unit}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 shrink-0">
          <div className="text-xs font-mono-num text-slate-600">
            <strong className="text-slate-900">{summary.count}</strong> SKU(s) queued · Net{' '}
            <strong className={summary.netDelta >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
              {summary.netDelta >= 0 ? `+${summary.netDelta}` : summary.netDelta}
            </strong>{' '}
            units
            {summary.estCost > 0 ? ` · Est. restock cost ${formatPeso(summary.estCost)}` : ''}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 min-h-[44px] rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adjustments.length === 0}
              className="flex-1 sm:flex-none px-5 min-h-[44px] rounded-2xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-emerald-400 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Save {summary.count > 0 ? `${summary.count} ` : ''}Stock Update(s)</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
