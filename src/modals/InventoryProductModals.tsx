import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolderPlus, Plus, QrCode, X } from 'lucide-react';
import { findDuplicateBarcodeProduct } from '../domain/barcodeLookup';
import { PosMath } from '../domain/posMath';
import { usePos } from '../state/PosContext';

const NEW_CATEGORY_SENTINEL = '__ADD_NEW_CATEGORY__';

export const ProductModal: React.FC = () => {
  const {
    state,
    availableCategories,
    closeProductModal,
    openScanner,
    addCustomCategory,
    saveProduct,
    deleteProduct,
  } = usePos();
  const existing = state.editingProduct;

  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState(PosMath.BASE_CATEGORIES[0]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [unit, setUnit] = useState('pc');
  const [capital, setCapital] = useState('');
  const [retail, setRetail] = useState('');
  const [wholesale, setWholesale] = useState('');
  const [minQty, setMinQty] = useState('10');
  const [stock, setStock] = useState('0');
  const [expiry, setExpiry] = useState('');
  const [scElig, setScElig] = useState(true);

  const wasOpenRef = useRef(false);

  const categoryOptions = useMemo(() => {
    const trimmed = category.trim();
    if (trimmed && !availableCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      return [...availableCategories, trimmed];
    }
    return availableCategories;
  }, [availableCategories, category]);

  const ownerDefaultMinQty =
    state.settings.defaultWholesaleMinQty > 0 ? state.settings.defaultWholesaleMinQty : 10;

  useEffect(() => {
    if (!state.productModalOpen) {
      wasOpenRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (!justOpened && existing?.id === state.editingProduct?.id) {
      return;
    }
    setName(existing?.name ?? '');
    setBarcode(
      state.productModalScannedBarcode.trim() || existing?.barcode || PosMath.generateEan13()
    );
    setCategory(existing?.category ?? availableCategories[0] ?? PosMath.BASE_CATEGORIES[0]);
    setAddingCategory(false);
    setNewCategoryName('');
    setNewCategoryError(null);
    setUnit(existing?.unit ?? 'pc');
    setCapital(existing?.capital != null ? String(existing.capital) : '');
    setRetail(existing?.retailPrice != null ? String(existing.retailPrice) : '');
    setWholesale(existing?.wholesalePrice != null ? String(existing.wholesalePrice) : '');
    setMinQty(String(existing?.wholesaleMinQty && existing.wholesaleMinQty > 0 ? existing.wholesaleMinQty : ownerDefaultMinQty));
    setStock(String(existing?.stock ?? 0));
    setExpiry(existing?.expiry ?? '');
    setScElig(existing?.scEligible ?? true);
  }, [
    state.productModalOpen,
    existing,
    availableCategories,
    state.productModalScannedBarcode,
    state.editingProduct?.id,
    ownerDefaultMinQty,
  ]);

  useEffect(() => {
    if (!state.productModalOpen) return;
    const scanned = state.productModalScannedBarcode.trim();
    if (scanned) {
      setBarcode(scanned);
    }
  }, [state.productModalOpen, state.productModalScannedBarcode]);

  if (!state.productModalOpen) return null;

  const retailParsed = parseFloat(retail);
  const capParsed = capital.trim() === '' ? null : parseFloat(capital);
  const wsParsed = wholesale.trim() === '' ? retailParsed : parseFloat(wholesale);
  const minQtyParsed = parseFloat(minQty);
  const stockParsed = stock.trim() === '' ? 0 : parseFloat(stock);

  const numericError =
    retail.trim() !== '' && (!Number.isFinite(retailParsed) || retailParsed <= 0)
      ? 'Retail price must be greater than ₱0.00.'
      : capParsed !== null && (!Number.isFinite(capParsed) || capParsed < 0)
      ? 'Capital cannot be negative.'
      : wholesale.trim() !== '' && (!Number.isFinite(wsParsed) || wsParsed < 0)
      ? 'Wholesale price cannot be negative.'
      : !Number.isFinite(minQtyParsed) || minQtyParsed < 1
      ? 'Min wholesale quantity must be at least 1.'
      : !Number.isFinite(stockParsed) || stockParsed < 0
      ? 'Stock quantity cannot be negative.'
      : null;

  const canSave =
    name.trim().length > 0 &&
    Number.isFinite(retailParsed) &&
    retailParsed > 0 &&
    numericError === null;
  const duplicateBarcodeProduct = findDuplicateBarcodeProduct(
    state.products,
    barcode,
    existing?.id ?? null
  );

  const handleSaveNewCategory = () => {
    const res = addCustomCategory(newCategoryName);
    if (!res.ok) {
      setNewCategoryError(res.error ?? 'Enter a category name');
      return;
    }
    setCategory(res.category);
    setAddingCategory(false);
    setNewCategoryName('');
    setNewCategoryError(null);
  };

  const handleSave = () => {
    if (!canSave) return;
    const retailVal = PosMath.round2(retailParsed);
    const wsVal = Number.isFinite(wsParsed) && wsParsed >= 0 ? PosMath.round2(wsParsed) : retailVal;

    saveProduct({
      id: existing?.id ?? `p-${Date.now()}`,
      barcode: barcode.trim(),
      name: name.trim(),
      category: category.trim() || 'General',
      unit: unit.trim() || 'pc',
      capital: capParsed !== null && Number.isFinite(capParsed) ? PosMath.round2(capParsed) : null,
      retailPrice: retailVal,
      wholesalePrice: wsVal,
      wholesaleMinQty: PosMath.round3(Math.max(1, minQtyParsed)),
      stock: PosMath.round3(Math.max(0, stockParsed)),
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
            <label htmlFor="product-name-input" className="text-[11px] font-bold text-[#64748B]">
              Product Name
            </label>
            <input
              id="product-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-0.5 px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
            />
          </div>

          <div>
            <div className="flex items-end gap-1.5">
              <div className="flex-1 min-w-0">
                <label htmlFor="product-barcode-input" className="text-[11px] font-bold text-[#64748B]">
                  Barcode
                </label>
                <input
                  id="product-barcode-input"
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full mt-0.5 px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
                />
              </div>
              <button
                type="button"
                onClick={() => openScanner('productForm')}
                aria-label="Scan barcode"
                title="Scan product barcode with camera or photo"
                className="px-3 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
              >
                <QrCode size={14} />
                <span>Scan</span>
              </button>
              <button
                type="button"
                onClick={() => setBarcode(PosMath.generateEan13())}
                title="Generate random EAN-13 barcode"
                className="px-3 py-2 rounded-xl border border-[#E2E8F0] text-[11px] font-bold hover:bg-slate-50 shrink-0 cursor-pointer"
              >
                EAN
              </button>
            </div>
            {duplicateBarcodeProduct && (
              <p className="mt-1 text-[11px] font-semibold text-[#D97706]">
                Already assigned to {duplicateBarcodeProduct.name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label htmlFor="product-category-select" className="text-[11px] font-bold text-[#64748B]">
                Category
              </label>
              <div className="mt-0.5 flex items-center gap-1.5">
                <select
                  id="product-category-select"
                  value={category}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === NEW_CATEGORY_SENTINEL) {
                      setAddingCategory(true);
                      setNewCategoryError(null);
                    } else {
                      setCategory(val);
                    }
                  }}
                  className="flex-1 min-w-0 px-2.5 py-2 text-xs font-semibold text-[#0F172A] bg-white rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669] cursor-pointer"
                >
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY_SENTINEL}>+ New Category…</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setAddingCategory((prev) => !prev);
                    setNewCategoryError(null);
                  }}
                  aria-label="New category"
                  title="Create new category for future use"
                  className={`px-2.5 py-2 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
                    addingCategory
                      ? 'bg-[#EEF2FF] border-[#4F46E5] text-[#4F46E5]'
                      : 'border-[#E2E8F0] text-[#4F46E5] hover:bg-indigo-50'
                  }`}
                >
                  <Plus size={13} />
                  <span>New</span>
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="product-unit-input" className="text-[11px] font-bold text-[#64748B]">
                Unit
              </label>
              <input
                id="product-unit-input"
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
              />
            </div>
          </div>

          {addingCategory && (
            <div className="rounded-xl bg-[#F8FAFC] border border-[#C7D2FE] p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="new-category-name-input"
                  className="text-[11px] font-bold text-[#4F46E5] inline-flex items-center gap-1"
                >
                  <FolderPlus size={13} />
                  <span>New Category (saved for future products)</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setAddingCategory(false);
                    setNewCategoryError(null);
                  }}
                  aria-label="Cancel new category"
                  className="p-0.5 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  id="new-category-name-input"
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => {
                    setNewCategoryName(e.target.value);
                    if (newCategoryError) setNewCategoryError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveNewCategory();
                    }
                  }}
                  placeholder="e.g. Hardware & Tools"
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#4F46E5]"
                />
                <button
                  type="button"
                  onClick={handleSaveNewCategory}
                  className="px-3 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  Save Category
                </button>
              </div>
              {newCategoryError && (
                <p className="text-[11px] font-semibold text-[#E11D48]">{newCategoryError}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="product-capital-input" className="text-[11px] font-bold text-[#64748B]">
                Capital (₱)
              </label>
              <input
                id="product-capital-input"
                type="number"
                min="0"
                step="0.01"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
              />
            </div>
            <div>
              <label htmlFor="product-retail-input" className="text-[11px] font-bold text-[#64748B]">
                Retail (₱)
              </label>
              <input
                id="product-retail-input"
                type="number"
                min="0.01"
                step="0.01"
                value={retail}
                onChange={(e) => setRetail(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="product-wholesale-input" className="text-[11px] font-bold text-[#64748B]">
                Auto Wholesale (₱)
              </label>
              <input
                id="product-wholesale-input"
                type="number"
                min="0"
                step="0.01"
                value={wholesale}
                onChange={(e) => setWholesale(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
              />
            </div>
            <div>
              <label htmlFor="product-minqty-input" className="text-[11px] font-bold text-[#64748B]">
                Min Wholesale Qty
              </label>
              <input
                id="product-minqty-input"
                type="number"
                min="1"
                step="any"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
              />
            </div>
          </div>
          <p className="text-[10px] text-[#64748B]">
            Wholesale price applies automatically in POS once cart quantity reaches Min Wholesale Qty.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="product-stock-input" className="text-[11px] font-bold text-[#64748B]">
                Stock
              </label>
              <input
                id="product-stock-input"
                type="number"
                min="0"
                step="any"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
              />
            </div>
            <div>
              <label htmlFor="product-expiry-input" className="text-[11px] font-bold text-[#64748B]">
                Expiry YYYY-MM-DD
              </label>
              <input
                id="product-expiry-input"
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full mt-0.5 px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
              />
            </div>
          </div>
          {numericError && (
            <p className="text-[11px] font-semibold text-[#E11D48]">{numericError}</p>
          )}

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

  const parsedQty = parseFloat(qtyStr);
  const qtyValid =
    qtyStr.trim() !== '' &&
    Number.isFinite(parsedQty) &&
    parsedQty >= 0 &&
    (mode === 'set' || parsedQty > 0);
  const qty = Number.isFinite(parsedQty) && parsedQty >= 0 ? PosMath.round3(parsedQty) : 0;
  const previewStock =
    mode === 'add'
      ? PosMath.round3(p.stock + qty)
      : mode === 'sub'
      ? PosMath.round3(Math.max(0, p.stock - qty))
      : qty;

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
          min={mode === 'set' ? '0' : '0.001'}
          step="any"
          value={qtyStr}
          onChange={(e) => setQtyStr(e.target.value)}
          placeholder="Quantity"
          className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0]"
        />
        {!qtyValid && (
          <p className="text-[11px] font-semibold text-[#E11D48]">
            {mode === 'set'
              ? 'Enter a valid non-negative stock count.'
              : 'Enter a quantity greater than 0.'}
          </p>
        )}

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
            disabled={!qtyValid}
            onClick={() => applyStockAdjustment(p.id, previewStock, reason, note)}
            className="px-5 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
