import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Product } from '../types';
import { scEligibleProduct } from '../utils/posMath';

interface ScReviewModalProps {
  open: boolean;
  products: Product[];
  onSave: (eligibilityMap: Record<string, boolean>) => void;
  onClose: () => void;
}

export const ScReviewModal: React.FC<ScReviewModalProps> = ({
  open,
  products,
  onSave,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [map, setMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    setSearch('');
    const next: Record<string, boolean> = {};
    products.forEach((p) => {
      next[p.id] = scEligibleProduct(p);
    });
    setMap(next);
  }, [open, products]);

  if (!open) return null;

  const q = search.trim().toLowerCase();
  const rows = products.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q),
  );
  const onCount = Object.values(map).filter(Boolean).length;
  const unconfirmed = products.filter((p) => typeof p.scEligible !== 'boolean').length;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-3xl p-5 shadow-2xl space-y-3 max-h-[92dvh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <h3 className="font-extrabold text-base text-slate-900">Senior/PWD 5% Items</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close SC/PWD review"
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-slate-500 shrink-0">
          Tick only the items that are basic necessities or prime commodities. Items marked{' '}
          <b>suggested</b> were guessed from the name and have not been confirmed by you yet.
        </p>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search item or category..."
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs shrink-0"
        />

        <div className="text-[11px] font-bold text-slate-600 shrink-0">
          {onCount} of {products.length} items get the 5% discount
          {unconfirmed ? ` · ${unconfirmed} not yet confirmed` : ''}
        </div>

        <div className="space-y-1.5 overflow-y-auto scroll-contain flex-1 min-h-0">
          {rows.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-6">No matching items.</div>
          ) : (
            rows.slice(0, 300).map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!!map[p.id]}
                  onChange={(e) => setMap((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                  className="w-5 h-5 accent-emerald-600 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block font-bold text-xs text-slate-900 truncate">{p.name}</span>
                  <span className="block text-[10px] text-slate-500">
                    {p.category || ''}
                    {typeof p.scEligible === 'boolean' ? (
                      ''
                    ) : (
                      <>
                        {' · '}
                        <b className="text-amber-700">suggested</b>
                      </>
                    )}
                  </span>
                </span>
              </label>
            ))
          )}
          {rows.length > 300 && (
            <div className="text-[11px] text-slate-400 text-center py-2">
              Showing the first 300 — use search to find others.
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onSave(map)}
          className="w-full py-3 min-h-[44px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shrink-0 cursor-pointer"
        >
          Save
        </button>
      </div>
    </div>
  );
};
