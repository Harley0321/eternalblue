import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  GitBranch,
  History,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import JSZip from 'jszip';
import type { ConfigSnapshot, HeldOrder, Product, SaleRecord, StockLogEntry, StoreSettings } from '../types';
import {
  isWeakPin,
  PIN_SETTING_KEYS,
  pinIsSet,
  pinNeedsChange,
  storePinInSettings,
  verifyPinWithSettings,
} from '../utils/pinSecurity';
import { formatPeso, validateBackupPayload } from '../utils/posMath';
import { getUsedStorageBytes } from '../utils/storage';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { APP_VERSION, PRESERVED_DATA_KEYS, RELEASE_DATE, RELEASE_TAG } from '../version';

interface SettingsViewProps {
  settings: StoreSettings;
  products: Product[];
  sales: SaleRecord[];
  heldOrders: HeldOrder[];
  stockLog: StockLogEntry[];
  configHistory: ConfigSnapshot[];
  onSaveSettings: (next: StoreSettings) => void;
  onCreateConfigCheckpoint: (label?: string) => void;
  onRollbackConfig: (snapshotId: string) => void;
  onLockSettings: () => void;
  onApplyRestore: (
    payload: {
      products: Product[];
      sales: SaleRecord[];
      heldOrders: HeldOrder[];
      settings?: Partial<StoreSettings>;
    },
    mode: 'replace' | 'merge',
  ) => void;
  onAskClearSales: () => void;
  onAskFactoryReset: () => void;
  onToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  products,
  sales,
  heldOrders,
  stockLog,
  configHistory,
  onSaveSettings,
  onCreateConfigCheckpoint,
  onRollbackConfig,
  onLockSettings,
  onApplyRestore,
  onAskClearSales,
  onAskFactoryReset,
  onToast,
}) => {
  const [form, setForm] = useState<StoreSettings>(() => ({ ...settings }));
  const [checkpointLabel, setCheckpointLabel] = useState('');

  useEffect(() => {
    setForm({ ...settings });
  }, [settings]);
  const [curPin, setCurPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [allowWeakPin, setAllowWeakPin] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

  const [restorePreview, setRestorePreview] = useState<{
    fileName: string;
    exportedAt?: string;
    products: Product[];
    sales: SaleRecord[];
    heldOrders: HeldOrder[];
    settings?: Partial<StoreSettings>;
  } | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const usedBytes = getUsedStorageBytes();
  const usedKb = (usedBytes / 1024).toFixed(1);
  const quotaPct = Math.min(100, (usedBytes / (5 * 1024 * 1024)) * 100);
  const hasPin = pinIsSet(settings);
  const weakBanner = pinNeedsChange(settings);

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned: StoreSettings = {
      ...settings,
      ...form,
      storeName: form.storeName.trim() || 'OmniMart PH Supermarket',
      lowStockThreshold: Math.max(0, Number(form.lowStockThreshold) || 10),
      expiryWarnDays: Math.max(1, Number(form.expiryWarnDays) || 30),
      reorderLeadDays: Math.max(0, Number(form.reorderLeadDays) ?? 3),
      reorderSafetyDays: Math.max(0, Number(form.reorderSafetyDays) ?? 2),
      scDiscountCap: Math.max(1, Number(form.scDiscountCap) || 125),
      receiptWidth: form.receiptWidth === '58mm' ? '58mm' : '80mm',
    };
    onSaveSettings(cleaned);
    setForm(cleaned);
    onToast('Store settings saved', 'success');
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(newPin)) {
      onToast('New PIN must be 4 to 8 digits', 'error');
      return;
    }
    if (newPin !== confirmPin) {
      onToast('New PINs do not match', 'error');
      return;
    }
    const weak = isWeakPin(newPin);
    if (weak && !allowWeakPin) {
      onToast('PIN is too easy to guess. Choose a stronger PIN or check the box to use anyway.', 'warning');
      return;
    }

    setPinBusy(true);
    try {
      if (hasPin) {
        const res = await verifyPinWithSettings(curPin, settings);
        if (!res.ok) {
          onToast(res.error || 'Current PIN is incorrect', 'error');
          return;
        }
      }
      const next = await storePinInSettings(settings, newPin, weak);
      onSaveSettings(next);
      setForm(next);
      setCurPin('');
      setNewPin('');
      setConfirmPin('');
      setAllowWeakPin(false);
      onToast('Manager PIN updated securely', 'success');
    } finally {
      setPinBusy(false);
    }
  };

  const handleExportBackup = () => {
    const cleanSettings: Record<string, unknown> = { ...settings };
    PIN_SETTING_KEYS.forEach((k) => {
      delete cleanSettings[k];
    });
    const nowIso = new Date().toISOString();
    const payload = {
      app: 'omnimart-ph-pos',
      version: 1,
      exportedAt: nowIso,
      products,
      sales,
      heldOrders,
      settings: cleanSettings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnimart-backup-${new Date().toLocaleDateString('en-CA')}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const updated = { ...settings, lastBackup: nowIso };
    onSaveSettings(updated);
    setForm(updated);
    onToast('Backup JSON downloaded (PIN excluded for safety)', 'success');
  };

  const handleBackupFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = validateBackupPayload(parsed);
      if (res.ok === false) {
        onToast(res.error, 'error');
        return;
      }
      setRestorePreview({
        fileName: file.name,
        ...res.data,
      });
    } catch {
      onToast('Could not read backup file. Make sure it is a valid JSON export.', 'error');
    }
  };

  const handleDownloadOfflineZip = async () => {
    setZipBusy(true);
    try {
      const zip = new JSZip();
      const cleanSettings: Record<string, unknown> = { ...settings };
      PIN_SETTING_KEYS.forEach((k) => {
        delete cleanSettings[k];
      });
      zip.file(
        'omnimart-backup.json',
        JSON.stringify(
          {
            app: 'omnimart-ph-pos',
            version: 1,
            exportedAt: new Date().toISOString(),
            products,
            sales,
            heldOrders,
            settings: cleanSettings,
          },
          null,
          2,
        ),
      );
      zip.file(
        'README-OFFLINE.txt',
        [
          'OmniMart PH POS - Offline Backup & Recovery Kit',
          '================================================',
          `Store: ${settings.storeName}`,
          `Exported: ${new Date().toLocaleString('en-PH')}`,
          `Products: ${products.length}`,
          `Sales Records: ${sales.length}`,
          '',
          '1. Install OmniMart PH POS onto your phone/tablet home screen for full offline mode.',
          '2. Keep omnimart-backup.json safe. You can restore or merge it anytime under Settings -> Backup & Restore.',
          '3. Manager PIN is never included in backup files for security.',
        ].join('\n'),
      );
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `omnimart-offline-kit-${new Date().toLocaleDateString('en-CA')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      onToast('Offline backup kit ZIP downloaded', 'success');
    } catch {
      onToast('Could not build offline ZIP', 'error');
    } finally {
      setZipBusy(false);
    }
  };

  const handleCheckSwUpdate = async () => {
    if (!('serviceWorker' in navigator)) {
      onToast('Offline worker is not supported in this browser', 'warning');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        onToast('Offline cache worker not registered yet (reload when online)', 'warning');
        return;
      }
      await reg.update();
      onToast('Checked for app updates cleanly — your store data is safe', 'success');
    } catch {
      onToast('Unable to check for updates while offline', 'warning');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-slate-50">
      <div className="max-w-5xl mx-auto space-y-4 pb-8">
        {/* Header bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-xs">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">Store &amp; System Settings</h2>
            <p className="text-xs text-slate-500">
              All changes stay local on this device. Existing inventory and sales are preserved automatically.
            </p>
          </div>
          {hasPin && (
            <button
              type="button"
              onClick={onLockSettings}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              Lock Settings
            </button>
          )}
        </div>

        {weakBanner && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Weak Manager PIN detected</div>
              <div className="text-amber-800 mt-0.5">
                Please change your Manager PIN below to a stronger 4–8 digit code to protect voids, settings, and reset controls.
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Store & Receipt + Inventory Preferences */}
          <form
            onSubmit={handleSaveGeneral}
            className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-extrabold text-slate-900">Store Profile &amp; POS Preferences</h3>
              <span className="text-[11px] font-semibold text-slate-400">Receipt &amp; Stock</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Store Name</label>
                <input
                  type="text"
                  value={form.storeName}
                  onChange={(e) => setForm({ ...form, storeName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Store Address</label>
                <input
                  type="text"
                  value={form.storeAddress}
                  onChange={(e) => setForm({ ...form, storeAddress: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">TIN / Tax Header</label>
                <input
                  type="text"
                  value={form.storeTin}
                  onChange={(e) => setForm({ ...form, storeTin: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Store Phone / Mobile</label>
                <input
                  type="text"
                  value={form.storePhone}
                  onChange={(e) => setForm({ ...form, storePhone: e.target.value })}
                  placeholder="0917-xxx-xxxx"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Receipt Footer Message</label>
                <input
                  type="text"
                  value={form.receiptFooter}
                  onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Thermal Paper Width</label>
                <select
                  value={form.receiptWidth === '58mm' ? '58mm' : '80mm'}
                  onChange={(e) => setForm({ ...form, receiptWidth: e.target.value as '80mm' | '58mm' })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:border-blue-600 focus:outline-none"
                >
                  <option value="80mm">80mm (Standard POS)</option>
                  <option value="58mm">58mm (Compact / Bluetooth)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">SC/PWD Weekly Cap (₱)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.scDiscountCap}
                  onChange={(e) => setForm({ ...form, scDiscountCap: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Low Stock Threshold</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.lowStockThreshold}
                  onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Expiry Warning (days)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.expiryWarnDays}
                  onChange={(e) => setForm({ ...form, expiryWarnDays: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Supplier Lead Time (days)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.reorderLeadDays}
                  onChange={(e) => setForm({ ...form, reorderLeadDays: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Safety Buffer (days)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.reorderSafetyDays}
                  onChange={(e) => setForm({ ...form, reorderSafetyDays: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-1 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={!!form.beep}
                  onChange={(e) => setForm({ ...form, beep: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
                Scanner Beep Sound
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={!!form.vibrate}
                  onChange={(e) => setForm({ ...form, vibrate: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
                Haptic Vibrate on Scan
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer"
            >
              Save Store Settings
            </button>
          </form>

          {/* Right column: Security + Backup & Restore */}
          <div className="space-y-4">
            {/* Security & Manager PIN */}
            <form
              onSubmit={handleUpdatePin}
              className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-extrabold text-slate-900">Manager PIN Security</h3>
                <span className="text-[11px] font-semibold text-emerald-700">
                  {hasPin ? 'PBKDF2 Protected' : 'No PIN Set'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                {hasPin && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Current PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={curPin}
                      onChange={(e) => setCurPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num"
                    />
                  </div>
                )}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">New PIN (4–8 digits)</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Confirm PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num"
                  />
                </div>
              </div>

              {newPin.length >= 4 && isWeakPin(newPin) && (
                <label className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowWeakPin}
                    onChange={(e) => setAllowWeakPin(e.target.checked)}
                    className="mt-0.5 accent-amber-600"
                  />
                  <span>This PIN is easy to guess (repeated/sequential). Check to confirm if you want to use it anyway.</span>
                </label>
              )}

              <button
                type="submit"
                disabled={pinBusy}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {pinBusy ? 'Updating…' : hasPin ? 'Change Manager PIN' : 'Set Manager PIN'}
              </button>
            </form>

            {/* Backup & Restore */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-extrabold text-slate-900">Backup &amp; Restore</h3>
                <span className="text-[11px] font-mono-num text-slate-500">
                  {products.length} SKUs · {sales.length} Sales
                </span>
              </div>

              <div className="text-xs text-slate-600">
                Last backup:{' '}
                <span className="font-semibold text-slate-800">
                  {settings.lastBackup ? new Date(settings.lastBackup).toLocaleString('en-PH') : 'Never exported on this device'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download Backup JSON
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  Restore / Merge Backup
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleBackupFilePick}
                  className="hidden"
                />
              </div>

              {restorePreview && (
                <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-2.5 text-xs">
                  <div className="font-bold text-blue-950">Backup Preview: {restorePreview.fileName}</div>
                  <div className="grid grid-cols-3 gap-2 text-blue-900">
                    <div>
                      <div className="text-[11px] text-blue-700">Products</div>
                      <div className="font-extrabold font-mono-num">{restorePreview.products.length}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-blue-700">Sales</div>
                      <div className="font-extrabold font-mono-num">{restorePreview.sales.length}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-blue-700">Held Orders</div>
                      <div className="font-extrabold font-mono-num">{restorePreview.heldOrders.length}</div>
                    </div>
                  </div>
                  {restorePreview.exportedAt && (
                    <div className="text-[11px] text-blue-800">
                      Exported: {new Date(restorePreview.exportedAt).toLocaleString('en-PH')}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onApplyRestore(restorePreview, 'merge');
                        setRestorePreview(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                    >
                      Merge Missing Only (Keep Current)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyRestore(restorePreview, 'replace');
                        setRestorePreview(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
                    >
                      Replace Device Data
                    </button>
                    <button
                      type="button"
                      onClick={() => setRestorePreview(null)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Storage meter */}
              <div className="pt-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>Device Storage Used</span>
                  <span className="font-mono-num font-semibold text-slate-700">{usedKb} KB / ~5 MB</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${quotaPct > 80 ? 'bg-red-500' : 'bg-blue-600'}`}
                    style={{ width: `${Math.max(2, quotaPct)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Offline PWA & App Install */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-extrabold text-slate-900">Offline App &amp; Updates</h3>
                {isInstalled ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Installed
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-500">PWA Ready</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {isInstallable && !isInstalled && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await install();
                      if (ok) onToast('OmniMart PH POS installed on this device', 'success');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    Install App to Home Screen
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCheckSwUpdate}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Check App Updates
                </button>
                <button
                  type="button"
                  onClick={handleDownloadOfflineZip}
                  disabled={zipBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  <Archive className="w-3.5 h-3.5" />
                  {zipBusy ? 'Building ZIP…' : 'Offline Kit ZIP'}
                </button>
              </div>

              {isIOS && !isInstalled && (
                <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  On iPhone/iPad Safari: tap the <span className="font-bold">Share</span> icon and choose{' '}
                  <span className="font-bold">Add to Home Screen</span> for offline full-screen mode.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* System Version & Configuration Version Control */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-blue-600" />
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  System Version &amp; Config Rollback
                </h3>
                <p className="text-[11px] text-slate-500">
                  Current stable build: <span className="font-mono-num font-bold text-slate-800">{RELEASE_TAG}</span> ({RELEASE_DATE}) · {PRESERVED_DATA_KEYS.length} protected device data keys
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono-num font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md">
              v{APP_VERSION} Stable
            </span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCreateConfigCheckpoint(checkpointLabel);
              setCheckpointLabel('');
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              type="text"
              value={checkpointLabel}
              onChange={(e) => setCheckpointLabel(e.target.value)}
              placeholder="Checkpoint note (e.g. Before updating receipt footer)"
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-300 text-xs focus:border-blue-600 focus:outline-none"
            />
            <button
              type="submit"
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
            >
              Save Config Checkpoint
            </button>
          </form>

          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {configHistory.map((snap, idx) => (
              <div key={snap.id} className="px-3 py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 truncate">
                    {snap.label}
                    {idx === 0 && (
                      <span className="ml-2 text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                        Latest
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    v{snap.version} ·{' '}
                    {new Date(snap.createdAt).toLocaleString('en-PH', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {snap.changedFields.length > 0 ? ` · Changed: ${snap.changedFields.join(', ')}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRollbackConfig(snap.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Rollback Config
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Stock Adjustment Audit Log */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-extrabold text-slate-900">
                Stock Adjustment Log ({stockLog.length})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
            >
              {showLog ? 'Hide Log' : 'View Log'}
            </button>
          </div>
          {showLog && (
            <div className="mt-3 border-t border-slate-100 pt-3 max-h-64 overflow-y-auto">
              {stockLog.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">No manual stock adjustments recorded yet.</div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-1.5 pr-2">Date</th>
                      <th className="py-1.5 pr-2">Product</th>
                      <th className="py-1.5 pr-2">Reason</th>
                      <th className="py-1.5 text-right">Change</th>
                      <th className="py-1.5 text-right pl-2">New Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stockLog.slice(0, 100).map((entry) => (
                      <tr key={entry.id}>
                        <td className="py-1.5 pr-2 text-slate-500 whitespace-nowrap">
                          {new Date(entry.dateIso).toLocaleString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-1.5 pr-2 font-semibold text-slate-800">
                          {entry.productName}
                          {entry.note && <span className="block text-[11px] font-normal text-slate-500">{entry.note}</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600">{entry.reason}</td>
                        <td
                          className={`py-1.5 text-right font-mono-num font-bold ${
                            entry.delta >= 0 ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {entry.delta >= 0 ? '+' : ''}
                          {entry.delta}
                        </td>
                        <td className="py-1.5 text-right pl-2 font-mono-num text-slate-700">{entry.newStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="bg-red-50/70 border border-red-200 rounded-xl p-4 sm:p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <h3 className="text-sm font-extrabold">Danger Zone (Requires Confirmation)</h3>
          </div>
          <p className="text-xs text-red-800">
            Export a JSON backup above before clearing sales or resetting. Current inventory retail value:{' '}
            <span className="font-mono-num font-bold">
              {formatPeso(products.reduce((s, p) => s + p.retailPrice * p.stock, 0))}
            </span>
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              onClick={onAskClearSales}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-red-300 hover:bg-red-100 text-red-700 text-xs font-bold cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Sales History
            </button>
            <button
              type="button"
              onClick={onAskFactoryReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Factory Reset App
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
