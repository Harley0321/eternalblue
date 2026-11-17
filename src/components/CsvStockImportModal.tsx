import React, { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import type { Product } from '../types';
import { formatPeso, parseInventoryCsv, type CsvImportRowPreview } from '../utils/posMath';

interface CsvStockImportModalProps {
  open: boolean;
  products: Product[];
  onClose: () => void;
  onApplyImport: (rows: CsvImportRowPreview[], mode: 'merge' | 'new-only') => void;
}

export const CsvStockImportModal: React.FC<CsvStockImportModalProps> = ({
  open,
  products,
  onClose,
  onApplyImport,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [csvText, setCsvText] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'new-only'>('merge');

  const preview = useMemo(() => {
    if (!csvText.trim()) return null;
    return parseInventoryCsv(csvText, products);
  }, [csvText, products]);

  const counts = useMemo(() => {
    if (!preview || preview.error) return { create: 0, update: 0, skip: 0 };
    return preview.rows.reduce(
      (acc, r) => {
        acc[r.action]++;
        return acc;
      },
      { create: 0, update: 0, skip: 0 },
    );
  }, [preview]);

  if (!open) return null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    e.target.value = '';
  };

  const actionableCount =
    importMode === 'new-only' ? counts.create : counts.create + counts.update;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col max-h-[92dvh] gap-3">
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h3 className="font-extrabold text-base text-slate-900">Import Stock CSV</h3>
            <p className="text-[11px] text-slate-500">
              Preview exact row matches before updating. Existing mobile/tablet records stay safe.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close CSV import modal"
            className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-4 min-h-[44px] rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Choose CSV File</span>
          </button>

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => setImportMode('merge')}
              className={`px-3 min-h-[40px] rounded-xl text-xs font-bold border cursor-pointer whitespace-nowrap ${
                importMode === 'merge'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              Add New + Update Matched
            </button>
            <button
              type="button"
              onClick={() => setImportMode('new-only')}
              className={`px-3 min-h-[40px] rounded-xl text-xs font-bold border cursor-pointer whitespace-nowrap ${
                importMode === 'new-only'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              Add New Only
            </button>
          </div>
        </div>

        <div className="text-xs shrink-0">
          <label className="font-bold text-slate-600 block mb-1">
            Or paste CSV text (headers: Barcode, Name, Category, Unit, Capital, Retail Price, Stock)
          </label>
          <textarea
            rows={4}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={'Barcode,Name,Category,Unit,Capital,Retail Price,Stock\n4800016644801,Lucky Me Pancit Canton,Canned & Noodles,pc,11.5,16,40'}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono-num text-[11px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Preview Area */}
        <div className="flex-1 min-h-0 overflow-y-auto scroll-contain border border-slate-200 rounded-2xl">
          {!preview ? (
            <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <FileSpreadsheet className="w-7 h-7 text-slate-300" />
              <span>Upload or paste a CSV file to inspect rows before applying changes.</span>
            </div>
          ) : preview.error ? (
            <div className="p-6 text-center text-xs font-bold text-rose-600">{preview.error}</div>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              <div className="bg-slate-50 px-3 py-2 font-bold text-slate-700 sticky top-0 flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-200">
                <span className="text-emerald-700">{counts.create} New</span>
                <span className="text-indigo-700">
                  {importMode === 'merge' ? `${counts.update} Update` : `${counts.update} Existing (kept untouched)`}
                </span>
                <span className="text-slate-500">{counts.skip} Skipped</span>
              </div>
              {preview.rows.map((row) => (
                <div key={row.rowNum} className="px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">
                      Row {row.rowNum}: {row.data?.name || row.existing?.name || 'Invalid row'}
                    </div>
                    <div className="text-[11px] font-mono-num text-slate-500 truncate">
                      {row.action === 'skip'
                        ? row.reason
                        : row.action === 'update' && row.existing && row.data
                          ? `Stock: ${row.existing.stock} → ${row.data.stock} ${row.data.unit} · Retail: ${formatPeso(row.existing.retailPrice)} → ${formatPeso(row.data.retailPrice)}`
                          : row.data
                            ? `${row.data.barcode} · ${formatPeso(row.data.retailPrice)} · Stock ${row.data.stock} ${row.data.unit}`
                            : ''}
                    </div>
                  </div>
                  <span
                    className={`font-extrabold text-[11px] uppercase shrink-0 ${
                      row.action === 'create'
                        ? 'text-emerald-700'
                        : row.action === 'update' && importMode === 'merge'
                          ? 'text-indigo-700'
                          : 'text-slate-400'
                    }`}
                  >
                    {row.action === 'update' && importMode === 'new-only' ? 'Kept' : row.action}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 min-h-[44px] rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!preview || !!preview.error || actionableCount === 0}
            onClick={() => {
              if (!preview || preview.error) return;
              onApplyImport(preview.rows, importMode);
            }}
            className="px-5 min-h-[44px] rounded-2xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-emerald-400 font-extrabold text-xs cursor-pointer whitespace-nowrap"
          >
            Apply Import ({actionableCount} item{actionableCount === 1 ? '' : 's'})
          </button>
        </div>
      </div>
    </div>
  );
};
