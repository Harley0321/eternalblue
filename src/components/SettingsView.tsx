import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  FileKey2,
  Fingerprint,
  GitBranch,
  History,
  KeyRound,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import JSZip from 'jszip';
import type {
  ConfigSnapshot,
  EncryptedVaultEnvelope,
  HeldOrder,
  Product,
  SaleRecord,
  SecurityEventType,
  SecurityLogEntry,
  SecuritySeverity,
  StockLogEntry,
  StoreSettings,
} from '../types';
import {
  getPinSecurityMeta,
  isWeakPin,
  PIN_SETTING_KEYS,
  pinIsSet,
  pinNeedsChange,
  storePinInSettings,
  verifyPinWithSettings,
} from '../utils/pinSecurity';
import {
  decryptBackupPayload,
  encryptBackupPayload,
  enrollLocalPasskey,
  evaluatePassphraseStrength,
  isDeviceKeystoreSupported,
  isEncryptedVaultEnvelope,
  isPasskeySupported,
  verifySecurityChain,
  type SecurityChainReport,
} from '../utils/cryptoVault';
import { formatPeso, safeJsonParse, validateBackupPayload } from '../utils/posMath';
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
  securityLog: SecurityLogEntry[];
  deviceKeyReady: boolean;
  onSaveSettings: (next: StoreSettings) => void;
  onCreateConfigCheckpoint: (label?: string) => void;
  onRollbackConfig: (snapshotId: string) => void;
  onLockSettings: () => void;
  onLockTerminal: () => void;
  onLogSecurityEvent: (
    event: SecurityEventType,
    summary: string,
    severity?: SecuritySeverity,
  ) => Promise<void> | void;
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
  securityLog,
  deviceKeyReady,
  onSaveSettings,
  onCreateConfigCheckpoint,
  onRollbackConfig,
  onLockSettings,
  onLockTerminal,
  onLogSecurityEvent,
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

  // Encrypted backup export & import state
  const [showEncryptPanel, setShowEncryptPanel] = useState(false);
  const [vaultPass, setVaultPass] = useState('');
  const [vaultPassConfirm, setVaultPassConfirm] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);

  const [pendingEncryptedFile, setPendingEncryptedFile] = useState<{
    fileName: string;
    envelope: EncryptedVaultEnvelope;
  } | null>(null);
  const [decryptPass, setDecryptPass] = useState('');
  const [decryptBusy, setDecryptBusy] = useState(false);

  const [restorePreview, setRestorePreview] = useState<{
    fileName: string;
    exportedAt?: string;
    encrypted?: boolean;
    products: Product[];
    sales: SaleRecord[];
    heldOrders: HeldOrder[];
    settings?: Partial<StoreSettings>;
  } | null>(null);

  const [showLog, setShowLog] = useState(false);
  const [showSecLedger, setShowSecLedger] = useState(false);
  const [chainReport, setChainReport] = useState<SecurityChainReport | null>(null);
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const usedBytes = getUsedStorageBytes();
  const usedKb = (usedBytes / 1024).toFixed(1);
  const quotaPct = Math.min(100, (usedBytes / (5 * 1024 * 1024)) * 100);
  const hasPin = pinIsSet(settings);
  const pinMeta = getPinSecurityMeta(settings);
  const weakBanner = pinNeedsChange(settings);
  const hasPasskey = Boolean(settings.passkeyCredId && settings.passkeyPubKeySpki);
  const passkeyAvailable = isPasskeySupported();
  const keystoreAvailable = isDeviceKeystoreSupported();
  const vaultStrength = evaluatePassphraseStrength(vaultPass);

  // Security posture score out of 4 pillars
  const securityPillars = [
    {
      label: 'PIN KDF',
      ok: pinMeta.isLatestAlgo && !pinMeta.isWeak,
      detail: pinMeta.isLatestAlgo
        ? 'PBKDF2-SHA512 · 310k'
        : pinMeta.hasPin
          ? `${pinMeta.algo} (Re-hashes on next unlock)`
          : 'No PIN Set',
    },
    {
      label: 'Device Keystore',
      ok: deviceKeyReady && keystoreAvailable,
      detail: deviceKeyReady
        ? 'IndexedDB Non-Extractable HMAC-SHA256'
        : keystoreAvailable
          ? 'Ready on next event'
          : 'Not available',
    },
    {
      label: 'Audit Ledger',
      ok: securityLog.length > 0 && (chainReport ? chainReport.valid : true),
      detail: chainReport
        ? chainReport.valid
          ? `Verified ${chainReport.verifiedCount} chained record(s)`
          : `Integrity alert (${chainReport.brokenSeqs.length + chainReport.hmacMismatches.length})`
        : `${securityLog.length} SHA-256 chained event(s)`,
    },
    {
      label: 'Passkey / Biometric',
      ok: hasPasskey,
      detail: hasPasskey
        ? 'FIDO2 ES256 Enrolled'
        : passkeyAvailable
          ? 'Optional WebAuthn Ready'
          : 'Requires HTTPS / localhost',
    },
  ];
  const postureScore = securityPillars.filter((p) => p.ok).length;

  const buildSanitizedBackupObject = (nowIso: string) => {
    const cleanSettings: Record<string, unknown> = { ...settings };
    PIN_SETTING_KEYS.forEach((k) => {
      delete cleanSettings[k];
    });
    return {
      app: 'omnimart-ph-pos' as const,
      version: 1,
      exportedAt: nowIso,
      products,
      sales,
      heldOrders,
      settings: cleanSettings,
    };
  };

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
      autoLockMinutes: Number(form.autoLockMinutes ?? 5),
      lockWholePos: Boolean(form.lockWholePos),
    };
    onSaveSettings(cleaned);
    setForm(cleaned);
    onToast('Store settings saved', 'success');
  };

  const handleSaveSecurityPolicy = (patch: Partial<StoreSettings>, toastMsg: string) => {
    const next: StoreSettings = { ...settings, ...patch };
    onSaveSettings(next);
    setForm(next);
    onToast(toastMsg, 'success');
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
          await onLogSecurityEvent('PIN_FAIL', 'Failed PIN verification while updating Manager PIN', 'warning');
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
      await onLogSecurityEvent(
        'PIN_SET',
        `Manager PIN updated (${next.adminPinAlgo || 'PBKDF2-SHA512'}, ${next.adminPinIter || 310000} rounds${weak ? ', weak-override' : ''})`,
        weak ? 'warning' : 'info',
      );
      onToast('Manager PIN upgraded & saved with PBKDF2-SHA512 (310k rounds)', 'success');
    } finally {
      setPinBusy(false);
    }
  };

  const handleEnrollPasskey = async () => {
    setPasskeyBusy(true);
    try {
      const enrolled = await enrollLocalPasskey(settings.storeName);
      const next: StoreSettings = {
        ...settings,
        passkeyCredId: enrolled.credId,
        passkeyPubKeySpki: enrolled.pubKeySpki,
        passkeyLabel: enrolled.label,
        passkeyRegisteredAt: enrolled.registeredAt,
      };
      onSaveSettings(next);
      setForm(next);
      await onLogSecurityEvent('PASSKEY_ENROLLED', 'Enrolled client-side FIDO2 ES256 Passkey for unlock', 'info');
      onToast('Biometric / FIDO2 Passkey enrolled on this device', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey setup failed';
      onToast(msg, 'warning');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleRemovePasskey = async () => {
    const next: StoreSettings = { ...settings };
    delete next.passkeyCredId;
    delete next.passkeyPubKeySpki;
    delete next.passkeyLabel;
    delete next.passkeyRegisteredAt;
    onSaveSettings(next);
    setForm(next);
    await onLogSecurityEvent('PASSKEY_REMOVED', 'Removed device FIDO2 Passkey credential', 'warning');
    onToast('Device Passkey removed', 'warning');
  };

  const handleVerifyChain = async () => {
    setVerifyingChain(true);
    try {
      const report = await verifySecurityChain(securityLog);
      setChainReport(report);
      if (report.valid) {
        onToast(`Audit ledger verified (${report.verifiedCount} intact entries)`, 'success');
      } else {
        onToast('Audit ledger tamper mismatch detected!', 'error');
      }
    } finally {
      setVerifyingChain(false);
    }
  };

  const handleExportBackup = async () => {
    const nowIso = new Date().toISOString();
    const payload = buildSanitizedBackupObject(nowIso);
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
    await onLogSecurityEvent(
      'BACKUP_EXPORTED',
      `Exported plain backup JSON (${products.length} SKUs, ${sales.length} sales)`,
      'info',
    );
    onToast('Backup JSON downloaded (PIN & Passkeys excluded)', 'success');
  };

  const handleExportEncryptedVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultStrength.ok) {
      onToast(vaultStrength.hint, 'warning');
      return;
    }
    if (vaultPass !== vaultPassConfirm) {
      onToast('Vault passphrases do not match', 'error');
      return;
    }
    setVaultBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const payload = buildSanitizedBackupObject(nowIso);
      const envelope = await encryptBackupPayload(payload, vaultPass);
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `omnimart-vault-aes256gcm-${new Date().toLocaleDateString('en-CA')}.json`;
      a.click();
      URL.revokeObjectURL(url);

      const updated = { ...settings, lastBackup: nowIso };
      onSaveSettings(updated);
      setForm(updated);
      setVaultPass('');
      setVaultPassConfirm('');
      setShowEncryptPanel(false);
      await onLogSecurityEvent(
        'BACKUP_ENCRYPTED_EXPORTED',
        `Exported AES-256-GCM encrypted backup vault (${products.length} SKUs, ${sales.length} sales)`,
        'info',
      );
      onToast('Encrypted AES-256-GCM vault downloaded', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Vault encryption failed', 'error');
    } finally {
      setVaultBusy(false);
    }
  };

  const handleBackupFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = safeJsonParse<unknown>(text);

      if (isEncryptedVaultEnvelope(parsed)) {
        setRestorePreview(null);
        setDecryptPass('');
        setPendingEncryptedFile({ fileName: file.name, envelope: parsed });
        onToast('Encrypted AES-256-GCM vault detected — enter passphrase to unlock', 'success');
        return;
      }

      const res = validateBackupPayload(parsed);
      if (res.ok === false) {
        onToast(res.error, 'error');
        return;
      }
      setPendingEncryptedFile(null);
      setRestorePreview({
        fileName: file.name,
        ...res.data,
      });
    } catch {
      onToast('Could not read backup file. Make sure it is a valid JSON or encrypted vault export.', 'error');
    }
  };

  const handleDecryptVaultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEncryptedFile || !decryptPass) return;
    setDecryptBusy(true);
    try {
      const decoded = await decryptBackupPayload(pendingEncryptedFile.envelope, decryptPass);
      setRestorePreview({
        fileName: pendingEncryptedFile.fileName,
        encrypted: true,
        ...decoded,
      });
      setPendingEncryptedFile(null);
      setDecryptPass('');
      onToast('Encrypted vault authenticated and unlocked cleanly', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Incorrect passphrase or tampered vault', 'error');
    } finally {
      setDecryptBusy(false);
    }
  };

  const handleDownloadOfflineZip = async () => {
    setZipBusy(true);
    try {
      const zip = new JSZip();
      const nowIso = new Date().toISOString();
      zip.file('omnimart-backup.json', JSON.stringify(buildSanitizedBackupObject(nowIso), null, 2));
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
          '2. Keep omnimart-backup.json safe. Use Encrypted AES-256-GCM Vaults for cloud or flash drive storage.',
          '3. Manager PIN hashes and Passkey credentials are never exported in backups for security.',
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
              All data, keys, and encrypted vaults remain local on this device with zero external database exposure.
            </p>
          </div>
          {hasPin && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onLockSettings}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                Lock Settings
              </button>
              <button
                type="button"
                onClick={onLockTerminal}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Lock Terminal Now
              </button>
            </div>
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

        {/* Cryptography & Zero-DB Security Posture Center */}
        <div
          data-testid="security-posture-card"
          className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Zero-Database Security Architecture
                </h3>
                <p className="text-[11px] text-slate-500">
                  Hardware-isolated WebCrypto · Non-Extractable IndexedDB Keystore · SHA-256 Hash-Chained Audit Ledger
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold font-mono-num border ${
                  postureScore >= 3
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                Defense: {postureScore}/4 Pillars
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {securityPillars.map((pillar) => (
              <div
                key={pillar.label}
                className={`rounded-xl border p-2.5 ${
                  pillar.ok
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-1 font-bold text-slate-900">
                  <span>{pillar.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-extrabold ${
                      pillar.ok ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {pillar.ok ? 'ACTIVE' : 'STAND-BY'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 mt-1 leading-snug">{pillar.detail}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleVerifyChain}
                disabled={verifyingChain}
                data-testid="verify-chain-btn"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {verifyingChain ? 'Verifying…' : 'Verify Chain Integrity'}
              </button>
              <button
                type="button"
                onClick={() => setShowSecLedger((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
                {showSecLedger ? 'Hide Security Ledger' : `View Security Ledger (${securityLog.length})`}
              </button>
            </div>

            {chainReport && (
              <div
                data-testid="chain-verify-result"
                className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                  chainReport.valid
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {chainReport.valid
                  ? `✓ Intact (${chainReport.verifiedCount} ${chainReport.verifiedCount === 1 ? 'entry' : 'entries'} · ${chainReport.signedCount} hardware-signed)`
                  : `✗ Tamper mismatch at seq ${[...chainReport.brokenSeqs, ...chainReport.hmacMismatches].join(', ')}`}
              </div>
            )}
          </div>

          {showSecLedger && (
            <div className="border-t border-slate-100 pt-3 max-h-60 overflow-y-auto divide-y divide-slate-100">
              {securityLog.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  No security events recorded yet. Actions like PIN checks, voids, locks, and backups append here.
                </div>
              ) : (
                securityLog.slice(0, 60).map((entry) => (
                  <div key={entry.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono-num text-[10px] font-bold text-slate-500">#{entry.seq}</span>
                        <span
                          className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase ${
                            entry.severity === 'critical'
                              ? 'bg-rose-100 text-rose-800'
                              : entry.severity === 'warning'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {entry.event}
                        </span>
                        <span className="font-semibold text-slate-800 truncate">{entry.summary}</span>
                      </div>
                      <div className="text-[10px] font-mono-num text-slate-400 mt-0.5 truncate">
                        {new Date(entry.timestamp).toLocaleString('en-PH')} · Hash: {entry.entryHash.slice(0, 14)}…
                        {entry.hmacSig ? ' · IDB-HMAC Signed' : ''}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Store Address</label>
                <input
                  type="text"
                  value={form.storeAddress}
                  onChange={(e) => setForm({ ...form, storeAddress: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">TIN / Tax Header</label>
                <input
                  type="text"
                  value={form.storeTin}
                  onChange={(e) => setForm({ ...form, storeTin: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Store Phone / Mobile</label>
                <input
                  type="text"
                  value={form.storePhone}
                  onChange={(e) => setForm({ ...form, storePhone: e.target.value })}
                  placeholder="0917-xxx-xxxx"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Receipt Footer Message</label>
                <input
                  type="text"
                  value={form.receiptFooter}
                  onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Thermal Paper Width</label>
                <select
                  value={form.receiptWidth === '58mm' ? '58mm' : '80mm'}
                  onChange={(e) => setForm({ ...form, receiptWidth: e.target.value as '80mm' | '58mm' })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:border-emerald-600 focus:outline-none"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-1 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={!!form.beep}
                  onChange={(e) => setForm({ ...form, beep: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600"
                />
                Scanner Beep Sound
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={!!form.vibrate}
                  onChange={(e) => setForm({ ...form, vibrate: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600"
                />
                Haptic Vibrate on Scan
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold cursor-pointer"
            >
              Save Store Settings
            </button>
          </form>

          {/* Right column: PIN, Passkey, Auto-Lock + Encrypted Backup */}
          <div className="space-y-4">
            {/* Security & Manager PIN + WebAuthn Passkey + Auto-Lock */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-extrabold text-slate-900">Manager PIN, Passkey &amp; Lock Policy</h3>
                <span className="text-[11px] font-bold font-mono-num text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  {pinMeta.isLatestAlgo
                    ? 'PBKDF2-SHA512 · 310k'
                    : hasPin
                      ? `${pinMeta.algo} · Upgradeable`
                      : 'No PIN Set'}
                </span>
              </div>

              <form onSubmit={handleUpdatePin} className="space-y-3">
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
                    <span>This PIN is easy to guess (repeated/sequential/year). Check to confirm anyway.</span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={pinBusy}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {pinBusy ? 'Deriving 310k Key…' : hasPin ? 'Change Manager PIN' : 'Set Manager PIN'}
                </button>
              </form>

              {/* Idle Auto-Lock & Terminal Lockscreen controls */}
              <div className="border-t border-slate-100 pt-3 space-y-2.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Inactivity Auto-Lock</label>
                    <select
                      value={String(settings.autoLockMinutes ?? 5)}
                      onChange={(e) =>
                        handleSaveSecurityPolicy(
                          { autoLockMinutes: Number(e.target.value) },
                          'Auto-lock timeout updated',
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:border-emerald-600 focus:outline-none"
                    >
                      <option value="2">2 minutes (Strict)</option>
                      <option value="5">5 minutes (Recommended)</option>
                      <option value="15">15 minutes</option>
                      <option value="0">Disabled</option>
                    </select>
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer font-medium text-slate-700 pt-3 sm:pt-4">
                    <input
                      type="checkbox"
                      checked={Boolean(settings.lockWholePos)}
                      onChange={(e) =>
                        handleSaveSecurityPolicy(
                          { lockWholePos: e.target.checked },
                          e.target.checked ? 'Full POS terminal auto-lock enabled' : 'Settings-only auto-lock active',
                        )
                      }
                      className="w-4 h-4 mt-0.5 accent-emerald-600"
                    />
                    <span>Lock entire POS register on idle timeout (not just Settings)</span>
                  </label>
                </div>

                {/* Client-side WebAuthn Passkey enrollment */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                  <div className="min-w-0 flex items-center gap-2">
                    <Fingerprint className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-800">
                        {hasPasskey ? 'FIDO2 / Biometric Passkey Enrolled' : 'Biometric / Security Key Unlock'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {hasPasskey
                          ? `Verified locally via ES256 SPKI · Enrolled ${new Date(settings.passkeyRegisteredAt || '').toLocaleDateString('en-PH')}`
                          : passkeyAvailable
                            ? 'Uses Windows Hello, Touch ID, Face ID, or YubiKey with zero server.'
                            : 'Requires HTTPS or localhost WebAuthn browser support.'}
                      </div>
                    </div>
                  </div>
                  {hasPasskey ? (
                    <button
                      type="button"
                      onClick={handleRemovePasskey}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-[11px] font-bold cursor-pointer"
                    >
                      Remove Passkey
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={passkeyBusy || !passkeyAvailable}
                      onClick={handleEnrollPasskey}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      {passkeyBusy ? 'Waiting for Device…' : 'Enroll Passkey'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Encrypted Backup & Restore Vault */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-extrabold text-slate-900">Backup &amp; Encrypted Vault</h3>
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setShowEncryptPanel((v) => !v)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                >
                  <FileKey2 className="w-4 h-4 text-emerald-400" />
                  Encrypted Vault
                </button>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Plain JSON
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  Restore / Vault
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleBackupFilePick}
                  className="hidden"
                />
              </div>

              {showEncryptPanel && (
                <form
                  onSubmit={handleExportEncryptedVault}
                  className="border border-slate-200 bg-slate-50 rounded-xl p-3 space-y-2.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                      AES-256-GCM Vault (PBKDF2-SHA512 + HKDF)
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">Zero-knowledge encryption</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="password"
                      value={vaultPass}
                      onChange={(e) => setVaultPass(e.target.value)}
                      placeholder="Vault passphrase (8+ chars)"
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs focus:border-emerald-600 focus:outline-none"
                    />
                    <input
                      type="password"
                      value={vaultPassConfirm}
                      onChange={(e) => setVaultPassConfirm(e.target.value)}
                      placeholder="Confirm passphrase"
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600">{vaultStrength.hint}</span>
                      <span className="font-bold text-slate-800">{vaultStrength.label}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          vaultStrength.score <= 1
                            ? 'bg-rose-500'
                            : vaultStrength.score === 2
                              ? 'bg-amber-500'
                              : 'bg-emerald-600'
                        }`}
                        style={{ width: `${Math.max(10, vaultStrength.score * 25)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={vaultBusy}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer disabled:opacity-50"
                    >
                      {vaultBusy ? 'Encrypting Vault…' : 'Encrypt & Download Vault'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEncryptPanel(false)}
                      className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {pendingEncryptedFile && (
                <form
                  onSubmit={handleDecryptVaultSubmit}
                  className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 space-y-2.5 text-xs"
                >
                  <div className="font-bold text-emerald-950">
                    Encrypted Vault: {pendingEncryptedFile.fileName}
                  </div>
                  <div className="text-[11px] text-emerald-800">
                    Summary: {pendingEncryptedFile.envelope.summary.products} SKUs ·{' '}
                    {pendingEncryptedFile.envelope.summary.sales} sales · Exported{' '}
                    {new Date(pendingEncryptedFile.envelope.exportedAt).toLocaleString('en-PH')}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="password"
                      autoFocus
                      value={decryptPass}
                      onChange={(e) => setDecryptPass(e.target.value)}
                      placeholder="Enter vault passphrase to decrypt"
                      className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-emerald-300 bg-white text-xs focus:border-emerald-600 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={decryptBusy || !decryptPass}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer disabled:opacity-50"
                    >
                      {decryptBusy ? 'Decrypting…' : 'Decrypt & Preview'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingEncryptedFile(null)}
                      className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {restorePreview && (
                <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 space-y-2.5 text-xs">
                  <div className="font-bold text-emerald-950">
                    {restorePreview.encrypted ? 'Unlocked Vault Preview: ' : 'Backup Preview: '}
                    {restorePreview.fileName}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-emerald-900">
                    <div>
                      <div className="text-[11px] text-emerald-700">Products</div>
                      <div className="font-extrabold font-mono-num">{restorePreview.products.length}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-emerald-700">Sales</div>
                      <div className="font-extrabold font-mono-num">{restorePreview.sales.length}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-emerald-700">Held Orders</div>
                      <div className="font-extrabold font-mono-num">{restorePreview.heldOrders.length}</div>
                    </div>
                  </div>
                  {restorePreview.exportedAt && (
                    <div className="text-[11px] text-emerald-800">
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
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
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
                    className={`h-full rounded-full ${quotaPct > 80 ? 'bg-rose-500' : 'bg-emerald-600'}`}
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
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
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
              <GitBranch className="w-4 h-4 text-emerald-600" />
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
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-300 text-xs focus:border-emerald-600 focus:outline-none"
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
                      <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
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
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 text-[11px] font-bold shrink-0 cursor-pointer"
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
                            entry.delta >= 0 ? 'text-emerald-700' : 'text-rose-600'
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
        <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-4 sm:p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-rose-900">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <h3 className="text-sm font-extrabold">Danger Zone (Requires Confirmation)</h3>
          </div>
          <p className="text-xs text-rose-800">
            Export an Encrypted Vault or JSON backup above before clearing sales or resetting. Current inventory retail value:{' '}
            <span className="font-mono-num font-bold">
              {formatPeso(products.reduce((s, p) => s + p.retailPrice * p.stock, 0))}
            </span>
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              onClick={onAskClearSales}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-rose-300 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Sales History
            </button>
            <button
              type="button"
              onClick={onAskFactoryReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
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
