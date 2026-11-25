import { PosMath } from '../domain/posMath';
import { isSafeHttpUrl } from '../domain/posValidation';

export interface NativeUpdateManifest {
  versionCode?: number;
  versionName?: string;
  tagName?: string;
  apkUrl?: string;
  sha256?: string;
  releaseUrl?: string;
}

export interface AndroidPosBridgeApi {
  isAndroidHost?: () => boolean;
  getInstalledVersionInfo?: () => string;
  requestCameraPermission?: (callbackId: string) => void;
  fetchUpdateManifestNative?: (repoSlug: string, callbackId: string) => void;
  downloadAndInstallApk?: (
    apkUrl: string,
    fileName: string,
    expectedSha256: string,
    manifestUrl: string
  ) => void;
  openExternal?: (url: string) => void;
  saveAndShareFile?: (fileName: string, content: string, mimeType: string) => void;
}

export interface UpdateProgressEvent {
  status: 'DOWNLOADING' | 'VERIFYING' | 'PERMISSION_NEEDED' | 'READY' | 'ERROR';
  progress: number;
  message: string;
}

declare global {
  interface Window {
    AndroidPosBridge?: AndroidPosBridgeApi;
    __onAndroidUpdateProgress?: (event: UpdateProgressEvent) => void;
    __onAndroidManifestResult?: (callbackId: string, jsonStr: string | null, errorMsg: string | null) => void;
    __onAndroidCameraPermissionResult?: (callbackId: string, granted: boolean) => void;
  }
}

const pendingManifestCallbacks = new Map<
  string,
  { resolve: (val: NativeUpdateManifest | null) => void }
>();

const pendingCameraPermissionCallbacks = new Map<
  string,
  { resolve: (granted: boolean) => void }
>();

if (typeof window !== 'undefined') {
  window.__onAndroidManifestResult = (callbackId, jsonStr) => {
    const pending = pendingManifestCallbacks.get(callbackId);
    if (!pending) return;
    pendingManifestCallbacks.delete(callbackId);
    if (!jsonStr) {
      pending.resolve(null);
      return;
    }
    try {
      pending.resolve(JSON.parse(jsonStr) as NativeUpdateManifest);
    } catch {
      pending.resolve(null);
    }
  };

  window.__onAndroidCameraPermissionResult = (callbackId, granted) => {
    const pending = pendingCameraPermissionCallbacks.get(callbackId);
    if (!pending) return;
    pendingCameraPermissionCallbacks.delete(callbackId);
    pending.resolve(Boolean(granted));
  };
}

let audioCtx: AudioContext | null = null;

export const DeviceBridge = {
  isAndroidHost(): boolean {
    try {
      return Boolean(window.AndroidPosBridge?.isAndroidHost?.());
    } catch {
      return false;
    }
  },

  ensureAndroidCameraPermission(): Promise<boolean> {
    const fn = window.AndroidPosBridge?.requestCameraPermission;
    if (!fn) return Promise.resolve(true);
    return new Promise((resolve) => {
      const cbId = `cam_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timer = setTimeout(() => {
        if (pendingCameraPermissionCallbacks.has(cbId)) {
          pendingCameraPermissionCallbacks.delete(cbId);
          resolve(false);
        }
      }, 30_000);
      pendingCameraPermissionCallbacks.set(cbId, {
        resolve: (granted) => {
          clearTimeout(timer);
          resolve(granted);
        },
      });
      try {
        fn.call(window.AndroidPosBridge, cbId);
      } catch {
        clearTimeout(timer);
        pendingCameraPermissionCallbacks.delete(cbId);
        resolve(false);
      }
    });
  },

  isAndroidBrowser(): boolean {
    return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  },

  isAppleMobileBrowser(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },

  isMobileOrTablet(): boolean {
    return (
      DeviceBridge.isAndroidHost() ||
      DeviceBridge.isAndroidBrowser() ||
      DeviceBridge.isAppleMobileBrowser()
    );
  },

  isVibrationSupported(): boolean {
    return DeviceBridge.isMobileOrTablet() && typeof navigator.vibrate === 'function';
  },

  getInstalledVersionInfo(): {
    versionName: string;
    versionCode: number;
    certFingerprint?: string;
    packageId?: string;
  } {
    try {
      const raw = window.AndroidPosBridge?.getInstalledVersionInfo?.();
      if (raw) {
        const parsed = JSON.parse(raw) as {
          versionName?: string;
          versionCode?: number;
          certFingerprint?: string;
          packageId?: string;
        };
        return {
          versionName: parsed.versionName || PosMath.APP_VERSION,
          versionCode: Number(parsed.versionCode) || PosMath.BUILD_CODE,
          certFingerprint: parsed.certFingerprint,
          packageId: parsed.packageId,
        };
      }
    } catch {
      // fall back to static app version
    }
    return {
      versionName: PosMath.APP_VERSION,
      versionCode: PosMath.BUILD_CODE,
    };
  },

  fetchUpdateManifestNative(repoSlug: string): Promise<NativeUpdateManifest | null> {
    const fn = window.AndroidPosBridge?.fetchUpdateManifestNative;
    if (!fn) return Promise.resolve(null);
    return new Promise((resolve) => {
      const cbId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timer = setTimeout(() => {
        if (pendingManifestCallbacks.has(cbId)) {
          pendingManifestCallbacks.delete(cbId);
          resolve(null);
        }
      }, 12_000);
      pendingManifestCallbacks.set(cbId, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
      });
      try {
        fn.call(window.AndroidPosBridge, repoSlug, cbId);
      } catch {
        clearTimeout(timer);
        pendingManifestCallbacks.delete(cbId);
        resolve(null);
      }
    });
  },

  downloadAndInstallAndroidApk(
    apkUrl: string,
    fileName: string,
    expectedSha256?: string | null,
    manifestUrl?: string | null
  ): boolean {
    if (window.AndroidPosBridge?.downloadAndInstallApk) {
      window.AndroidPosBridge.downloadAndInstallApk(
        apkUrl,
        fileName,
        expectedSha256 ?? '',
        manifestUrl ?? ''
      );
      return true;
    }
    return false;
  },

  openExternalUrl(url: string): void {
    if (!isSafeHttpUrl(url)) return;
    if (window.AndroidPosBridge?.openExternal) {
      window.AndroidPosBridge.openExternal(url);
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  triggerRemoteDownload(url: string, fileName?: string): void {
    if (!isSafeHttpUrl(url)) return;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    if (fileName) a.download = fileName;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  async refreshWebApp(): Promise<void> {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
      }
      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((k) => window.caches.delete(k).catch(() => false)));
      }
    } catch {
      // continue to reload
    }
    const url = new URL(window.location.href);
    url.searchParams.set('refresh', String(Date.now()));
    window.location.replace(url.toString());
  },

  playBeep(): void {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') {
        void audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.11);
    } catch {
      // ignore audio errors
    }
  },

  vibrateOnScan(): void {
    if (!DeviceBridge.isVibrationSupported()) return;
    navigator.vibrate(45);
  },

  async copyText(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fallback below
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  },

  downloadTextFile(fileName: string, content: string, mimeType = 'text/plain'): void {
    if (window.AndroidPosBridge?.saveAndShareFile) {
      window.AndroidPosBridge.saveAndShareFile(fileName, content, mimeType);
      return;
    }
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async shareOrDownloadTextFile(fileName: string, content: string, mimeType = 'text/plain'): Promise<void> {
    if (window.AndroidPosBridge?.saveAndShareFile) {
      window.AndroidPosBridge.saveAndShareFile(fileName, content, mimeType);
      return;
    }
    try {
      if (navigator.share) {
        const file = new File([content], fileName, { type: mimeType });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: fileName });
          return;
        }
      }
    } catch {
      // user cancelled or unsupported -> fall back to download
    }
    DeviceBridge.downloadTextFile(fileName, content, mimeType);
  },
};
