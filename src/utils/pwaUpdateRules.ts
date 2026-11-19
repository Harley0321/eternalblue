export interface AutoUpdateGateInput {
  updateReady: boolean;
  cartCount: number;
  hasBlockingUi: boolean;
}

export const SW_UPDATE_MIN_GAP_MS = 15_000;
export const SW_PERIODIC_CHECK_MS = 15 * 60 * 1000;

/**
 * Legacy cross-device sync keys and settings permanently retired to guarantee
 * PC, mobile, and tablet devices stay 100% isolated per account/device.
 */
export const LEGACY_SYNC_LOCAL_KEYS = [
  'omnimart_ph_sync_tombstones_v1',
  'omnimart_ph_device_sync_id_v1',
] as const;

export const LEGACY_SYNC_SETTING_FIELDS = [
  'syncEnabled',
  'syncStoreId',
  'syncStoreIdCustomized',
  'lastSyncedAt',
] as const;

/**
 * Prevents redundant service worker update checks when mobile/tablet tabs regain focus rapidly.
 */
export function shouldCheckForSwUpdate(
  lastCheckMs: number,
  nowMs: number,
  minIntervalMs = SW_UPDATE_MIN_GAP_MS,
): boolean {
  if (!Number.isFinite(nowMs)) return false;
  if (!Number.isFinite(lastCheckMs) || lastCheckMs <= 0) return true;
  return nowMs - lastCheckMs >= minIntervalMs;
}

/**
 * Only reload the running PWA shell when a new SW update has activated AND
 * the cashier has no active basket items or open modals — preserving all in-progress work
 * and never touching localStorage/IndexedDB device records.
 */
export function shouldAutoApplyAppUpdate(input: AutoUpdateGateInput): boolean {
  return Boolean(input.updateReady) && input.cartCount <= 0 && !input.hasBlockingUi;
}

/**
 * Strips any legacy cross-device sync fields from raw settings or imported backups
 * without altering user products, sales, held orders, or store preferences.
 */
export function stripLegacySyncFields<T extends Record<string, unknown>>(
  raw: T,
): { sanitized: T; strippedCount: number } {
  const copy: Record<string, unknown> = { ...raw };
  let strippedCount = 0;
  for (const field of LEGACY_SYNC_SETTING_FIELDS) {
    if (field in copy) {
      delete copy[field];
      strippedCount++;
    }
  }
  return { sanitized: copy as T, strippedCount };
}
