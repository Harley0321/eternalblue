import React, { useEffect, useState } from 'react';
import { Bot, Boxes, ChartLine, Settings, ShoppingBasket, Store } from 'lucide-react';
import type { TabName } from '../types';

interface TopBarProps {
  storeName: string;
  activeTab: TabName;
  lowStockCount: number;
  onSelectTab: (tab: TabName) => void;
  onOpenSettings: () => void;
  onOpenAssistant: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  storeName,
  activeTab,
  lowStockCount,
  onSelectTab,
  onOpenSettings,
  onOpenAssistant,
}) => {
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString('en-PH', { hour12: true }),
  );
  const [dateStr, setDateStr] = useState(() =>
    new Date().toLocaleDateString('en-PH', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  );

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setClock(now.toLocaleTimeString('en-PH', { hour12: true }));
      setDateStr(
        now.toLocaleDateString('en-PH', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const tabClass = (isActive: boolean) =>
    `justify-center px-2 sm:px-3.5 py-1.5 min-h-[36px] rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
      isActive
        ? 'bg-emerald-500 text-slate-950 shadow-sm'
        : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
    }`;

  return (
    <header className="bg-slate-900 text-white px-2.5 sm:px-4 py-1.5 flex items-center justify-between gap-2 sm:gap-4 shadow-md z-30 shrink-0 min-h-[52px]">
      <div className="flex items-center gap-2 min-w-0">
        <div
          className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 shrink-0"
          title={storeName}
        >
          <ShoppingBasket className="w-4 h-4 stroke-[2.5]" />
        </div>
        <h1 className="hidden sm:block font-extrabold text-sm sm:text-base tracking-tight leading-none truncate">
          {storeName}
        </h1>
      </div>

      <nav
        aria-label="Primary sections"
        className="flex items-center gap-0.5 sm:gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/70 shrink-0"
      >
        <button
          type="button"
          onClick={() => onSelectTab('pos')}
          className={tabClass(activeTab === 'pos')}
          aria-current={activeTab === 'pos' ? 'page' : undefined}
        >
          <Store className="w-3.5 h-3.5" />
          <span>POS</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('inventory')}
          className={tabClass(activeTab === 'inventory')}
          aria-current={activeTab === 'inventory' ? 'page' : undefined}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>Stock</span>
          {lowStockCount > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] font-extrabold rounded-full bg-amber-400 text-slate-950 font-mono-num">
              {lowStockCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('sales')}
          className={tabClass(activeTab === 'sales')}
          aria-current={activeTab === 'sales' ? 'page' : undefined}
        >
          <ChartLine className="w-3.5 h-3.5" />
          <span>Sales</span>
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className={tabClass(activeTab === 'settings')}
          aria-label="Settings"
          aria-current={activeTab === 'settings' ? 'page' : undefined}
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Settings</span>
        </button>
      </nav>

      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onOpenAssistant}
          aria-label="Open Store Assistant"
          data-testid="assistant-fab"
          title="Offline Store AI Analyst"
          className="h-9 px-2.5 sm:px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white flex items-center gap-1.5 text-xs font-bold cursor-pointer"
        >
          <Bot className="w-4 h-4 text-emerald-400" />
          <span className="hidden md:inline">Store AI</span>
        </button>

        <div className="hidden md:flex items-center text-right shrink-0">
          <div>
            <div className="font-mono-num text-xs font-bold text-emerald-400">{clock}</div>
            <div className="text-[10px] text-slate-400">{dateStr}</div>
          </div>
        </div>
      </div>
    </header>
  );
};

