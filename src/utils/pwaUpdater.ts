import { registerSW } from 'virtual:pwa-register';
import {
  shouldAutoApplyAppUpdate,
  shouldCheckForSwUpdate,
  SW_PERIODIC_CHECK_MS,
  type AutoUpdateGateInput,
} from './pwaUpdateRules';

export { shouldAutoApplyAppUpdate, shouldCheckForSwUpdate, type AutoUpdateGateInput };

export type PwaUpdateCheckResult = 'updated' | 'up-to-date' | 'unsupported' | 'offline';

let activeReg: ServiceWorkerRegistration | null = null;
let lastCheckAt = 0;

export async function checkForPwaUpdateNow(force = true): Promise<PwaUpdateCheckResult> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  if (typeof navigator.onLine === 'boolean' && !navigator.onLine) {
    return 'offline';
  }
  const now = Date.now();
  if (!force && !shouldCheckForSwUpdate(lastCheckAt, now)) {
    return 'up-to-date';
  }
  lastCheckAt = now;
  try {
    const reg = activeReg || (await navigator.serviceWorker.getRegistration());
    if (!reg) return 'up-to-date';
    activeReg = reg;
    await reg.update();
    return reg.installing || reg.waiting ? 'updated' : 'up-to-date';
  } catch {
    return 'offline';
  }
}

export interface PwaAutoUpdaterCallbacks {
  onUpdateActivated: () => void;
  onOfflineReady?: () => void;
}

/**
 * Registers the VitePWA service worker and checks for new Cloudflare/GitHub builds
 * on launch, tab resume (visibilitychange), reconnect (online), and periodically.
 * Never touches localStorage or IndexedDB user data.
 */
export function initPwaAutoUpdater(callbacks: PwaAutoUpdaterCallbacks): () => void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }

  const hadControllerAtBoot = Boolean(navigator.serviceWorker.controller);
  let signaled = false;

  const notifyActivated = () => {
    if (signaled) return;
    signaled = true;
    callbacks.onUpdateActivated();
  };

  const onControllerChange = () => {
    if (hadControllerAtBoot) {
      notifyActivated();
    }
  };
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

  const updateSw = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      activeReg = registration;
      if (navigator.onLine) {
        void checkForPwaUpdateNow(true);
      }
    },
    onNeedRefresh() {
      void updateSw(true).catch(() => {});
      notifyActivated();
    },
    onOfflineReady() {
      callbacks.onOfflineReady?.();
    },
  });

  const handleResumeOrOnline = () => {
    if (document.visibilityState === 'hidden') return;
    if (typeof navigator.onLine === 'boolean' && !navigator.onLine) return;
    void checkForPwaUpdateNow(false);
  };

  window.addEventListener('online', handleResumeOrOnline);
  window.addEventListener('focus', handleResumeOrOnline);
  document.addEventListener('visibilitychange', handleResumeOrOnline);

  const intervalId = window.setInterval(() => {
    if (typeof navigator.onLine === 'boolean' && navigator.onLine) {
      void checkForPwaUpdateNow(false);
    }
  }, SW_PERIODIC_CHECK_MS);

  return () => {
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    window.removeEventListener('online', handleResumeOrOnline);
    window.removeEventListener('focus', handleResumeOrOnline);
    document.removeEventListener('visibilitychange', handleResumeOrOnline);
    window.clearInterval(intervalId);
  };
}
