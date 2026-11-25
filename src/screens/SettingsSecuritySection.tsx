import React, { useEffect, useRef, useState } from 'react';
import {
  AUTO_SAFETY_BACKUPS_UPDATED_EVENT,
  AutoSafetyBackupRepository,
  type AutoSafetyBackupSummary,
} from '../data/autoSafetyBackups';
import { DeviceBridge } from '../hardware/deviceBridge';
import { usePos } from '../state/PosContext';
import type { PosBackupPayload } from '../types/pos';

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
  const [autoBackups, setAutoBackups] = useState<AutoSafetyBackupSummary[]>([]);
  const [autoBackupStatus, setAutoBackupStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [restoreBackup, setRestoreBackup] = useState<AutoSafetyBackupSummary | null>(null);
  const [restoringAutoBackup, setRestoringAutoBackup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    const refreshAutoBackups = async () => {
      try {
        const backups = await AutoSafetyBackupRepository.list();
        if (active) {
          setAutoBackups(backups);
          setAutoBackupStatus('ready');
        }
      } catch {
        if (active) setAutoBackupStatus('error');
      }
    };

    void refreshAutoBackups();
    window.addEventListener(AUTO_SAFETY_BACKUPS_UPDATED_EVENT, refreshAutoBackups);
    return () => {
      active = false;
      window.removeEventListener(AUTO_SAFETY_BACKUPS_UPDATED_EVENT, refreshAutoBackups);
    };
  }, []);

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

  const handleRestoreAutoBackup = async () => {
    if (!restoreBackup) return;
    setRestoringAutoBackup(true);
    try {
      const payload = await AutoSafetyBackupRepository.load(restoreBackup.id);
      if (!payload) throw new Error('The selected safety copy is no longer available.');
      const parsed = JSON.parse(payload) as Partial<PosBackupPayload>;
      if (!Array.isArray(parsed.products) || !Array.isArray(parsed.sales) || !parsed.settings) {
        throw new Error('The selected safety copy is invalid.');
      }
      await importBackupJson(payload);
      setRestoreBackup(null);
    } catch {
      toast('Could not restore the automatic safety copy.', 'ERROR');
    } finally {
      setRestoringAutoBackup(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-extrabold text-[15px] text-[#0F172A]">Security Vault &amp; Backups</h3>
          <span className="text-xs font-extrabold font-mono tabular-nums text-[#047857]">
            {state.deviceIdentity.shortCode}
          </span>
        </div>

        <div className="rounded-xl bg-slate-50 p-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-[#0F172A]">
            <span>Per-Device Data Isolation Active</span>
            <span className="text-[#059669]">No Cloud Sync</span>
          </div>
          <p className="text-[11px] text-[#64748B] leading-relaxed">
            Sales, inventory, Suki utang, and shifts stay strictly on this device. Installing this app on other phones or tablets will never sync, merge, or alter another device&apos;s data.
          </p>
        </div>

        <p className="text-xs text-[#64748B]">
          {pinConfigured
            ? `Manager PIN is active (salted PBKDF2-HMAC-SHA256, ${state.settings.adminPinIter} iterations + lockout).`
            : 'No Manager PIN configured yet. Set a 4–15 digit PIN to protect Settings and Voids.'}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => openPinModal('setPin')}
            className="min-h-[42px] py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold cursor-pointer transition-colors"
          >
            {pinConfigured ? 'Change PIN' : 'Set Manager PIN'}
          </button>
          {pinConfigured && (
            <button
              type="button"
              onClick={lockSettingsNow}
              className="min-h-[42px] py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-slate-50 cursor-pointer transition-colors"
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
              const safeTag = state.deviceIdentity.shortCode.toLowerCase();
              DeviceBridge.downloadTextFile(`eternalblue_backup_${safeTag}.json`, json, 'application/json');
              toast('Backup JSON downloaded');
            }}
            className="min-h-[42px] py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold cursor-pointer transition-colors"
          >
            Export Backup
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[42px] py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-slate-50 cursor-pointer transition-colors"
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

        <div className="rounded-xl bg-slate-50 p-3 space-y-2">
          <div className="font-bold text-[11px] text-[#0F172A]">Automatic Safety Copies</div>
          <p className="text-[10px] leading-relaxed text-[#64748B]">
            Kept in this browser separately from the POS database: latest copy plus up to three daily restore points. This does not protect against losing or clearing the device.
          </p>
          {autoBackupStatus === 'loading' && (
            <div className="text-[10px] text-[#64748B]">Checking local safety copies...</div>
          )}
          {autoBackupStatus === 'error' && (
            <div role="status" className="text-[10px] font-semibold text-amber-800">
              Automatic copies are unavailable in this browser.
            </div>
          )}
          {autoBackupStatus === 'ready' && autoBackups.length === 0 && (
            <div className="text-[10px] text-[#64748B]">A copy will be created after you add products or record sales.</div>
          )}
          {autoBackups.map((backup) => (
            <div
              key={backup.id}
              className="flex items-center justify-between gap-2 border-t border-[#E2E8F0] pt-2"
            >
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-[#0F172A]">
                  {backup.kind === 'latest' ? 'Latest copy' : backup.dayKey}
                </div>
                <div className="text-[10px] text-[#64748B] tabular-nums">
                  {backup.productCount} SKUs · {backup.saleCount} sales · {new Date(backup.createdAt).toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Restore ${backup.kind === 'latest' ? 'latest' : backup.dayKey} automatic copy`}
                onClick={() => setRestoreBackup(backup)}
                className="shrink-0 min-h-[32px] rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-[10px] font-bold text-[#334155] hover:bg-slate-100 cursor-pointer"
              >
                Restore
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          className="w-full min-h-[42px] py-2 rounded-xl border border-[#E2E8F0] text-[#E11D48] text-xs font-semibold hover:bg-rose-50 cursor-pointer transition-colors"
        >
          Factory Reset
        </button>

        <div className="text-[11px] text-[#64748B] tabular-nums">
          Security Audit Entries: {state.securityLog.length} · Terminal ID: {state.deviceIdentity.shortCode}
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
                  void factoryResetAll();
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-[#E11D48] cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreBackup && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="restore-safety-copy-title"
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-xl"
          >
            <h3 id="restore-safety-copy-title" className="font-bold text-base text-[#0F172A]">
              Restore Automatic Copy?
            </h3>
            <p className="text-xs text-[#64748B]">
              This replaces current inventory, sales, customers, and settings with the {restoreBackup.dayKey} copy
              ({restoreBackup.productCount} SKUs, {restoreBackup.saleCount} sales).
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={restoringAutoBackup}
                onClick={() => setRestoreBackup(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#64748B] hover:bg-slate-100 disabled:opacity-60 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={restoringAutoBackup}
                onClick={() => void handleRestoreAutoBackup()}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-[#059669] hover:bg-[#047857] disabled:opacity-60 cursor-pointer"
              >
                {restoringAutoBackup ? 'Restoring...' : 'Restore Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
