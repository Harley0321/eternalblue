import React, { useEffect, useState } from 'react';
import { Bot, Boxes, ChartLine, ClipboardList, Lock, Settings, Store } from 'lucide-react';
import type { TabName } from '../types';
import { StoreEmblem } from './StoreEmblem';

interface TopBarProps {
  storeName: string;
  storeIcon?: string;
  storeTagline?: string;
  activeTab: TabName;
  lowStockCount: number;
  overdueUtangCount?: number;
  activeCashierName?: string;
  hasPin?: boolean;
  onSelectTab: (tab: TabName) => void;
  onOpenSettings: () => void;
  onOpenAssistant: () => void;
  onLockTerminal?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  storeName,
  storeIcon,
  storeTagline,
  activeTab,
  lowStockCount,
  overdueUtangCount = 0,
  activeCashierName,
  hasPin,
  onSelectTab,
  onOpenSettings,
  onOpenAssistant,
  onLockTerminal,
}) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const clock = now.toLocaleTimeString('en-PH', { hour12: true });
  const shortClock = now.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const shortDateStr = now.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
  const compactDateStr = now.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const dateStr = now.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const cleanTagline = (storeTagline || '').trim();

  const desktopTabClass = (isActive: boolean) =>
    `justify-center px-3.5 py-1.5 min-h-[36px] rounded-lg text-sm font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
      isActive
        ? 'bg-emerald-500 text-slate-950 shadow-sm'
        : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
    }`;

  const mobileTabClass = (isActive: boolean) =>
    `justify-center px-1 py-1 min-h-[34px] rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition whitespace-nowrap cursor-pointer ${
      isActive
        ? 'bg-emerald-500 text-slate-950 shadow-xs'
        : 'text-slate-300 hover:text-white bg-slate-800/80'
    }`;

  return (
    <header className="bg-slate-900 text-white shadow-md z-30 shrink-0">
      {/* Primary Row: Store Brand + (Desktop Nav) + Clock/Date + Lock + Store AI */}
      <div className="px-2.5 sm:px-4 py-1.5 flex items-center justify-between gap-2 sm:gap-4 min-h-[46px] md:min-h-[54px]">
        <button
          type="button"
          onClick={() => onSelectTab('pos')}
          aria-label={`${storeName} — go to POS counter`}
          title={cleanTagline ? `${storeName} · ${cleanTagline}` : storeName}
          className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 md:flex-initial md:max-w-[260px] lg:max-w-[320px] text-left rounded-xl py-0.5 pr-1 hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 transition cursor-pointer"
        >
          <StoreEmblem storeName={storeName} storeIcon={storeIcon} size="sm" />
          <div className="min-w-0 flex-1">
            <h1
              data-testid="topbar-store-name"
              className="font-extrabold text-[13.5px] sm:text-[15.5px] tracking-tight leading-tight truncate text-white"
            >
              {storeName}
            </h1>
            {(cleanTagline || activeCashierName) && (
              <div
                data-testid="topbar-store-tagline"
                className="text-[10px] sm:text-[11px] font-medium text-slate-400 leading-tight truncate"
              >
                {activeCashierName ? `Cashier: ${activeCashierName}` : cleanTagline}
              </div>
            )}
          </div>
        </button>

        {/* Desktop / Tablet Primary Nav — Store Ops placed strictly in the middle of Stock and Sales */}
        <nav
          aria-label="Primary sections"
          data-testid="desktop-primary-nav"
          className="hidden md:flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/70 shrink-0"
        >
          <button
            type="button"
            onClick={() => onSelectTab('pos')}
            className={desktopTabClass(activeTab === 'pos')}
            aria-current={activeTab === 'pos' ? 'page' : undefined}
          >
            <Store className="w-3.5 h-3.5" />
            <span>POS</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('inventory')}
            className={desktopTabClass(activeTab === 'inventory')}
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
            onClick={() => onSelectTab('operations')}
            data-testid="nav-store-ops"
            className={desktopTabClass(activeTab === 'operations')}
            aria-current={activeTab === 'operations' ? 'page' : undefined}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Store Ops</span>
            {overdueUtangCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-extrabold rounded-full bg-rose-500 text-white font-mono-num">
                {overdueUtangCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('sales')}
            className={desktopTabClass(activeTab === 'sales')}
            aria-current={activeTab === 'sales' ? 'page' : undefined}
          >
            <ChartLine className="w-3.5 h-3.5" />
            <span>Sales</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className={desktopTabClass(activeTab === 'settings')}
            aria-label="Settings"
            aria-current={activeTab === 'settings' ? 'page' : undefined}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </nav>

        {/* Right Cluster: Always-visible Time & Date + Lock + Store AI */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <div
            data-testid="topbar-datetime"
            className="flex flex-col items-end text-right leading-tight shrink-0"
          >
            <div className="font-mono-num text-[11px] sm:text-xs font-bold text-emerald-400 whitespace-nowrap">
              <span className="sm:hidden">{shortClock}</span>
              <span className="hidden sm:inline">{clock}</span>
            </div>
            <div className="text-[10px] text-slate-300 md:text-slate-400 whitespace-nowrap">
              <span className="min-[380px]:hidden">{shortDateStr}</span>
              <span className="hidden min-[380px]:inline md:hidden">{compactDateStr}</span>
              <span className="hidden md:inline">{dateStr}</span>
            </div>
          </div>

          {hasPin && onLockTerminal && (
            <button
              type="button"
              onClick={onLockTerminal}
              aria-label="Lock terminal"
              data-testid="lock-terminal-btn"
              title="Lock Terminal (Alt+L)"
              className="h-8 w-8 md:h-9 md:w-auto md:px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer shrink-0"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden lg:inline">Lock</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenAssistant}
            aria-label="Open Store Assistant"
            data-testid="assistant-fab"
            title="Offline Store AI Analyst (Ctrl+/)"
            className="h-8 w-8 md:h-9 md:w-auto md:px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer shrink-0"
          >
            <Bot className="w-4 h-4 text-emerald-400" />
            <span className="hidden md:inline">Store AI</span>
          </button>
        </div>
      </div>

      {/* Mobile Primary Nav Strip (visible labels for all 5 tabs, Store Ops strictly between Stock and Sales) */}
      <nav
        aria-label="Mobile sections"
        data-testid="mobile-primary-nav"
        className="md:hidden grid grid-cols-5 gap-1 px-2 pb-1.5 pt-0.5 border-t border-slate-800/80"
      >
        <button
          type="button"
          onClick={() => onSelectTab('pos')}
          className={mobileTabClass(activeTab === 'pos')}
          aria-current={activeTab === 'pos' ? 'page' : undefined}
        >
          <Store className="w-3 h-3 shrink-0" />
          <span>POS</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('inventory')}
          className={mobileTabClass(activeTab === 'inventory')}
          aria-current={activeTab === 'inventory' ? 'page' : undefined}
        >
          <Boxes className="w-3 h-3 shrink-0" />
          <span>Stock</span>
          {lowStockCount > 0 && (
            <span className="px-1 text-[9px] font-extrabold rounded-full bg-amber-400 text-slate-950 font-mono-num">
              {lowStockCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('operations')}
          data-testid="mobile-nav-store-ops"
          className={mobileTabClass(activeTab === 'operations')}
          aria-current={activeTab === 'operations' ? 'page' : undefined}
        >
          <ClipboardList className="w-3 h-3 shrink-0" />
          <span>Ops</span>
          {overdueUtangCount > 0 && (
            <span className="px-1 text-[9px] font-extrabold rounded-full bg-rose-500 text-white font-mono-num">
              {overdueUtangCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('sales')}
          className={mobileTabClass(activeTab === 'sales')}
          aria-current={activeTab === 'sales' ? 'page' : undefined}
        >
          <ChartLine className="w-3 h-3 shrink-0" />
          <span>Sales</span>
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className={mobileTabClass(activeTab === 'settings')}
          aria-label="Settings"
          aria-current={activeTab === 'settings' ? 'page' : undefined}
        >
          <Settings className="w-3 h-3 shrink-0" />
          <span>Settings</span>
        </button>
      </nav>
    </header>
  );
};

