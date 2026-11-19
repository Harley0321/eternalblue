import React, { useEffect, useMemo, useRef } from 'react';
import { LayoutGrid } from 'lucide-react';
import type { Product } from '../types';
import { getCategoryIcon } from '../utils/categoryIcons';
import { getEffectiveLowStockThreshold } from '../utils/stockAlerts';

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

  const categoryStats = useMemo(() => {
    const counts = new Map<string, number>();
    const lowCounts = new Map<string, number>();
    let totalLow = 0;

    for (const p of products) {
      const cat = p.category;
      const isLow = p.stock <= getEffectiveLowStockThreshold(p, lowStockThreshold);
      if (isLow) totalLow++;
      if (!cat) continue;
      counts.set(cat, (counts.get(cat) || 0) + 1);
      if (isLow) lowCounts.set(cat, (lowCounts.get(cat) || 0) + 1);
    }

    const categories = ['All', ...Array.from(counts.keys())];
    return categories.map((cat) => ({
      cat,
      total: cat === 'All' ? products.length : counts.get(cat) || 0,
      low: cat === 'All' ? totalLow : lowCounts.get(cat) || 0,
    }));
  }, [products, lowStockThreshold]);

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
  }, [selectedCategory, categoryStats.length]);

  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={onOpenSheet}
        title="All categories"
        aria-label="Open category picker"
        className="shrink-0 w-10 h-10 rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center justify-center active:scale-95 transition pos-ease cursor-pointer"
      >
        <LayoutGrid className="w-4 h-4" />
      </button>

      <div
        ref={scrollerRef}
        className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar snap-x scroll-smooth py-0.5"
      >
        {categoryStats.map(({ cat, total, low }) => {
          const isActive = cat === selectedCategory;
          const Icon = getCategoryIcon(cat);

          return (
            <button
              key={cat}
              type="button"
              data-active={isActive ? 'true' : 'false'}
              onClick={() => onSelectCategory(cat)}
              className={`snap-start shrink-0 inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl text-xs font-semibold whitespace-nowrap transition pos-ease active:scale-95 cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white border border-slate-900'
                  : 'bg-white text-slate-700 border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>{cat}</span>
              <span
                className={`font-mono-num text-[11px] ${
                  isActive ? 'text-slate-300' : 'text-slate-400'
                }`}
              >
                {total}
              </span>
              {mode === 'inventory' && low > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-extrabold font-mono-num leading-none">
                  {low}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
