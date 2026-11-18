import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Product, StockLogEntry } from '../types';
import { computeWeightedAverageCapital, formatPeso } from '../utils/posMath';
import { ProductIconBadge } from './ProductIconBadge';

interface StockAdjustModalProps {
  product: Product | null;
  onClose: () => void;
  onApply: (params: {
    productId: string;
    delta: number;
    reason: StockLogEntry['reason'];
    note: string;
    newExpiry?: string;
    newCapital?: number;
  }) => void;
}

export const StockAdjustModal: React.FC<StockAdjustModalProps> = ({
  product,
  onClose,
  onApply,
}) => {
  const [mode, setMode] = useState<'add' | 'remove' | 'set'>('add');
  const [qtyStr, setQtyStr] = useState('10');
  const [reason, setReason] = useState<StockLogEntry['reason']>('Restock');
  const [note, setNote] = useState('');
  const [newExpiry, setNewExpiry] = useState('');
  const [newCapital, setNewCapital] = useState('');
  const [blendCapital, setBlendCapital] = useState(true);

  useEffect(() => {
    if (!product) return;
    setMode('add');
    setQtyStr(product.unit === 'kg' ? '5' : '10');
    setReason('Restock');
    setNote('');
    setNewExpiry(product.expiry || '');
    setNewCapital(Number(product.capital) > 0 ? String(product.capital) : '');
    setBlendCapital(true);
  }, [product]);

  if (!product) return null;

  const parsedQty = parseFloat(qtyStr);
  const hasNum = Number.isFinite(parsedQty) && parsedQty >= 0;
  const delta =
    mode === 'set'
      ? hasNum
        ? Number((parsedQty - product.stock).toFixed(3))
        : 0
      : mode === 'add'
        ? hasNum
          ? parsedQty
          : 0
        : hasNum
          ? -parsedQty
          : 0;
  const previewStock = Math.max(0, Number((product.stock + delta).toFixed(3)));
  const isActionable =
    mode === 'set' ? hasNum && delta !== 0 : hasNum && parsedQty > 0;

  const existingCap = Number(product.capital) || 0;
  const enteredCap = newCapital.trim() !== '' ? parseFloat(newCapital) : NaN;
  const canBlend =
    mode === 'add' &&
    isActionable &&
    existingCap > 0 &&
    product.stock > 0 &&
    Number.isFinite(enteredCap) &&
    enteredCap >= 0 &&
    enteredCap !== existingCap;
  const blendedCap = canBlend
    ? computeWeightedAverageCapital(product.stock, existingCap, parsedQty, enteredCap)
    : null;

  const presets = product.unit === 'kg' ? [0.5, 1, 5, 10, 25] : [1, 5, 10, 24, 50];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isActionable) return;
    let resolvedCap: number | undefined;
    if (mode === 'add' && Number.isFinite(enteredCap) && enteredCap >= 0) {
      resolvedCap = canBlend && blendCapital && blendedCap !== null ? blendedCap : Number(enteredCap.toFixed(4));
    }
    onApply({
      productId: product.id,
      delta,
      reason,
      note: note.trim(),
      newExpiry: mode === 'add' && newExpiry !== (product.expiry || '') ? newExpiry : undefined,
      newCapital: resolvedCap,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-3.5 max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <ProductIconBadge product={product} size="md" />
            <div className="min-w-0">
              <h3 className="font-extrabold text-base text-slate-900">Quick Stock Adjustment</h3>
              <p className="text-xs text-slate-500 truncate">{product.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close stock adjustment"
            className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMode('add');
              setReason('Restock');
              setQtyStr(product.unit === 'kg' ? '5' : '10');
            }}
            className={`py-2 min-h-[44px] rounded-xl font-extrabold text-xs border cursor-pointer ${
              mode === 'add'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            + Add
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('remove');
              setReason('Spoilage / Expired');
              setQtyStr('1');
            }}
            className={`py-2 min-h-[44px] rounded-xl font-extrabold text-xs border cursor-pointer ${
              mode === 'remove'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            − Remove
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('set');
              setReason('Count Correction');
              setQtyStr(String(product.stock));
            }}
            className={`py-2 min-h-[44px] rounded-xl font-extrabold text-xs border cursor-pointer ${
              mode === 'set'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            = Set Count
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div>
            <label className="font-bold text-slate-600 block mb-1">
              {mode === 'set' ? `Counted Stock (${product.unit})` : `Quantity (${product.unit})`}
            </label>
            <input
              type="number"
              step="any"
              min={mode === 'set' ? '0' : '0.001'}
              value={qtyStr}
              onChange={(e) => setQtyStr(e.target.value)}
              className="w-full px-3 min-h-[44px] border border-slate-300 rounded-xl font-mono-num font-bold text-sm"
              required
            />
          </div>
          <div>
            <label className="font-bold text-slate-600 block mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as StockLogEntry['reason'])}
              className="w-full px-3 min-h-[44px] border border-slate-300 rounded-xl font-semibold"
            >
              <option value="Restock">Restock / Delivery</option>
              <option value="Count Correction">Count Correction</option>
              <option value="Spoilage / Expired">Spoilage / Expired</option>
              <option value="Damage">Damaged</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        {mode !== 'set' ? (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setQtyStr(String(preset))}
                className={`px-3 min-h-[36px] rounded-xl text-xs font-mono-num font-bold border cursor-pointer ${
                  parseFloat(qtyStr) === preset
                    ? 'bg-slate-900 text-emerald-400 border-slate-900'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {mode === 'add' ? `+${preset}` : `−${preset}`}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setQtyStr('0')}
              className="px-3 min-h-[36px] rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer"
            >
              0 (Empty Shelf)
            </button>
            <button
              type="button"
              onClick={() => setQtyStr(String(product.stock))}
              className="px-3 min-h-[36px] rounded-xl text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 cursor-pointer"
            >
              Reset to {product.stock}
            </button>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs">
          <span className="text-slate-600 font-semibold">
            Current: <b className="font-mono-num text-slate-900">{product.stock}</b> {product.unit}
          </span>
          <span className="font-extrabold font-mono-num text-emerald-700">
            New Stock: {previewStock} {product.unit}
            {mode === 'set' && delta !== 0 ? ` (${delta > 0 ? `+${delta}` : delta})` : ''}
          </span>
        </div>

        {mode === 'add' && (
          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Batch Expiry (optional)</label>
                <input
                  type="date"
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(e.target.value)}
                  className="w-full px-3 min-h-[40px] border border-slate-200 rounded-xl font-mono-num"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Batch Unit Capital (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newCapital}
                  onChange={(e) => setNewCapital(e.target.value)}
                  placeholder="Keep existing"
                  className="w-full px-3 min-h-[40px] border border-slate-200 rounded-xl font-mono-num"
                />
              </div>
            </div>
            {canBlend && blendedCap !== null && (
              <label className="flex items-center justify-between gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2 cursor-pointer text-[11px] font-bold text-indigo-800">
                <span className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={blendCapital}
                    onChange={(e) => setBlendCapital(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span>Blend weighted avg cost (with current {product.stock} {product.unit})</span>
                </span>
                <span className="font-mono-num shrink-0">{formatPeso(blendedCap)}</span>
              </label>
            )}
          </div>
        )}

        <div className="text-xs">
          <label className="font-bold text-slate-600 block mb-1">Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={80}
            placeholder="Supplier / invoice / remarks..."
            className="w-full px-3 min-h-[44px] border border-slate-200 rounded-xl"
          />
        </div>

        <button
          type="submit"
          disabled={!isActionable}
          className="w-full py-3 min-h-[44px] rounded-2xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-emerald-400 font-extrabold text-xs cursor-pointer"
        >
          Save Stock Adjustment
        </button>
      </form>
    </div>
  );
};

