import React, { useEffect, useState } from 'react';
import { PosMath } from '../domain/posMath';
import { usePos } from '../state/PosContext';

export const ProductModal: React.FC = () => {
  const { state, closeProductModal, saveProduct, deleteProduct } = usePos();
  const existing = state.editingProduct;

  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState(PosMath.BASE_CATEGORIES[0]);
  const [unit, setUnit] = useState('pc');
  const [capital, setCapital] = useState('');
  const [retail, setRetail] = useState('');
  const [wholesale, setWholesale] = useState('');
  const [minQty, setMinQty] = useState('10');
  const [stock, setStock] = useState('0');
  const [expiry, setExpiry] = useState('');
  const [scElig, setScElig] = useState(true);

  useEffect(() => {
    if (!state.productModalOpen) return;
    setName(existing?.name ?? '');
    setBarcode(
      state.productModalScannedBarcode.trim() || existing?.barcode || PosMath.generateEan13()
    );
    setCategory(existing?.category ?? PosMath.BASE_CATEGORIES[0]);
    setUnit(existing?.unit ?? 'pc');
    setCapital(existing?.capital != null ? String(existing.capital) : '');
    setRetail(existing?.retailPrice != null ? String(existing.retailPrice) : '');
    setWholesale(existing?.wholesalePrice != null ? String(existing.wholesalePrice) : '');
    setMinQty(String(existing?.wholesaleMinQty ?? 10));
    setStock(String(existing?.stock ?? 0));
    setExpiry(existing?.expiry ?? '');
    setScElig(existing?.scEligible ?? true);
  }, [state.productModalOpen, existing, state.productModalScannedBarcode]);

  if (!state.productModalOpen) return null;

  const retailParsed = parseFloat(retail);
  const canSave = name.trim().length > 0 && Number.isFinite(retailParsed) && retailParsed > 0;

  const handleSave = () => {
    const retailVal = Math.max(0, retailParsed || 0);
    const wsParsed = parseFloat(wholesale);
    const wsVal = Number.isFinite(wsParsed) ? Math.max(0, wsParsed) : retailVal;
    const capParsed = parseFloat(capital);

    saveProduct({
      id: existing?.id ?? `p-${Date.now()}`,
      barcode: barcode.trim(),
      name: name.trim(),
      category: category.trim() || 'General',
      unit: unit.trim() || 'pc',
      capital: Number.isFinite(capParsed) ? Math.max(0, capParsed) : null,
      retailPrice: retailVal,
      wholesalePrice: wsVal,
      wholesaleMinQty: Math.max(1, parseFloat(minQty) || 10),
      stock: Math.max(0, parseFloat(stock) || 0),
      lowStockThreshold: existing?.lowStockThreshold ?? null,
      expiry: expiry.trim() || null,
      scEligible: scElig,
      icon: existing?.icon ?? null,
      iconColor: existing?.iconColor ?? null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        <div className="px-5 pt-5 pb-3 border-b border-[#E2E8F0]">
          <h3 className="font-extrabold text-lg text-[#0F172A]">
            {existing ? 'Edit Product' : 'New Product'}
          </h3>
        </div>

        <div className="p-5 overflow-y-auto space-y-2.5">
          <div>
            <label className="text-[11px] font-bold text-[#64748B]">Product Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-0.5 px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
            />
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[11px] font-bold text-[#64748B]">Barcode</label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
              />
            </div>
            <button
              type="button"
              onClick={() => setBarcode(PosMath.generateEan13())}
              className="px-3 py-2 rounded-xl border border-[#E2E8F0] text-[11px] font-bold hover:bg-slate-50 cursor-pointer"
            >
              EAN
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[11px] font-bold text-[#64748B]">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[#64748B]">Unit</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-[#64748B]">Capital (₱)</label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[#64748B]">Retail (₱)</label>
              <input
                type="number"
                value={retail}
                onChange={(e) => setRetail(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-[#64748B]">Wholesale (₱)</label>
              <input
                type="number"
                value={wholesale}
                onChange={(e) => setWholesale(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[#64748B]">Min WS Qty</label>
              <input
                type="number"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-[#64748B]">Stock</label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[#64748B]">Expiry YYYY-MM-DD</label>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-semibold text-[#0F172A]">SC / PWD 5% Eligible</span>
            <button
              type="button"
              role="switch"
              aria-checked={scElig}
              onClick={() => setScElig(!scElig)}
              className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer ${
                scElig ? 'bg-[#059669]' : 'bg-slate-300'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  scElig ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {existing && (
            <button
              type="button"
              onClick={() => deleteProduct(existing.id)}
              className="text-xs font-bold text-[#E11D48] hover:underline cursor-pointer pt-1"
            >
              Delete Product
            </button>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button
            type="button"
            onClick={closeProductModal}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748B] hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export const StockAdjustModal: React.FC = () => {
  const { state, openStockAdjust, applyStockAdjustment } = usePos();
  const p = state.stockAdjustProduct;

  const [mode, setMode] = useState<'add' | 'sub' | 'set'>('add');
  const [qtyStr, setQtyStr] = useState('10');
  const [reason, setReason] = useState('Restock');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (p) {
      setQtyStr('10');
      setNote('');
    }
  }, [p]);

  if (!p) return null;

  const qty = parseFloat(qtyStr) || 0;
  const previewStock =
    mode === 'add' ? p.stock + qty : mode === 'sub' ? Math.max(0, p.stock - qty) : Math.max(0, qty);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3 shadow-xl">
        <h3 className="font-bold text-base text-[#0F172A]">Adjust Stock · {p.name}</h3>
        <div className="text-[13px] font-semibold text-[#0F172A]">
          Current: {PosMath.formatQty(p.stock, p.unit)} → Next: {PosMath.formatQty(previewStock, p.unit)}
        </div>

        <div className="flex gap-1.5">
          {[
            ['add', '+ Add'],
            ['sub', '- Deduct'],
            ['set', '= Set Count'],
          ].map(([id, lbl]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id as 'add' | 'sub' | 'set')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                mode === id
                  ? 'bg-[#ECFDF5] border-[#059669] text-[#047857]'
                  : 'bg-white border-[#E2E8F0] text-[#64748B]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <input
          type="number"
          value={qtyStr}
          onChange={(e) => setQtyStr(e.target.value)}
          placeholder="Quantity"
          className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
        />

        <div className="flex flex-wrap gap-1.5">
          {['Restock', 'Spoilage', 'Count Correction'].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                reason === r
                  ? 'bg-[#EEF2FF] border-[#4F46E5] text-[#4F46E5]'
                  : 'bg-white border-[#E2E8F0] text-[#64748B]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note / DR #"
          className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
        />

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => openStockAdjust(null)}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748B] hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => applyStockAdjustment(p.id, previewStock, reason, note)}
            className="px-5 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
