import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import { GlowingEmeraldStoreName, StoreEmblem } from '../components/CommonGraphics';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { PosMath } from '../domain/posMath';
import { isSafeHttpUrl } from '../domain/posValidation';
import { DeviceBridge } from '../hardware/deviceBridge';
import { usePos } from '../state/PosContext';
import { SettingsSecuritySection } from './SettingsSecuritySection';

type StorageProtectionStatus = 'checking' | 'protected' | 'not-protected' | 'unsupported' | 'error';

export const SettingsScreen: React.FC = () => {
  const {
    state,
    pinConfigured,
    openPinModal,
    updateSettings,
    applyDefaultWholesaleMinQtyToAll,
    checkForGitHubUpdates,
    installAppUpdate,
    refreshWebApp,
  } = usePos();
  const showAppUpdateControls = true;

  const [storeName, setStoreName] = useState(state.settings.storeName);
  const [storeAddr, setStoreAddr] = useState(state.settings.storeAddress);
  const [storeFooter, setStoreFooter] = useState(state.settings.receiptFooter);
  const [scCap, setScCap] = useState(String(state.settings.scDiscountCap));
  const [lowThresh, setLowThresh] = useState(String(state.settings.lowStockThreshold));
  const [defaultWsMinQty, setDefaultWsMinQty] = useState(
    String(state.settings.defaultWholesaleMinQty ?? 10)
  );
  const [qrLabel, setQrLabel] = useState(state.settings.qrPayLabel ?? '');
  const [qrAcct, setQrAcct] = useState(state.settings.qrAccountNumber ?? '');
  const [qrEmv, setQrEmv] = useState(state.settings.qrEmvPayload ?? '');
  const [githubRepoInput, setGithubRepoInput] = useState(state.settings.githubRepo);
  const [storageProtection, setStorageProtection] = useState<StorageProtectionStatus>('checking');
  const [requestingStorageProtection, setRequestingStorageProtection] = useState(false);

  useEffect(() => {
    setStoreName(state.settings.storeName);
    setStoreAddr(state.settings.storeAddress);
    setStoreFooter(state.settings.receiptFooter);
    setScCap(String(state.settings.scDiscountCap));
    setLowThresh(String(state.settings.lowStockThreshold));
    setDefaultWsMinQty(String(state.settings.defaultWholesaleMinQty ?? 10));
    setQrLabel(state.settings.qrPayLabel ?? '');
    setQrAcct(state.settings.qrAccountNumber ?? '');
    setQrEmv(state.settings.qrEmvPayload ?? '');
    setGithubRepoInput(state.settings.githubRepo);
  }, [state.settings]);

  useEffect(() => {
    let active = true;
    const storage = navigator.storage;
    if (!storage || typeof storage.persisted !== 'function') {
      setStorageProtection('unsupported');
      return;
    }

    void storage.persisted().then(
      (persisted) => {
        if (active) setStorageProtection(persisted ? 'protected' : 'not-protected');
      },
      () => {
        if (active) setStorageProtection('error');
      }
    );

    return () => {
      active = false;
    };
  }, []);

  const requestStorageProtection = async () => {
    const storage = navigator.storage;
    if (!storage || typeof storage.persist !== 'function') {
      setStorageProtection('unsupported');
      return;
    }

    setRequestingStorageProtection(true);
    try {
      const persisted = await storage.persist();
      setStorageProtection(persisted ? 'protected' : 'not-protected');
    } catch {
      setStorageProtection('error');
    } finally {
      setRequestingStorageProtection(false);
    }
  };

  const storageProtectionText = {
    checking: 'Checking browser storage protection...',
    protected: "Automatic browser eviction is disabled for this app's data.",
    'not-protected': 'The browser may clear local data under storage pressure.',
    unsupported: 'This browser does not support persistent storage requests.',
    error: 'Could not check or request storage protection.',
  }[storageProtection];

  if (pinConfigured && !state.settingsUnlocked) {
    return (
      <div className="h-full bg-[#F4F6F8] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 max-w-sm w-full flex flex-col items-center text-center">
          <Lock className="text-[#059669]" size={26} />
          <h2 className="mt-2 font-extrabold text-lg text-[#0F172A]">Settings Locked</h2>
          <p className="mt-1 text-xs text-[#64748B]">
            {showAppUpdateControls
              ? 'Enter Manager PIN to edit store profile, QR Ph, security, and app updates.'
              : 'Enter Manager PIN to edit store profile, QR Ph, and security.'}
          </p>
          {showAppUpdateControls && state.updateInfo?.isNewer && (
            <div className="mt-3 w-full rounded-xl bg-[#ECFDF5] border border-[#059669]/30 px-3 py-2 text-[11px] font-bold text-[#047857]">
              Update {state.updateInfo.tagName} is available — unlock Settings to download &amp; install.
            </div>
          )}
          <button
            type="button"
            onClick={() => openPinModal('unlockSettings')}
            className="mt-4 w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold cursor-pointer"
          >
            Unlock Settings
          </button>
        </div>
      </div>
    );
  }

  const info = state.updateInfo;
  const statusDotClass =
    info?.status === 'UPDATE_AVAILABLE'
      ? 'bg-[#059669]'
      : info?.status === 'NO_RELEASE_APK_YET'
      ? 'bg-[#D97706]'
      : info?.status === 'ERROR'
      ? 'bg-[#E11D48]'
      : 'bg-slate-400';

  const statusTextClass =
    info?.status === 'UPDATE_AVAILABLE'
      ? 'text-[#047857]'
      : info?.status === 'NO_RELEASE_APK_YET'
      ? 'text-[#B45309]'
      : info?.status === 'ERROR'
      ? 'text-[#E11D48]'
      : 'text-[#64748B]';

  const badgeText = state.updateChecking
    ? 'Checking...'
    : info?.status === 'UPDATE_AVAILABLE'
    ? 'Update Available'
    : info?.status === 'UP_TO_DATE'
    ? 'Up to Date'
    : info?.status === 'NO_RELEASE_APK_YET'
    ? 'Release Needed'
    : info?.status === 'ERROR'
    ? 'Sync Issue'
    : 'Not Checked';

  const safeApkUrl = isSafeHttpUrl(info?.apkDownloadUrl) ? info?.apkDownloadUrl ?? null : null;
  const scCapNum = parseFloat(scCap);
  const lowThreshNum = parseFloat(lowThresh);
  const wsMinNum = parseFloat(defaultWsMinQty);
  const profileNumericError =
    !Number.isFinite(scCapNum) || scCapNum < 1
      ? 'SC/PWD Cap must be at least ₱1.00.'
      : !Number.isFinite(lowThreshNum) || lowThreshNum < 1
      ? 'Low Stock Alert threshold must be at least 1.'
      : !Number.isFinite(wsMinNum) || wsMinNum < 1
      ? 'Default Min Wholesale Qty must be at least 1.'
      : null;

  return (
    <div className="p-3 sm:p-5 overflow-y-auto h-full bg-[#F8FAFC]">
      <div className="max-w-6xl mx-auto space-y-4">
        {showAppUpdateControls && info?.isNewer && (
          <div className="bg-[#ECFDF5] border border-[#059669]/35 rounded-[14px] p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[#047857]">
                Update {info.tagName} Available
              </div>
              <div className="text-[11px] text-[#065F46] truncate tabular-nums">
                {state.updateProgress
                  ? `${state.updateProgress.message} (${state.updateProgress.progress}%)`
                  : `Installed v${state.installedVersion.versionName} → Latest ${info.tagName}`}
              </div>
            </div>
            {safeApkUrl && (
              DeviceBridge.isAndroidHost() ? (
                <button
                  type="button"
                  disabled={
                    state.updateProgress?.status === 'DOWNLOADING' ||
                    state.updateProgress?.status === 'VERIFYING'
                  }
                  onClick={installAppUpdate}
                  className="shrink-0 min-h-[42px] px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download size={14} />
                  <span>Install Update</span>
                </button>
              ) : (
                <a
                  href={safeApkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 min-h-[42px] px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
                >
                  <Download size={14} />
                  <span>Download APK</span>
                </a>
              )
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column: Store Profile & QR */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-4 space-y-3">
              <h3 className="font-extrabold text-[15px] text-[#0F172A]">Store Profile &amp; Emblem</h3>
              <div className="rounded-xl bg-[#07110C] px-3.5 py-3 flex items-center gap-3">
                <StoreEmblem iconKey={state.settings.storeIcon} size={34} />
                <GlowingEmeraldStoreName
                  text={storeName.trim() || 'EternalBlue Mart'}
                  className="text-base"
                />
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Store Name"
                  className="w-full min-h-[40px] px-3 py-2 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
                />
                <input
                  type="text"
                  value={storeAddr}
                  onChange={(e) => setStoreAddr(e.target.value)}
                  placeholder="Address"
                  className="w-full min-h-[40px] px-3 py-2 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
                />
                <input
                  type="text"
                  value={storeFooter}
                  onChange={(e) => setStoreFooter(e.target.value)}
                  placeholder="Receipt Footer"
                  className="w-full min-h-[40px] px-3 py-2 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  ['basket', 'Basket'],
                  ['brand', 'Logo'],
                  ['store', 'Store'],
                  ['bag', 'Bag'],
                ].map(([id, lbl]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => updateSettings((s) => ({ ...s, storeIcon: id }))}
                    className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                      state.settings.storeIcon === id
                        ? 'bg-[#ECFDF5] border-[#059669] text-[#047857]'
                        : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-slate-50'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="settings-sc-cap" className="text-[11px] font-bold text-[#64748B]">
                    SC/PWD Cap (₱)
                  </label>
                  <input
                    id="settings-sc-cap"
                    type="number"
                    min="1"
                    step="0.01"
                    value={scCap}
                    onChange={(e) => setScCap(e.target.value)}
                    className="w-full mt-1 min-h-[40px] px-3 py-2 text-xs font-mono tabular-nums rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
                  />
                </div>
                <div>
                  <label htmlFor="settings-low-stock" className="text-[11px] font-bold text-[#64748B]">
                    Low Stock Alert
                  </label>
                  <input
                    id="settings-low-stock"
                    type="number"
                    min="1"
                    step="any"
                    value={lowThresh}
                    onChange={(e) => setLowThresh(e.target.value)}
                    className="w-full mt-1 min-h-[40px] px-3 py-2 text-xs font-mono tabular-nums rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <label htmlFor="settings-ws-min-qty" className="text-[11px] font-bold text-[#64748B]">
                      Default Min Wholesale Qty (Owner)
                    </label>
                    <input
                      id="settings-ws-min-qty"
                      type="number"
                      min="1"
                      step="any"
                      value={defaultWsMinQty}
                      onChange={(e) => setDefaultWsMinQty(e.target.value)}
                      className="w-full mt-1 min-h-[40px] px-3 py-2 text-xs font-mono tabular-nums bg-white rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!Number.isFinite(wsMinNum) || wsMinNum < 1}
                    onClick={() => {
                      if (!Number.isFinite(wsMinNum) || wsMinNum < 1) return;
                      applyDefaultWholesaleMinQtyToAll(PosMath.round3(wsMinNum));
                    }}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#EEF2FF] hover:bg-indigo-100 disabled:opacity-50 text-[#4F46E5] text-xs font-bold shrink-0 cursor-pointer disabled:cursor-not-allowed transition-colors"
                  >
                    Apply to All SKUs
                  </button>
                </div>
                <p className="text-[11px] text-[#64748B]">
                  POS switches items to wholesale automatically once quantity reaches each product&apos;s minimum (or this default).
                </p>
              </div>

              <div className="divide-y divide-[#E2E8F0] pt-1">
                <div className="flex items-center justify-between py-2">
                  <span className="text-[13px] font-semibold text-[#0F172A]">Scanner Beep Sound</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={state.settings.beep}
                    onClick={() => updateSettings((s) => ({ ...s, beep: !s.beep }))}
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer ${
                      state.settings.beep ? 'bg-[#059669]' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        state.settings.beep ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {DeviceBridge.isVibrationSupported() && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[13px] font-semibold text-[#0F172A]">Vibrate on Scan</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(state.settings.vibrateOnScan)}
                      onClick={() => updateSettings((s) => ({ ...s, vibrateOnScan: !s.vibrateOnScan }))}
                      className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer ${
                        state.settings.vibrateOnScan ? 'bg-[#059669]' : 'bg-slate-300'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                          state.settings.vibrateOnScan ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>

              {profileNumericError && (
                <p className="text-[11px] font-semibold text-[#E11D48]">{profileNumericError}</p>
              )}

              <button
                type="button"
                disabled={profileNumericError !== null}
                onClick={() => {
                  if (profileNumericError !== null) return;
                  updateSettings((s) => ({
                    ...s,
                    storeName: storeName.trim() || 'EternalBlue Mart',
                    storeAddress: storeAddr.trim(),
                    receiptFooter: storeFooter.trim(),
                    scDiscountCap: PosMath.round2(scCapNum),
                    lowStockThreshold: PosMath.round3(lowThreshNum),
                    defaultWholesaleMinQty: PosMath.round3(wsMinNum),
                  }));
                }}
                className="w-full min-h-[44px] py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:bg-slate-300 text-white text-xs font-extrabold cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                Save Store Profile
              </button>
            </div>

            <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-4 space-y-3">
              <h3 className="font-extrabold text-[15px] text-[#0F172A]">Payment QR Ph / GCash / Maya</h3>
              <input
                type="text"
                value={qrLabel}
                onChange={(e) => setQrLabel(e.target.value)}
                placeholder="Channel Label (e.g. GCash / QR Ph)"
                className="w-full min-h-[40px] px-3 py-2 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
              />
              <input
                type="text"
                value={qrAcct}
                onChange={(e) => setQrAcct(e.target.value)}
                placeholder="Mobile / Account Number"
                className="w-full min-h-[40px] px-3 py-2 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
              />
              <textarea
                rows={3}
                value={qrEmv}
                onChange={(e) => setQrEmv(e.target.value)}
                placeholder="EMVCo Static QR Ph Payload (optional)"
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0] font-mono focus:outline-none focus:border-[#059669]"
              />
              <button
                type="button"
                onClick={() =>
                  updateSettings((s) => ({
                    ...s,
                    qrPayLabel: qrLabel.trim() || null,
                    qrAccountNumber: qrAcct.trim() || null,
                    qrEmvPayload: qrEmv.trim() || null,
                  }))
                }
                className="w-full min-h-[44px] py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-extrabold cursor-pointer transition-colors"
              >
                Save Payment QR
              </button>
            </div>
          </div>

          {/* Right Column: Security Vault, Install, GitHub Updates, Storage Protection */}
          <div className="lg:col-span-5 space-y-4">
            {showAppUpdateControls && (
              <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-extrabold text-[15px] text-[#0F172A]">GitHub Release Sync</h3>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${statusTextClass}`}>
                    <span className={`w-2 h-2 rounded-full ${statusDotClass}`} />
                    <span>{badgeText}</span>
                  </span>
                </div>

                <div className="text-xs font-mono tabular-nums text-[#64748B]">
                  Installed: v{state.installedVersion.versionName} (Build {state.installedVersion.versionCode})
                </div>

                <div className="rounded-xl bg-slate-50 p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#0F172A]">Auto-Update from GitHub</div>
                    <div className="text-[11px] text-[#64748B] leading-snug mt-0.5">
                      {DeviceBridge.isAndroidHost()
                        ? 'Automatically checks GitHub on launch, reconnect & resume, and downloads new APK updates when POS is idle.'
                        : 'Automatically checks GitHub & refreshes mobile/tablet web app updates when POS is idle.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Auto-Update from GitHub"
                    aria-checked={state.settings.autoUpdateEnabled}
                    onClick={() =>
                      updateSettings((s) => ({ ...s, autoUpdateEnabled: !s.autoUpdateEnabled }))
                    }
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                      state.settings.autoUpdateEnabled ? 'bg-[#059669]' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        state.settings.autoUpdateEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <input
                  type="text"
                  value={githubRepoInput}
                  onChange={(e) => setGithubRepoInput(e.target.value)}
                  placeholder="GitHub Repository (owner/repo)"
                  className="w-full min-h-[40px] px-3 py-2 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
                />

                {info && (
                  <div className="space-y-1.5">
                    <p className={`text-xs ${info.status === 'ERROR' ? 'text-[#E11D48]' : 'text-[#0F172A] font-medium'}`}>
                      {info.message}
                    </p>
                    {info.apkFileName && info.isNewer && (
                      <div className="rounded-xl bg-[#ECFDF5] p-2.5 text-[11px] text-[#047857] space-y-1">
                        <div className="font-bold">
                          Package: {info.apkFileName}
                          {info.apkSizeBytes ? ` (${(info.apkSizeBytes / (1024 * 1024)).toFixed(1)} MB)` : ''}
                        </div>
                        {info.releaseNotes && (
                          <p className="text-[11px] text-[#065F46] break-words line-clamp-3">
                            {info.releaseNotes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {state.updateProgress && (
                  <div className="rounded-xl bg-slate-50 p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#0F172A]">
                      <span>{state.updateProgress.message}</span>
                      <span className="font-mono tabular-nums">{state.updateProgress.progress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          state.updateProgress.status === 'ERROR' ? 'bg-[#E11D48]' : 'bg-[#059669]'
                        }`}
                        style={{ width: `${Math.max(4, Math.min(100, state.updateProgress.progress))}%` }}
                      />
                    </div>
                  </div>
                )}

                {state.updateCheckedAt && (
                  <div className="text-[11px] text-[#64748B] tabular-nums">Last checked: {state.updateCheckedAt}</div>
                )}

                {info?.isNewer && safeApkUrl && (
                  DeviceBridge.isAndroidHost() ? (
                    <button
                      type="button"
                      disabled={
                        state.updateProgress?.status === 'DOWNLOADING' ||
                        state.updateProgress?.status === 'VERIFYING'
                      }
                      onClick={installAppUpdate}
                      className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Download size={15} />
                      <span>Download &amp; Install {info.tagName}</span>
                    </button>
                  ) : (
                    <a
                      href={safeApkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-extrabold inline-flex items-center justify-center gap-2"
                    >
                      <Download size={15} />
                      <span>Download Android APK ({info.tagName})</span>
                    </a>
                  )
                )}

                {!DeviceBridge.isAndroidHost() && DeviceBridge.isAppleMobileBrowser() && (
                  <p className="text-[11px] text-[#64748B]">
                    On iPhone/iPad, tap <span className="font-bold text-[#0F172A]">Reload Web App</span> to load the latest web version (APK files are for Android devices).
                  </p>
                )}

                <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-stretch gap-2">
                  <button
                    type="button"
                    disabled={state.updateChecking}
                    onClick={() => void checkForGitHubUpdates(false, githubRepoInput)}
                    className="flex-1 min-h-[42px] py-2.5 px-3 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-50 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={14} className={state.updateChecking ? 'animate-spin' : ''} />
                    <span>{state.updateChecking ? 'Checking...' : 'Check for Updates'}</span>
                  </button>

                  {!DeviceBridge.isAndroidHost() && (
                    <button
                      type="button"
                      onClick={refreshWebApp}
                      className="flex-1 min-h-[42px] py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F172A] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw size={14} />
                      <span>Reload Web App</span>
                    </button>
                  )}

                  {info && (
                    <button
                      type="button"
                      onClick={() => DeviceBridge.openExternalUrl(info.htmlUrl)}
                      className="flex-1 min-h-[42px] py-2.5 px-3 rounded-xl border border-[#E2E8F0] text-center text-xs font-semibold text-[#0F172A] hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ExternalLink size={14} />
                      <span>Open GitHub</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <SettingsSecuritySection />

            {!DeviceBridge.isAndroidHost() && (
              <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-extrabold text-[15px] text-[#0F172A]">Install on Phone / Tablet</h3>
                  <span className="text-[11px] font-bold text-[#047857]">Isolated Terminal</span>
                </div>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Install EternalBlue POS on multiple phones or tablets. Each device creates its own separate offline database ({state.deviceIdentity.shortCode} on this unit) with zero cross-device syncing.
                </p>
                <PWAInstallButton variant="card" />
              </div>
            )}

            <div className="bg-white rounded-[14px] border border-[#E2E8F0] p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 shrink-0 text-[#059669]" size={18} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-extrabold text-[14px] text-[#0F172A]">Local Data Protection</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#64748B]">
                    Ask the browser to protect this device&apos;s POS data from automatic eviction. This does not replace regular backups.
                  </p>
                  <p aria-live="polite" className="mt-1.5 text-[11px] font-semibold text-[#475569]">
                    {storageProtectionText}
                  </p>
                </div>
              </div>
              {storageProtection !== 'unsupported' && storageProtection !== 'protected' && (
                <button
                  type="button"
                  onClick={() => void requestStorageProtection()}
                  disabled={requestingStorageProtection || storageProtection === 'checking'}
                  className="w-full min-h-[42px] rounded-xl border border-[#059669]/30 bg-[#ECFDF5] px-3 py-2 text-xs font-bold text-[#047857] hover:bg-[#D1FAE5] disabled:opacity-60 cursor-pointer"
                >
                  {requestingStorageProtection ? 'Requesting protection...' : 'Request storage protection'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="text-[11px] text-[#64748B] px-1 pb-4 tabular-nums">
          EternalBlue POS v{state.installedVersion.versionName} (Build {state.installedVersion.versionCode}) · Offline Storage Engine
        </div>
      </div>
    </div>
  );
};
