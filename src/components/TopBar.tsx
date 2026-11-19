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
  outOfStockCount?: number;
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
  outOfStockCount = 0,
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
    `justify-center lg:px-3 xl:px-3.5 py-1.5 min-h-[36px] rounded-lg lg:text-[13px] xl:text-sm font-semibold flex items-center gap-1.5 transition-colors pos-ease whitespace-nowrap shrink-0 cursor-pointer ${
      isActive
        ? 'bg-emerald-500 text-slate-950 font-bold'
        : 'text-slate-300 hover:text-white hover:bg-slate-800'
    }`;

  const mobileTabClass = (isActive: boolean) =>
    `justify-center px-1 sm:px-2 py-1 sm:py-1.5 min-h-[36px] rounded-lg text-[10.5px] sm:text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-colors pos-ease whitespace-nowrap cursor-pointer ${
      isActive
        ? 'bg-emerald-500 text-slate-950 font-bold'
        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
    }`;

  return (
    <header className="bg-slate-950 text-white border-b border-slate-800 z-30 shrink-0">
      {/* Primary Row: Clean Brand + Desktop Segmented Nav + Clock & Utility Actions */}
      <div className="px-3 sm:px-5 py-1.5 flex items-center justify-between gap-3 lg:gap-6 min-h-[48px] sm:min-h-[54px]">
        <button
          type="button"
          onClick={() => onSelectTab('pos')}
          aria-label={`${storeName} — go to POS counter`}
          title={cleanTagline ? `${storeName} · ${cleanTagline}` : storeName}
          className="flex items-center gap-2.5 min-w-0 flex-1 lg:flex-initial lg:max-w-[290px] xl:max-w-[340px] text-left rounded-lg py-1 pr-2 hover:opacity-90 transition-opacity cursor-pointer"
        >
          <StoreEmblem storeName={storeName} storeIcon={storeIcon} size="sm" />
          <div className="min-w-0 flex-1">
            <h1
              data-testid="topbar-store-name"
              className="font-bold text-[15px] sm:text-[17px] tracking-tight text-white leading-tight truncate"
            >
              {storeName}
            </h1>
            {(cleanTagline || activeCashierName) && (
              <div
                data-testid="topbar-store-tagline"
                className="text-[11px] font-medium text-slate-400 leading-tight truncate"
              >
                {activeCashierName ? `Cashier: ${activeCashierName}` : cleanTagline}
              </div>
            )}
          </div>
        </button>

        {/* Desktop / Tablet Landscape Primary Nav (1024px+) */}
        <nav
          aria-label="Primary sections"
          data-testid="desktop-primary-nav"
          className="hidden lg:flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0"
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
            data-testid="nav-inventory"
            title={
              lowStockCount > 0
                ? `${lowStockCount} product${lowStockCount === 1 ? '' : 's'} at or below low-stock threshold${outOfStockCount > 0 ? ` (${outOfStockCount} out of stock)` : ''}`
                : 'Inventory & Stock'
            }
            className={desktopTabClass(activeTab === 'inventory')}
            aria-current={activeTab === 'inventory' ? 'page' : undefined}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Inventory</span>
            {lowStockCount > 0 && (
              <span
                data-testid="inventory-low-stock-badge"
                aria-label={`${lowStockCount} low stock alert${lowStockCount === 1 ? '' : 's'}`}
                className={`inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-[10px] font-extrabold rounded-md font-mono-num leading-none ${
                  outOfStockCount > 0
                    ? 'bg-rose-500 text-white'
                    : 'bg-amber-400 text-slate-950'
                }`}
              >
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
              <span className="inline-flex items-center justify-center min-w-[18px] px-1.5 py-0.5 text-[10px] font-extrabold rounded-md bg-rose-500 text-white font-mono-num leading-none">
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

        {/* Right Cluster: Tabular Clock & Date + Lock + Store AI */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            data-testid="topbar-datetime"
            className="flex flex-col items-end text-right leading-tight shrink-0 pr-0.5"
          >
            <div className="font-mono-num text-[11px] sm:text-xs font-semibold text-emerald-400 whitespace-nowrap">
              <span className="sm:hidden">{shortClock}</span>
              <span className="hidden sm:inline">{clock}</span>
            </div>
            <div className="text-[10px] text-slate-400 whitespace-nowrap">
              <span className="min-[380px]:hidden">{shortDateStr}</span>
              <span className="hidden min-[380px]:inline xl:hidden">{compactDateStr}</span>
              <span className="hidden xl:inline">{dateStr}</span>
            </div>
          </div>

          {hasPin && onLockTerminal && (
            <button
              type="button"
              onClick={onLockTerminal}
              aria-label="Lock terminal"
              data-testid="lock-terminal-btn"
              title="Lock Terminal (Alt+L)"
              className="h-9 w-9 xl:w-auto xl:px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer shrink-0"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden xl:inline">Lock</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenAssistant}
            aria-label="Open Store Assistant"
            data-testid="assistant-fab"
            title="Offline Store AI Analyst (Ctrl+/)"
            className="h-9 w-9 sm:w-auto sm:px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer shrink-0"
          >
            <Bot className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Store AI</span>
          </button>
        </div>
      </div>

      {/* Mobile & Portrait-Tablet Primary Nav Strip (below 1024px) */}
      <nav
        aria-label="Mobile sections"
        data-testid="mobile-primary-nav"
        className="lg:hidden grid grid-cols-[0.8fr_1.32fr_0.82fr_0.86fr_1.2fr] sm:grid-cols-5 gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 border-t border-slate-900 bg-slate-950"
      >
        <button
          type="button"
          onClick={() => onSelectTab('pos')}
          className={mobileTabClass(activeTab === 'pos')}
          aria-current={activeTab === 'pos' ? 'page' : undefined}
        >
          <Store className="w-3.5 h-3.5 shrink-0" />
          <span>POS</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('inventory')}
          data-testid="mobile-nav-inventory"
          className={`relative ${mobileTabClass(activeTab === 'inventory')}`}
          aria-current={activeTab === 'inventory' ? 'page' : undefined}
        >
          <Boxes className="w-3.5 h-3.5 shrink-0" />
          <span>Inventory</span>
          {lowStockCount > 0 && (
            <span
              data-testid="mobile-inventory-low-stock-badge"
              aria-label={`${lowStockCount} low stock alert${lowStockCount === 1 ? '' : 's'}`}
              className={`inline-flex items-center justify-center px-1.5 min-w-[18px] h-[16px] text-[9.5px] font-extrabold rounded-md font-mono-num leading-none ${
                outOfStockCount > 0
                  ? 'bg-rose-500 text-white'
                  : 'bg-amber-400 text-slate-950'
              }`}
            >
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
          <ClipboardList className="w-3.5 h-3.5 shrink-0" />
          <span className="sm:hidden">Ops</span>
          <span className="hidden sm:inline">Store Ops</span>
          {overdueUtangCount > 0 && (
            <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-extrabold rounded-md bg-rose-500 text-white font-mono-num leading-none">
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
          <ChartLine className="w-3.5 h-3.5 shrink-0" />
          <span>Sales</span>
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className={mobileTabClass(activeTab === 'settings')}
          aria-label="Settings"
          aria-current={activeTab === 'settings' ? 'page' : undefined}
        >
          <Settings className="w-3.5 h-3.5 shrink-0" />
          <span>Settings</span>
        </button>
      </nav>
    </header>
  );
};

