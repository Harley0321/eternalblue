import { PosMath } from '../domain/posMath';

export interface AndroidPosBridgeApi {
  isAndroidHost?: () => boolean;
  getInstalledVersionInfo?: () => string;
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
  }
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

  isAndroidBrowser(): boolean {
    return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  },

  getInstalledVersionInfo(): { versionName: string; versionCode: number } {
    try {
      const raw = window.AndroidPosBridge?.getInstalledVersionInfo?.();
      if (raw) {
        const parsed = JSON.parse(raw) as { versionName?: string; versionCode?: number };
        return {
          versionName: parsed.versionName || PosMath.APP_VERSION,
          versionCode: Number(parsed.versionCode) || PosMath.BUILD_CODE,
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
    const a = document.createElement('a');
    a.href = url;
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
