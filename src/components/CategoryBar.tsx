import React, { useEffect, useRef } from 'react';
import { LayoutGrid } from 'lucide-react';
import type { Product } from '../types';
import { getCategoryIcon } from '../utils/categoryIcons';

interface CategoryBarProps {
  products: Product[];
  selectedCategory: string;
  lowStockThreshold: number;
  mode: 'pos' | 'inventory';
  onSelectCategory: (cat: string) => void;
  onOpenSheet: () => void;
}

export const CategoryBar: React.FC<CategoryBarProps> = ({
  products,
  selectedCategory,
  lowStockThreshold,
  mode,
  onSelectCategory,
  onOpenSheet,
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const activeBtn = scroller.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (activeBtn) {
      scroller.scrollLeft = Math.max(
        0,
        activeBtn.offsetLeft - scroller.clientWidth / 2 + activeBtn.offsetWidth / 2 - scroller.offsetLeft,
      );
    }
  }, [selectedCategory, categories.length]);

  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={onOpenSheet}
        title="All categories"
        aria-label="Open category picker"
        className="shrink-0 w-11 h-11 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center justify-center active:scale-95 transition cursor-pointer"
      >
        <LayoutGrid className="w-4 h-4" />
      </button>

      <div
        ref={scrollerRef}
        className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar snap-x scroll-smooth py-0.5"
      >
        {categories.map((cat) => {
          const isActive = cat === selectedCategory;
          const list = cat === 'All' ? products : products.filter((p) => p.category === cat);
          const lowCount = list.filter((p) => p.stock <= lowStockThreshold).length;
          const Icon = getCategoryIcon(cat);

          return (
            <button
              key={cat}
              type="button"
              data-active={isActive ? 'true' : 'false'}
              onClick={() => onSelectCategory(cat)}
              className={`snap-start shrink-0 inline-flex items-center gap-1.5 px-3.5 min-h-[42px] rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-emerald-400 shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>{cat}</span>
              <span className="opacity-65 font-mono-num">{list.length}</span>
              {mode === 'inventory' && lowCount > 0 && (
                <span className="ml-0.5 px-1.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold font-mono-num">
                  {lowCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
