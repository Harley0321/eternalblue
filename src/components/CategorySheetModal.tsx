import React from 'react';
import { X } from 'lucide-react';
import type { Product } from '../types';
import { getCategoryIcon } from '../utils/categoryIcons';

interface CategorySheetModalProps {
  open: boolean;
  products: Product[];
  selectedCategory: string;
  lowStockThreshold: number;
  onSelectCategory: (cat: string) => void;
  onClose: () => void;
}

export const CategorySheetModal: React.FC<CategorySheetModalProps> = ({
  open,
  products,
  selectedCategory,
  lowStockThreshold,
  onSelectCategory,
  onClose,
}) => {
  if (!open) return null;

  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full max-w-md sm:max-w-2xl lg:max-w-3xl rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl max-h-[85dvh] overflow-y-auto pb-safe">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-extrabold text-base text-slate-900">Choose a category</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close category picker"
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {categories.map((cat) => {
            const on = cat === selectedCategory;
            const list = cat === 'All' ? products : products.filter((p) => p.category === cat);
            const low = list.filter((p) => p.stock <= lowStockThreshold).length;
            const Icon = getCategoryIcon(cat);

            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  onSelectCategory(cat);
                  onClose();
                }}
                className={`min-h-[84px] p-3 rounded-2xl text-left flex flex-col justify-between gap-1 border transition active:scale-95 cursor-pointer ${
                  on
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-5 h-5 ${on ? 'text-emerald-400' : 'text-emerald-600'}`} />
                <span className="font-extrabold text-sm leading-tight">
                  {cat === 'All' ? 'All Items' : cat}
                </span>
                <span className={`flex items-center justify-between text-[11px] ${on ? 'text-slate-300' : 'text-slate-500'}`}>
                  <span className="font-mono-num">
                    {list.length} item{list.length === 1 ? '' : 's'}
                  </span>
                  {low > 0 && (
                    <span className={`font-bold ${on ? 'text-amber-300' : 'text-amber-600'}`}>
                      {low} low
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
