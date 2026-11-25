import React from 'react';
import { usePos } from '../state/PosContext';
import { OPS_SUBTAB_LABELS, type OperationsSubTab } from '../types/pos';
import {
  PrintingSubTab,
  RepackSubTab,
  ServicesSubTab,
  ShiftSubTab,
  UtangSubTab,
} from './OperationsSubTabs';

const SUBTABS: OperationsSubTab[] = ['UTANG', 'REPACK', 'SHIFT', 'SERVICES', 'PRINTING'];

export const OperationsScreen: React.FC = () => {
  const { state, setOpsSubTab } = usePos();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#F8FAFC]">
      <div className="bg-white border-b border-[#E2E8F0] shrink-0">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {SUBTABS.map((tab) => {
            const active = state.opsSubTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setOpsSubTab(tab)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#0F172A] text-white shadow-xs'
                    : 'bg-slate-100/80 text-[#64748B] hover:bg-slate-200/70 hover:text-[#0F172A]'
                }`}
              >
                {OPS_SUBTAB_LABELS[tab]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {state.opsSubTab === 'UTANG' && <UtangSubTab />}
        {state.opsSubTab === 'REPACK' && <RepackSubTab />}
        {state.opsSubTab === 'SHIFT' && <ShiftSubTab />}
        {state.opsSubTab === 'SERVICES' && <ServicesSubTab />}
        {state.opsSubTab === 'PRINTING' && <PrintingSubTab />}
      </div>
    </div>
  );
};
