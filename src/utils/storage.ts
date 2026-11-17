import type { ConfigSnapshot, HeldOrder, Product, SaleRecord, StockLogEntry, StoreSettings } from '../types';
import { buildDefaultCatalog, DEFAULT_SETTINGS, STORAGE_KEYS } from './posMath';

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export function loadProductsFromStorage(): { products: Product[]; seeded: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
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
      const parsed = JSON.parse(raw);
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
      const parsed = JSON.parse(raw);
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

export function loadSettingsFromStorage(): StoreSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
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
      const parsed = JSON.parse(raw);
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
      const parsed = JSON.parse(raw);
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
      const parsed = JSON.parse(raw);
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

