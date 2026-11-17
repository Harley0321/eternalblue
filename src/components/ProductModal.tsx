import React, { useEffect, useState } from 'react';
import { Camera, Wand2, X } from 'lucide-react';
import type { Product } from '../types';
import { BASE_CATEGORIES, formatPeso, normBarcode, round2, scEligibleProduct, scSuggest } from '../utils/posMath';

interface ProductModalProps {
  open: boolean;
  editingProduct: Product | null;
  initialBarcode?: string;
  allProducts: Product[];
  onOpenScanner: () => void;
  onSave: (productData: Omit<Product, 'id'>, editId?: string) => void;
  onClose: () => void;
  onToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  open,
  editingProduct,
  initialBarcode,
  allProducts,
  onOpenScanner,
  onSave,
  onClose,
  onToast,
}) => {
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('Rice & Staples');
  const [newCategory, setNewCategory] = useState('');
  const [unit, setUnit] = useState('pc');
  const [capital, setCapital] = useState('');
  const [retail, setRetail] = useState('');
  const [wholesale, setWholesale] = useState('');
  const [minQty, setMinQty] = useState('10');
  const [stock, setStock] = useState('20');
  const [expiry, setExpiry] = useState('');
  const [scEligible, setScEligible] = useState(false);
  const [scTouched, setScTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingProduct) {
      setName(editingProduct.name);
      setBarcode(editingProduct.barcode);
      setCategory(editingProduct.category || 'Rice & Staples');
      setNewCategory('');
      setUnit(editingProduct.unit || 'pc');
      setCapital(Number(editingProduct.capital) > 0 ? String(editingProduct.capital) : '');
      setRetail(String(editingProduct.retailPrice));
      setWholesale(String(editingProduct.wholesalePrice));
      setMinQty(String(editingProduct.wholesaleMinQty > 0 ? editingProduct.wholesaleMinQty : 10));
      setStock(String(editingProduct.stock));
      setExpiry(editingProduct.expiry || '');
      setScEligible(scEligibleProduct(editingProduct));
      setScTouched(true);
    } else {
      setName('');
      setBarcode(initialBarcode || `480${Date.now().toString().slice(-10)}`);
      setCategory('Rice & Staples');
      setNewCategory('');
      setUnit('pc');
      setCapital('');
      setRetail('');
      setWholesale('');
      setMinQty('10');
      setStock('20');
      setExpiry('');
      setScEligible(false);
      setScTouched(false);
    }
  }, [open, editingProduct]);

  // Update barcode when camera scanner returns a barcode into an already-open modal
  useEffect(() => {
    if (open && initialBarcode && !editingProduct) {
      setBarcode(initialBarcode);
    }
  }, [open, initialBarcode, editingProduct]);

  if (!open) return null;

  const categories = Array.from(
    new Set([...BASE_CATEGORIES, ...allProducts.map((p) => p.category).filter(Boolean)]),
  );

  const duplicateMatch = barcode.trim()
    ? allProducts.find(
        (p) =>
          p.id !== editingProduct?.id &&
          normBarcode(p.barcode) !== '' &&
          normBarcode(p.barcode) === normBarcode(barcode),
      )
    : undefined;

  const capNum = parseFloat(capital) || 0;
  const retailNum = parseFloat(retail);
  const whsNum = wholesale.trim() !== '' ? parseFloat(wholesale) : retailNum;

  const marginLines: string[] = [];
  let marginBad = false;
  let marginWarn = false;
  if (capNum > 0 && !Number.isNaN(retailNum)) {
    if (retailNum < capNum) {
      marginBad = true;
      marginLines.push(`Selling price is below capital — you lose ${formatPeso(capNum - retailNum)} per unit.`);
    } else {
      const pct = retailNum > 0 ? ((retailNum - capNum) / retailNum) * 100 : 0;
      marginLines.push(`Profit ${formatPeso(retailNum - capNum)} per unit (${pct.toFixed(1)}% margin).`);
    }
    if (!Number.isNaN(whsNum) && whsNum < capNum) {
      marginBad = true;
      marginLines.push(`Wholesale price is below capital — you lose ${formatPeso(capNum - whsNum)} per unit.`);
    }
    if (!Number.isNaN(whsNum) && whsNum > retailNum) {
      marginWarn = true;
      marginLines.push('Wholesale price is higher than the selling price, so wholesale pricing will not be used.');
    } else if (!Number.isNaN(whsNum) && whsNum < retailNum && whsNum >= capNum) {
      const mq = parseInt(minQty, 10) || 10;
      const wpct = whsNum > 0 ? ((whsNum - capNum) / whsNum) * 100 : 0;
      marginLines.push(`Wholesale (${mq}+ units): profit ${formatPeso(whsNum - capNum)} per unit (${wpct.toFixed(1)}% margin).`);
    }
  }

  const handleNameChange = (val: string) => {
    setName(val);
    if (!scTouched && !editingProduct) {
      setScEligible(scSuggest({ name: val, category }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanBarcode = barcode.trim() || `480${Date.now().toString().slice(-10)}`;
    let finalCategory = category;
    if (finalCategory === '__new__') {
      const cleaned = newCategory.trim().replace(/\s+/g, ' ');
      if (!cleaned) {
        onToast('Please type the new category name', 'warning');
        return;
      }
      const existing = categories.find((c) => c.toLowerCase() === cleaned.toLowerCase());
      finalCategory = existing || cleaned;
    }

    const rawCap = parseFloat(capital) || 0;
    const rawRet = parseFloat(retail);
    const rawWhs = wholesale.trim() !== '' ? parseFloat(wholesale) : rawRet;
    const rawMin = parseInt(minQty, 10) || 10;
    const rawStk = parseFloat(stock) || 0;

    if (!cleanName || !Number.isFinite(rawRet) || rawRet <= 0) {
      onToast('Please enter product name and a selling price above zero', 'warning');
      return;
    }
    if (
      rawCap < 0 ||
      !Number.isFinite(rawCap) ||
      !Number.isFinite(rawWhs) ||
      rawWhs < 0 ||
      rawStk < 0 ||
      !Number.isFinite(rawStk)
    ) {
      onToast('Capital, wholesale price and stock cannot be negative', 'warning');
      return;
    }

    onSave(
      {
        name: cleanName,
        barcode: cleanBarcode,
        category: finalCategory,
        unit,
        capital: Number(rawCap.toFixed(4)),
        retailPrice: round2(rawRet),
        wholesalePrice: round2(rawWhs),
        wholesaleMinQty: rawMin,
        stock: Number(rawStk.toFixed(3)),
        expiry: expiry || '',
        scEligible,
      },
      editingProduct?.id,
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-3 max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-base text-slate-900">
            {editingProduct ? 'Edit Product' : 'Add New Product'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close product modal"
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5 text-xs">
          <div>
            <label className="font-bold text-slate-600 block mb-1">Product Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl"
              required
            />
          </div>

          <div>
            <label className="font-bold text-slate-600 block mb-1">Barcode</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl font-mono-num"
              />
              <button
                type="button"
                onClick={() => {
                  const body12 = `480${Date.now().toString().slice(-9)}`.padEnd(12, '0').slice(0, 12);
                  let sum = 0;
                  for (let i = 0; i < 12; i++) {
                    sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
                  }
                  const check = (10 - (sum % 10)) % 10;
                  setBarcode(`${body12}${check}`);
                }}
                aria-label="Generate store EAN-13 barcode"
                title="Generate valid EAN-13"
                className="px-3 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center gap-1 cursor-pointer shrink-0"
              >
                <Wand2 className="w-4 h-4" />
                <span className="hidden sm:inline">Gen</span>
              </button>
              <button
                type="button"
                onClick={onOpenScanner}
                aria-label="Scan barcode for product"
                className="px-3 min-h-[44px] rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold flex items-center justify-center cursor-pointer shrink-0"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            {duplicateMatch && (
              <p className="text-[11px] font-bold text-amber-700 mt-1">
                Warning: Barcode already assigned to "{duplicateMatch.name}".
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-slate-600 block mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__new__">+ Create new category…</option>
              </select>
              {category === '__new__' && (
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  maxLength={40}
                  placeholder="New category name"
                  className="w-full mt-1.5 px-3 py-2.5 border border-indigo-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              )}
            </div>

            <div>
              <label className="font-bold text-slate-600 block mb-1">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl"
              >
                <option value="pc">pc (Piece)</option>
                <option value="kg">kg (Kilogram)</option>
                <option value="pack">pack</option>
                <option value="box">box</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-600 block mb-1">
              Capital (₱) <span className="font-normal text-slate-400">— cost per unit</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono-num"
            />
            {capNum > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className="text-[10px] font-bold text-slate-500">Quick markup:</span>
                {[15, 20, 25, 30].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setRetail(String(round2(capNum * (1 + pct / 100))))}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 font-mono-num font-bold text-[10px] cursor-pointer"
                  >
                    +{pct}% ({formatPeso(round2(capNum * (1 + pct / 100)))})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-slate-600 block mb-1">Selling Price (₱) *</label>
              <input
                type="number"
                step="0.01"
                value={retail}
                onChange={(e) => setRetail(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono-num"
                required
              />
            </div>
            <div>
              <label className="font-bold text-slate-600 block mb-1">Wholesale Price (₱)</label>
              <input
                type="number"
                step="0.01"
                value={wholesale}
                onChange={(e) => setWholesale(e.target.value)}
                placeholder="Same as selling"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono-num"
              />
            </div>
          </div>

          {marginLines.length > 0 && (
            <div
              className={`rounded-xl px-3 py-2 text-[11px] font-bold space-y-0.5 border ${
                marginBad
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : marginWarn
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {marginLines.map((l, idx) => (
                <div key={idx}>{l}</div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-slate-600 block mb-1">Wholesale Min Qty</label>
              <input
                type="number"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono-num"
              />
            </div>
            <div>
              <label className="font-bold text-slate-600 block mb-1">Current Stock</label>
              <input
                type="number"
                step="0.01"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono-num"
              />
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
            <input
              type="checkbox"
              checked={scEligible}
              onChange={(e) => {
                setScEligible(e.target.checked);
                setScTouched(true);
              }}
              className="w-4 h-4 mt-0.5 accent-emerald-600"
            />
            <span className="text-[11px] text-amber-900">
              <b>Senior/PWD 5% discount applies</b>
              <br />
              Tick only for basic necessities and prime commodities (rice, canned fish, milk, bread,
              noodles, coffee, cooking oil, soap, etc.).
            </span>
          </label>

          <div>
            <label className="font-bold text-slate-600 block mb-1">
              Expiry Date{' '}
              <span className="font-normal text-slate-400">(leave blank if it doesn't expire)</span>
            </label>
            <input
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono-num"
            />
            <div className="text-[10px] text-slate-400 mt-1">
              Items are blocked from sale on their expiry date and after.
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3 min-h-[44px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs cursor-pointer"
        >
          Save Product
        </button>
      </form>
    </div>
  );
};
