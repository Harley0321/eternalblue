import React from 'react';
import { Copy, PackagePlus, X } from 'lucide-react';
import type { Product, SaleRecord, StoreSettings } from '../types';
import { computeReorderList, formatPeso, reorderSettingNum } from '../utils/posMath';
import type { BatchPrefillItem } from './BatchStockModal';

interface ReorderModalProps {
  open: boolean;
  products: Product[];
  sales: SaleRecord[];
  settings: StoreSettings;
  onUpdateDays: (leadDays: number, safetyDays: number) => void;
  onOpenBatchReorder: (prefill: BatchPrefillItem[]) => void;
  onQuickRestock: (productId: string) => void;
  onClose: () => void;
  onToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
}

export const ReorderModal: React.FC<ReorderModalProps> = ({
  open,
  products,
  sales,
  settings,
  onUpdateDays,
  onOpenBatchReorder,
  onQuickRestock,
  onClose,
  onToast,
}) => {
  if (!open) return null;

  const lead = reorderSettingNum(settings.reorderLeadDays, 3);
  const safety = reorderSettingNum(settings.reorderSafetyDays, 2);
  const { rows, days, hasSales } = computeReorderList(products, sales, settings);
  const totalCost = rows.reduce((a, r) => a + (r.cost || 0), 0);
  const noCap = rows.filter((r) => r.cost === null).length;

  const copyReorderText = async () => {
    if (!rows.length) return;
    const text = [
      `${settings.storeName} — Reorder List (${new Date().toLocaleDateString('en-PH')})`,
      ...rows.map((r) => `- ${r.p.name}: ${r.suggest} ${r.p.unit}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      onToast('Reorder list copied to clipboard');
    } catch {
      onToast('Could not copy to clipboard', 'warning');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-3xl p-5 shadow-2xl space-y-3 max-h-[92dvh] flex flex-col">
        <div className="flex items-center justify-between gap-2 shrink-0">
          <h3 className="font-extrabold text-base text-slate-900">Reorder Suggestions</h3>
          <div className="flex items-center gap-2 shrink-0">
            {rows.length > 0 && (
              <button
                type="button"
                onClick={copyReorderText}
                className="px-3 min-h-[40px] rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy List</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close reorder suggestions"
              className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs shrink-0">
          <div>
            <label className="font-bold text-slate-600 block mb-1">Supplier lead time (days)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={lead}
              onChange={(e) => onUpdateDays(reorderSettingNum(e.target.value, 3), safety)}
              className="w-full px-3 min-h-[44px] border border-slate-200 rounded-xl font-mono-num"
            />
          </div>
          <div>
            <label className="font-bold text-slate-600 block mb-1">Safety stock (days of sales)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={safety}
              onChange={(e) => onUpdateDays(lead, reorderSettingNum(e.target.value, 2))}
              className="w-full px-3 min-h-[44px] border border-slate-200 rounded-xl font-mono-num"
            />
          </div>
        </div>

        {hasSales && (
          <div className="text-[11px] font-bold text-slate-600 shrink-0">
            {rows.length
              ? `${rows.length} item(s) to reorder · Capital needed: ${formatPeso(totalCost)}${
                  noCap ? ` (+ ${noCap} item(s) without capital)` : ''
                } · Based on the last ${days} day(s) of sales`
              : `Nothing to reorder right now · Based on the last ${days} day(s) of sales`}
          </div>
        )}

        <div className="space-y-1.5 overflow-y-auto scroll-contain flex-1 min-h-0">
          {!hasSales ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No sales in the last 30 days yet. Suggestions appear once you have sales to learn from.
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              All selling items are above their reorder point.
            </div>
          ) : (
            rows.map((r) => (
              <div
                key={r.p.id}
                className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-bold text-xs text-slate-900 truncate">{r.p.name}</div>
                  <div
                    className={`text-[11px] font-mono-num font-bold ${
                      r.p.stock <= 0 ? 'text-rose-600' : 'text-amber-600'
                    }`}
                  >
                    Stock: {Number(r.p.stock.toFixed(2))} {r.p.unit} · Reorder at{' '}
                    {Number(r.rop.toFixed(1))}
                  </div>
                  <div className="text-[10px] font-mono-num text-slate-500">
                    Sells about {Number(r.avg.toFixed(2))} {r.p.unit}/day
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className="font-extrabold text-xs text-emerald-700 font-mono-num">
                      Order {r.suggest} {r.p.unit}
                    </div>
                    <div className="text-[10px] font-mono-num text-slate-500">
                      {r.cost !== null ? formatPeso(r.cost) : 'set capital'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onQuickRestock(r.p.id)}
                    aria-label={`Restock ${r.p.name}`}
                    className="px-2.5 min-h-[38px] rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs cursor-pointer whitespace-nowrap"
                  >
                    ±
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 pt-1">
          <div className="text-[10px] text-slate-400">
            Reorder point = average daily sales × lead time + safety stock. Suggested order brings
            stock up to the reorder point plus 7 days of selling.
          </div>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onOpenBatchReorder(
                  rows.map((r) => ({
                    productId: r.p.id,
                    value: r.suggest,
                    note: 'Suggested reorder restock',
                  })),
                )
              }
              className="px-4 min-h-[44px] rounded-2xl bg-slate-900 hover:bg-slate-800 text-emerald-400 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <PackagePlus className="w-4 h-4 shrink-0" />
              <span>Receive All in Batch</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

