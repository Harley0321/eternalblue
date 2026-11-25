type ApplyUpdate = () => Promise<void>;
type UpdateListener = (available: boolean) => void;
type AutoCheckGuard = () => boolean;

let applyUpdate: ApplyUpdate | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;
let autoCheckGuard: AutoCheckGuard = () => true;
let inFlightCheck: Promise<void> | null = null;
let lastSwCheckAtMs = 0;
const listeners = new Set<UpdateListener>();

const MIN_SW_CHECK_INTERVAL_MS = 60_000;

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(applyUpdate !== null);
  }
}

export const PwaUpdateManager = {
  subscribe(listener: UpdateListener): () => void {
    listeners.add(listener);
    listener(applyUpdate !== null);
    return () => listeners.delete(listener);
  },

  notifyAvailable(callback: ApplyUpdate): void {
    applyUpdate = callback;
    notifyListeners();
  },

  setRegistration(registration: ServiceWorkerRegistration | undefined | null): void {
    swRegistration = registration ?? null;
  },

  setAutoCheckGuard(guard: AutoCheckGuard): void {
    autoCheckGuard = guard;
  },

  shouldAutoCheck(): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    if (typeof document !== 'undefined' && document.hidden) return false;
    try {
      return autoCheckGuard();
    } catch {
      return false;
    }
  },

  async checkForSwUpdate(force = false): Promise<void> {
    if (!swRegistration) return;
    if (!force && !PwaUpdateManager.shouldAutoCheck()) return;
    const now = Date.now();
    if (!force && lastSwCheckAtMs > 0 && now - lastSwCheckAtMs < MIN_SW_CHECK_INTERVAL_MS) {
      return;
    }
    if (inFlightCheck) return inFlightCheck;
    lastSwCheckAtMs = now;
    inFlightCheck = swRegistration
      .update()
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        inFlightCheck = null;
      });
    await inFlightCheck;
  },

  async apply(): Promise<void> {
    if (applyUpdate) await applyUpdate();
  },
};
