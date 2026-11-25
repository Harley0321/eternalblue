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
            className={`relative inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer min-h-[38px] ${
              compact ? 'flex-1 py-1.5 px-2.5 text-xs' : 'py-1.5 px-3 text-[13px]'
            } ${
              active
                ? 'bg-white/10 text-[#34D399]'
                : 'text-[#CBD5E1] hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon size={15} />
            <span>{TAB_LABELS[tab]}</span>
            {active && (
              <span
                aria-hidden="true"
                className="absolute bottom-0.5 inset-x-3 h-0.5 rounded-full bg-[#34D399]"
              />
            )}
          </button>
        );
      })}
    </>
  );
};

export const PosTopBar: React.FC = () => {
  const { state, pinConfigured, storePulse, setAssistantOpen, lockTerminalNow } = usePos();

  return (
    <header className="w-full bg-[#0F172A] border-b border-white/10 px-3.5 py-2 md:px-5 shrink-0 z-30">
      <div className="flex items-center justify-between gap-4 md:gap-6 w-full">
        {/* Zone 1: Brand mark & wordmark */}
        <div className="flex items-center gap-2.5 min-w-0">
          <StoreEmblem iconKey={state.settings.storeIcon} size={36} />
          <div className="min-w-0">
            <GlowingEmeraldStoreName
              text={state.settings.storeName}
              className="text-[16px] md:text-[20px] lg:text-[21px] leading-tight"
            />
          </div>
        </div>

        {/* Zone 2: Clean single-line navigation links */}
        <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-1.5 shrink-0">
          <HeaderNavButtons />
        </nav>

        {/* Zone 3: Compact utility & Assistant action */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton variant="compact" />
          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            className="inline-flex items-center gap-1.5 bg-[#4F46E5] hover:bg-[#4338CA] active:scale-[0.98] text-white text-xs font-bold px-3 py-2 rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150 min-h-[36px]"
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
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[#CBD5E1] hover:bg-white/10 hover:text-white cursor-pointer transition-colors"
            >
              <Lock size={17} />
            </button>
          )}
        </div>
      </div>

      {/* Tablet navigation strip */}
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
    <nav
      aria-label="Mobile navigation"
      className="md:hidden flex items-center justify-around bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] px-1 py-1 shrink-0"
    >
      {TAB_ORDER.map((tab) => {
        const Icon = tabIcon(tab);
        const active = state.activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`relative flex-1 min-h-[46px] py-1 rounded-lg flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors duration-150 ${
              active ? 'text-[#047857]' : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            {active && (
              <span
                aria-hidden="true"
                className="w-5 h-0.5 rounded-full bg-[#059669] mb-0.5"
              />
            )}
            <Icon size={19} strokeWidth={active ? 2.4 : 2} />
            <span className="text-[11px] font-bold leading-none whitespace-nowrap">{TAB_LABELS[tab]}</span>
          </button>
        );
      })}
    </nav>
  );
};
