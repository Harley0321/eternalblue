import type {
  ConfigSnapshot,
  HeldOrder,
  Product,
  SaleRecord,
  SecurityLogEntry,
  StockLogEntry,
  StoreSettings,
} from '../types';
import {
  buildDefaultCatalog,
  DEFAULT_SETTINGS,
  safeJsonParse,
  STORAGE_KEYS,
} from './posMath';

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export function loadProductsFromStorage(): { products: Product[]; seeded: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (raw !== null) {
      const parsed = safeJsonParse<unknown>(raw);
      if (Array.isArray(parsed)) {
        return { products: parsed as Product[], seeded: false };
      }
    }
  } catch {
    // fallback below without overwriting raw data unless missing
  }
  const catalog = buildDefaultCatalog();
  saveProductsToStorage(catalog);
  return { products: catalog, seeded: true };
}

export function saveProductsToStorage(products: Product[]): SaveResult {
  try {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function loadSalesFromStorage(): SaleRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SALES);
    if (raw) {
      const parsed = safeJsonParse<unknown>(raw);
      if (Array.isArray(parsed)) return parsed as SaleRecord[];
    }
  } catch {
    // ignore corrupt read
  }
  return [];
}

export function saveSalesToStorage(sales: SaleRecord[]): SaveResult {
  try {
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function loadHeldFromStorage(): HeldOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HELD);
    if (raw) {
      const parsed = safeJsonParse<unknown>(raw);
      if (Array.isArray(parsed)) return parsed as HeldOrder[];
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveHeldToStorage(heldOrders: HeldOrder[]): SaveResult {
  try {
    localStorage.setItem(STORAGE_KEYS.HELD, JSON.stringify(heldOrders));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

const LEGACY_SYNC_LOCAL_KEYS = [
  'omnimart_ph_sync_tombstones_v1',
  'omnimart_ph_device_sync_id_v1',
];

const LEGACY_SYNC_SETTING_FIELDS = [
  'syncEnabled',
  'syncStoreId',
  'syncStoreIdCustomized',
  'lastSyncedAt',
];

export function loadSettingsFromStorage(): StoreSettings {
  try {
    for (const legacyKey of LEGACY_SYNC_LOCAL_KEYS) {
      localStorage.removeItem(legacyKey);
    }
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) {
      const parsed = safeJsonParse<unknown>(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const record = { ...(parsed as Record<string, unknown>) };
        let hadLegacySyncFields = false;
        for (const field of LEGACY_SYNC_SETTING_FIELDS) {
          if (field in record) {
            delete record[field];
            hadLegacySyncFields = true;
          }
        }
        const merged: StoreSettings = { ...DEFAULT_SETTINGS, ...(record as Partial<StoreSettings>) };
        if (hadLegacySyncFields) {
          saveSettingsToStorage(merged);
        }
        return merged;
      }
    }
  } catch {
    // ignore
  }
  const initial: StoreSettings = { ...DEFAULT_SETTINGS };
  saveSettingsToStorage(initial);
  return initial;
}

export function saveSettingsToStorage(settings: StoreSettings): SaveResult {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function loadScanPrefs(): { continuous: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SCANPREFS);
    if (raw) {
      const parsed = safeJsonParse<{ continuous?: boolean }>(raw);
      if (typeof parsed?.continuous === 'boolean') return { continuous: parsed.continuous };
    }
  } catch {
    // ignore
  }
  return { continuous: true };
}

export function saveScanPrefs(continuous: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SCANPREFS, JSON.stringify({ continuous }));
  } catch {
    // ignore
  }
}

export function loadStockLogFromStorage(): StockLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STOCKLOG);
    if (raw) {
      const parsed = safeJsonParse<unknown>(raw);
      if (Array.isArray(parsed)) return parsed as StockLogEntry[];
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveStockLogToStorage(logs: StockLogEntry[]): void {
  try {
    // Cap at 500 recent movements so localStorage quota is never burdened
    localStorage.setItem(STORAGE_KEYS.STOCKLOG, JSON.stringify(logs.slice(0, 500)));
  } catch {
    // ignore
  }
}

export function loadConfigHistoryFromStorage(): ConfigSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG_HISTORY);
    if (raw) {
      const parsed = safeJsonParse<unknown>(raw);
      if (Array.isArray(parsed)) return parsed as ConfigSnapshot[];
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveConfigHistoryToStorage(history: ConfigSnapshot[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CONFIG_HISTORY, JSON.stringify(history.slice(0, 30)));
  } catch {
    // ignore
  }
}

export function loadSecurityLogFromStorage(): SecurityLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SECURITY_LOG);
    if (raw) {
      const parsed = safeJsonParse<unknown>(raw);
      if (Array.isArray(parsed)) return parsed as SecurityLogEntry[];
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveSecurityLogToStorage(entries: SecurityLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SECURITY_LOG, JSON.stringify(entries.slice(0, 250)));
  } catch {
    // ignore
  }
}

export function getUsedStorageBytes(): number {
  let bytes = 0;
  try {
    for (const k of Object.values(STORAGE_KEYS)) {
      const v = localStorage.getItem(k);
      if (v) bytes += v.length * 2;
    }
  } catch {
    // ignore
  }
  return bytes;
}

export interface StorageBreakdownItem {
  key: string;
  label: string;
  bytes: number;
  pct: number;
}

const STORAGE_LABELS: Record<string, string> = {
  [STORAGE_KEYS.PRODUCTS]: 'Products Catalog',
  [STORAGE_KEYS.SALES]: 'Sales & Receipts',
  [STORAGE_KEYS.HELD]: 'Parked Orders',
  [STORAGE_KEYS.SETTINGS]: 'Store Settings',
  [STORAGE_KEYS.STOCKLOG]: 'Stock Audit Log',
  [STORAGE_KEYS.SECURITY_LOG]: 'Security Ledger',
  [STORAGE_KEYS.CONFIG_HISTORY]: 'Config History',
  [STORAGE_KEYS.SCANPREFS]: 'Scanner Prefs',
  [STORAGE_KEYS.PINLOCK]: 'PIN Lockout State',
};

export function getStorageBreakdown(): { totalBytes: number; items: StorageBreakdownItem[] } {
  const rawItems: { key: string; label: string; bytes: number }[] = [];
  let totalBytes = 0;

  try {
    for (const k of Object.values(STORAGE_KEYS)) {
      const v = localStorage.getItem(k);
      const bytes = v ? v.length * 2 : 0;
      totalBytes += bytes;
      if (bytes > 0) {
        rawItems.push({
          key: k,
          label: STORAGE_LABELS[k] || k,
          bytes,
        });
      }
    }
  } catch {
    // ignore storage access issues
  }

  rawItems.sort((a, b) => b.bytes - a.bytes);
  const denom = totalBytes > 0 ? totalBytes : 1;

  return {
    totalBytes,
    items: rawItems.map((it) => ({
      ...it,
      pct: Math.round((it.bytes / denom) * 100),
    })),
  };
}


