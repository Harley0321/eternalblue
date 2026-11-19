import React, { useEffect, useState } from 'react';
import { PosMath } from '../domain/posMath';
import { usePos } from '../state/PosContext';

export const BatchStockModal: React.FC = () => {
  const { state, setBatchModalOpen, applyBatchStock } = usePos();
  const [isCycleCount, setIsCycleCount] = useState(false);
  const [note, setNote] = useState('');
  const [entries, setEntries] = useState<Record<string, string>>({});

  useEffect(() => {
    if (state.batchModalOpen) {
      setEntries({});
      setNote('');
    }
  }, [state.batchModalOpen]);

  if (!state.batchModalOpen) return null;

  const handleApply = () => {
    const map: Record<string, number> = {};
    for (const [k, v] of Object.entries(entries)) {
      const parsed = parseFloat(v);
      if (Number.isFinite(parsed)) map[k] = parsed;
    }
    applyBatchStock(map, isCycleCount, note);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        <div className="px-5 pt-5 pb-3 border-b border-[#E2E8F0]">
          <h3 className="font-bold text-base text-[#0F172A]">Batch Stock Receive / Cycle Audit</h3>
        </div>

        <div className="p-5 space-y-2.5 flex-1 overflow-y-auto">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsCycleCount(false)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                !isCycleCount
                  ? 'bg-[#ECFDF5] border-[#059669] text-[#047857]'
                  : 'bg-white border-[#E2E8F0] text-[#64748B]'
              }`}
            >
              Receive (+Qty)
            </button>
            <button
              type="button"
              onClick={() => setIsCycleCount(true)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                isCycleCount
                  ? 'bg-[#ECFDF5] border-[#059669] text-[#047857]'
                  : 'bg-white border-[#E2E8F0] text-[#64748B]'
              }`}
            >
              Cycle Audit (=Qty)
            </button>
          </div>

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="DR / Supplier Note"
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
          />

          <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
            {state.products.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-[#0F172A] truncate">{p.name}</div>
                  <div className="text-[10px] text-[#64748B]">
                    Curr: {PosMath.formatQty(p.stock, p.unit)}
                  </div>
                </div>
                <input
                  type="number"
                  value={entries[p.id] ?? ''}
                  onChange={(e) => setEntries((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder="0"
                  className="w-24 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-[#E2E8F0]"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setBatchModalOpen(false)}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748B] hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold cursor-pointer"
          >
            Apply Batch
          </button>
        </div>
      </div>
    </div>
  );
};

export const StockLogModal: React.FC = () => {
  const { state, setStockLogModalOpen } = usePos();
  if (!state.stockLogModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden shadow-xl">
        <div className="px-5 pt-5 pb-3 border-b border-[#E2E8F0]">
          <h3 className="font-bold text-base text-[#0F172A]">Stock Movement Log</h3>
        </div>

        <div className="p-5 overflow-y-auto space-y-2 flex-1">
          {state.stockLog.length === 0 ? (
            <p className="text-[13px] text-[#64748B]">No stock adjustments recorded yet.</p>
          ) : (
            state.stockLog.map((log) => (
              <div key={log.id} className="pb-2 border-b border-[#E2E8F0] last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-[#0F172A] truncate">{log.productName}</span>
                  <span
                    className={`font-mono font-extrabold text-xs shrink-0 ${
                      log.delta >= 0 ? 'text-[#047857]' : 'text-[#E11D48]'
                    }`}
                  >
                    {log.delta >= 0 ? '+' : ''}
                    {PosMath.formatQty(log.delta)}
                  </span>
                </div>
                <div className="text-[10px] text-[#64748B] mt-0.5">
                  {log.reason}
                  {log.note ? ` · ${log.note}` : ''} ({PosMath.formatDateTime(log.dateIso)})
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end">
          <button
            type="button"
            onClick={() => setStockLogModalOpen(false)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-[#059669] hover:bg-emerald-50 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
