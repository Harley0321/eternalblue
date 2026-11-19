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
    <div className="flex flex-col h-full overflow-hidden">
      <div className="bg-white px-3 py-2 flex items-center gap-2 overflow-x-auto border-b border-[#E2E8F0] shrink-0">
        {SUBTABS.map((tab) => {
          const active = state.opsSubTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setOpsSubTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                active
                  ? 'bg-[#ECFDF5] border-[#059669] text-[#047857]'
                  : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-slate-50'
              }`}
            >
              {OPS_SUBTAB_LABELS[tab]}
            </button>
          );
        })}
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
