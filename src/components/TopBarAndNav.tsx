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
import { GlowingEmeraldStoreName, StoreEmblem } from './CommonGraphics';

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

export const PosTopBar: React.FC = () => {
  const { state, pinConfigured, storePulse, setAssistantOpen, lockTerminalNow, setActiveTab } = usePos();

  return (
    <header className="w-full bg-[#020617] px-3.5 py-2.5 shrink-0 z-30">
      <div className="flex items-center gap-2.5 w-full">
        <StoreEmblem iconKey={state.settings.storeIcon} size={36} />
        <div className="flex-1 min-w-0">
          <GlowingEmeraldStoreName text={state.settings.storeName} />
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-[#94A3B8] truncate">
              {state.activeShift?.cashierName ?? state.settings.storeAddress}
            </span>
            <span className="bg-[#059669]/20 text-[#34D399] text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0">
              OFFLINE
            </span>
            {state.updateInfo?.isNewer && (
              <button
                type="button"
                onClick={() => setActiveTab('SETTINGS')}
                className="bg-[#00FF85]/20 text-[#6EE7B7] text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0 hover:bg-[#00FF85]/30 cursor-pointer"
              >
                UPDATE
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            className="inline-flex items-center gap-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[11px] font-bold px-3 py-1.5 rounded-[10px] whitespace-nowrap cursor-pointer transition-colors"
          >
            <Sparkles size={14} />
            <span className="hidden sm:inline">Ask AI ({storePulse.healthScore})</span>
            <span className="sm:hidden">AI {storePulse.healthScore}</span>
          </button>
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
    </header>
  );
};

export const PosNavRail: React.FC = () => {
  const { state, setActiveTab } = usePos();
  return (
    <nav className="hidden md:flex flex-col items-center w-20 bg-white border-r border-[#E2E8F0] py-3 gap-2 shrink-0">
      {TAB_ORDER.map((tab) => {
        const Icon = tabIcon(tab);
        const active = state.activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`w-16 py-2 rounded-xl flex flex-col items-center gap-1 transition-colors cursor-pointer ${
              active
                ? 'bg-[#ECFDF5] text-[#059669]'
                : 'text-[#64748B] hover:bg-slate-100 hover:text-[#0F172A]'
            }`}
          >
            <Icon size={20} />
            <span className="text-[11px] font-bold leading-none whitespace-nowrap">{TAB_LABELS[tab]}</span>
          </button>
        );
      })}
    </nav>
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
