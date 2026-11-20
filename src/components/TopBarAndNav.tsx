import React from 'react';
import {
  BarChart3,
  Briefcase,
  Lock,
  Package,
  ScanBarcode,
  Settings,
  Sparkles,
} from 'lucide-react';
import { usePos } from '../state/PosContext';
import { TAB_LABELS, type TabName } from '../types/pos';
import { GlowingEmeraldDateTime, GlowingEmeraldStoreName, StoreEmblem } from './CommonGraphics';
import { PWAInstallButton } from './PWAInstallButton';

const TAB_ORDER: TabName[] = ['POS', 'INVENTORY', 'OPERATIONS', 'SALES', 'SETTINGS'];

function tabIcon(tab: TabName) {
  switch (tab) {
    case 'POS':
      return ScanBarcode;
    case 'INVENTORY':
      return Package;
    case 'OPERATIONS':
      return Briefcase;
    case 'SALES':
      return BarChart3;
    case 'SETTINGS':
      return Settings;
  }
}

const HeaderNavButtons: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { state, setActiveTab } = usePos();
  return (
    <>
      {TAB_ORDER.map((tab) => {
        const Icon = tabIcon(tab);
        const active = state.activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] font-bold whitespace-nowrap transition-colors cursor-pointer border ${
              compact ? 'flex-1 py-1.5 px-2.5 text-xs' : 'py-1.5 px-3 text-xs'
            } ${
              active
                ? 'bg-[#059669]/25 border-[#34D399]/40 text-[#34D399]'
                : 'border-transparent text-[#CBD5E1] hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon size={16} />
            <span>{TAB_LABELS[tab]}</span>
          </button>
        );
      })}
    </>
  );
};

export const PosTopBar: React.FC = () => {
  const { state, pinConfigured, storePulse, setAssistantOpen, lockTerminalNow } = usePos();

  return (
    <header className="w-full bg-[#020617] px-3.5 py-2.5 md:px-4 md:py-2.5 shrink-0 z-30">
      <div className="flex items-center gap-2.5 md:gap-3 w-full">
        <StoreEmblem iconKey={state.settings.storeIcon} size={40} />
        <div className="flex-1 min-w-0 flex items-center">
          <GlowingEmeraldStoreName
            text={state.settings.storeName}
            className="text-[17px] md:text-[26px] lg:text-[28px] leading-tight"
          />
        </div>
        <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-1 shrink-0">
          <HeaderNavButtons />
        </nav>
        <div className="flex items-center gap-1.5 shrink-0">
          <PWAInstallButton variant="compact" />
          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            className="inline-flex items-center gap-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[11px] font-bold px-3 py-1.5 rounded-[10px] whitespace-nowrap cursor-pointer transition-colors"
          >
            <Sparkles size={14} />
            <span className="hidden sm:inline">Ask AI ({storePulse.healthScore})</span>
            <span className="sm:hidden">AI {storePulse.healthScore}</span>
          </button>
          <GlowingEmeraldDateTime className="pl-1" />
          {pinConfigured && !state.terminalLocked && (
            <button
              type="button"
              onClick={lockTerminalNow}
              title="Lock POS"
              aria-label="Lock POS"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[#CBD5E1] hover:bg-white/10 cursor-pointer"
            >
              <Lock size={18} />
            </button>
          )}
        </div>
      </div>
      <nav
        aria-label="Tablet navigation"
        className="hidden md:flex lg:hidden items-center gap-1.5 mt-2 pt-2 border-t border-white/10"
      >
        <HeaderNavButtons compact />
      </nav>
    </header>
  );
};

export const PosBottomBar: React.FC = () => {
  const { state, setActiveTab } = usePos();
  return (
    <nav className="md:hidden flex items-center justify-around bg-white border-t border-[#E2E8F0] py-1.5 px-1 shrink-0">
      {TAB_ORDER.map((tab) => {
        const Icon = tabIcon(tab);
        const active = state.activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded-lg flex flex-col items-center gap-0.5 cursor-pointer transition-colors ${
              active ? 'text-[#059669]' : 'text-[#64748B]'
            }`}
          >
            <Icon size={19} />
            <span className="text-[11px] font-bold leading-none whitespace-nowrap">{TAB_LABELS[tab]}</span>
          </button>
        );
      })}
    </nav>
  );
};
