import React, { useRef, useState } from 'react';
import { DeviceBridge } from '../hardware/deviceBridge';
import { usePos } from '../state/PosContext';

export const SettingsSecuritySection: React.FC = () => {
  const {
    state,
    pinConfigured,
    openPinModal,
    lockSettingsNow,
    exportBackupJson,
    importBackupJson,
    factoryResetAll,
    toast,
  } = usePos();

  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      if (!content.trim()) {
        toast('Could not read backup file', 'ERROR');
      } else {
        void importBackupJson(content);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <>
      <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-3.5 space-y-2.5">
        <h3 className="font-extrabold text-[15px] text-[#0F172A]">Security Vault & Backups</h3>
        <p className="text-xs text-[#64748B]">
          {pinConfigured
            ? `Manager PIN is active (salted PBKDF2-HMAC-SHA256, ${state.settings.adminPinIter} iterations + lockout).`
            : 'No Manager PIN configured yet. Set a 4–15 digit PIN to protect Settings and Voids.'}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => openPinModal('setPin')}
            className="py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold cursor-pointer"
          >
            {pinConfigured ? 'Change PIN' : 'Set Manager PIN'}
          </button>
          {pinConfigured && (
            <button
              type="button"
              onClick={lockSettingsNow}
              className="py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-slate-50 cursor-pointer"
            >
              Lock Settings
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              const json = exportBackupJson();
              DeviceBridge.downloadTextFile('eternalblue_backup.json', json, 'application/json');
              toast('Backup JSON downloaded');
            }}
            className="py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold cursor-pointer"
          >
            Export Backup
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-slate-50 cursor-pointer"
          >
            Restore Backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json,text/plain"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          className="w-full py-2 rounded-xl border border-[#E2E8F0] text-[#E11D48] text-xs font-semibold hover:bg-rose-50 cursor-pointer"
        >
          Factory Reset
        </button>

        <div className="text-[11px] text-[#64748B]">
          Security Audit Entries: {state.securityLog.length}
        </div>
      </div>

      {confirmReset && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-xl">
            <h3 className="font-bold text-base text-[#0F172A]">Reset Store Data?</h3>
            <p className="text-xs text-[#64748B]">
              This clears all products, sales, Suki customers, shifts, and logs back to zero while keeping your Store Name.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmReset(false);
                  factoryResetAll();
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-[#E11D48] cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
