import React, { useMemo, useState } from 'react';
import { Download, History, Search, X } from 'lucide-react';
import type { StockLogEntry } from '../types';
import { escapeCsvCell } from '../utils/posMath';

interface StockLogModalProps {
  open: boolean;
  stockLog: StockLogEntry[];
  onClose: () => void;
  onToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
}

export const StockLogModal: React.FC<StockLogModalProps> = ({
  open,
  stockLog,
  onClose,
  onToast,
}) => {
  const [query, setQuery] = useState('');
  const [reasonFilter, setReasonFilter] = useState<'ALL' | StockLogEntry['reason']>('ALL');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stockLog.filter((entry) => {
      if (reasonFilter !== 'ALL' && entry.reason !== reasonFilter) return false;
      if (!q) return true;
      return (
        entry.productName.toLowerCase().includes(q) ||
        (entry.note || '').toLowerCase().includes(q) ||
        entry.reason.toLowerCase().includes(q)
      );
    });
  }, [stockLog, query, reasonFilter]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const l of filtered) {
      if (l.delta > 0) added += l.delta;
      else removed += Math.abs(l.delta);
    }
    return {
      entries: filtered.length,
      added: Number(added.toFixed(3)),
      removed: Number(removed.toFixed(3)),
    };
  }, [filtered]);

  if (!open) return null;

  const exportLogCsv = () => {
    const rows: (string | number)[][] = [
      ['Date', 'Product', 'Reason', 'Delta', 'Prev Stock', 'New Stock', 'Note'],
      ...filtered.map((l) => [
        new Date(l.dateIso).toLocaleString('en-PH'),
        l.productName,
        l.reason,
        l.delta,
        l.prevStock,
        l.newStock,
        l.note || '',
      ]),
    ];
    const csv = '\uFEFF' + rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-history-${new Date().toLocaleDateString('en-CA')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    onToast('Stock history CSV downloaded');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col max-h-[92dvh] gap-3">
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-5 h-5 text-slate-700 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-extrabold text-base text-slate-900">Stock Movement History</h3>
              <p className="text-[11px] text-slate-500">
                {stats.entries} logged event(s) · Added +{stats.added} · Deducted −{stats.removed}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={exportLogCsv}
                className="px-3 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close stock history modal"
              className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 shrink-0 text-xs">
          <div className="relative sm:col-span-7">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search item or invoice note..."
              aria-label="Search stock history"
              className="w-full pl-9 pr-3 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
          <div className="sm:col-span-5">
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value as 'ALL' | StockLogEntry['reason'])}
              aria-label="Filter stock movement reason"
              className="w-full px-3 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700"
            >
              <option value="ALL">All Reasons</option>
              <option value="Restock">Restock / Delivery</option>
              <option value="Count Correction">Count Correction</option>
              <option value="Spoilage / Expired">Spoilage / Expired</option>
              <option value="Damage">Damage</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-contain border border-slate-200 rounded-2xl divide-y divide-slate-100 text-xs">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              No stock movement entries found.
            </div>
          ) : (
            filtered.map((entry) => (
              <div key={entry.id} className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 truncate">{entry.productName}</div>
                  <div className="text-[11px] text-slate-500">
                    {entry.reason}
                    {entry.note ? ` · ${entry.note}` : ''} ·{' '}
                    {new Date(entry.dateIso).toLocaleString('en-PH', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="text-right font-mono-num shrink-0">
                  <div
                    className={`font-extrabold ${
                      entry.delta >= 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {entry.prevStock} → {entry.newStock}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
