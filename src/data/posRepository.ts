import { loadOrCreateDeviceIdentity } from '../domain/deviceIdentity';
import {
  DEFAULT_STORE_SETTINGS,
  type ActiveCartSnapshot,
  type ActiveShiftState,
  type CashDrawerEvent,
  type CashierAccount,
  type DeviceIdentityInfo,
  type DigitalServiceEntry,
  type HeldOrder,
  type Product,
  type RepackLogEntry,
  type RepackRule,
  type SaleRecord,
  type SecurityLogEntry,
  type StockLogEntry,
  type StoreSettings,
  type SukiCustomer,
  type UtangTransaction,
} from '../types/pos';

const STORAGE_PREFIX = 'ebpos_v1:';
const IDENTITY_KEY = 'eternalblue_store_identity:pinned_store_name';

function dbGetString(key: string): string | null {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    return null;
  }
}

function dbPutString(key: string, value: string): void {
  try {
    const fullKey = `${STORAGE_PREFIX}${key}`;
    const existing = localStorage.getItem(fullKey);
    if (existing !== null && !key.endsWith('__prev') && !key.endsWith('__corrupt_backup')) {
      localStorage.setItem(`${fullKey}__prev`, existing);
    }
    localStorage.setItem(fullKey, value);
  } catch {
    // Storage quota or restricted mode
  }
}

function loadListResilient<T>(key: string, seedProvider?: () => T[]): T[] {
  const raw = dbGetString(key);
  if (!raw || !raw.trim()) {
    const prevRaw = dbGetString(`${key}__prev`);
    if (prevRaw && prevRaw.trim()) {
      try {
        const parsed = JSON.parse(prevRaw);
        if (Array.isArray(parsed)) return parsed as T[];
      } catch {
        // ignore
      }
    }
    if (seedProvider) {
      const seed = seedProvider();
      dbPutString(key, JSON.stringify(seed));
      return seed;
    }
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as T[];
  } catch {
    dbPutString(`${key}__corrupt_backup`, raw);
  }

  const prevRaw = dbGetString(`${key}__prev`);
  if (prevRaw && prevRaw.trim()) {
    try {
      const parsed = JSON.parse(prevRaw);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      // ignore
    }
  }

  return seedProvider ? seedProvider() : [];
}

export const PosRepository = {
  loadDeviceIdentity: (): DeviceIdentityInfo => loadOrCreateDeviceIdentity(),

  loadProducts: (): Product[] => loadListResilient('products'),
  saveProducts: (list: Product[]) => dbPutString('products', JSON.stringify(list)),

  loadSales: (): SaleRecord[] => loadListResilient('sales'),
  saveSales: (list: SaleRecord[]) => dbPutString('sales', JSON.stringify(list)),

  loadHeldOrders: (): HeldOrder[] => loadListResilient('held'),
  saveHeldOrders: (list: HeldOrder[]) => dbPutString('held', JSON.stringify(list)),

  loadActiveCart(): ActiveCartSnapshot {
    const raw = dbGetString('active_cart') ?? dbGetString('active_cart__prev');
    if (!raw) return { cart: [], priceMode: 'retail', isSeniorPwd: false, seniorId: '' };
    try {
      const parsed = JSON.parse(raw) as Partial<ActiveCartSnapshot>;
      return {
        cart: Array.isArray(parsed.cart) ? parsed.cart : [],
        priceMode: parsed.priceMode === 'wholesale' ? 'wholesale' : 'retail',
        isSeniorPwd: Boolean(parsed.isSeniorPwd),
        seniorId: typeof parsed.seniorId === 'string' ? parsed.seniorId : '',
      };
    } catch {
      return { cart: [], priceMode: 'retail', isSeniorPwd: false, seniorId: '' };
    }
  },
  saveActiveCart: (snapshot: ActiveCartSnapshot) => dbPutString('active_cart', JSON.stringify(snapshot)),

  loadPinnedStoreName(): string | null {
    try {
      const v = localStorage.getItem(IDENTITY_KEY)?.trim();
      return v && v.length > 0 ? v : null;
    } catch {
      return null;
    }
  },
  savePinnedStoreName(name: string) {
    const clean = name.trim();
    if (clean.length > 0) {
      try {
        localStorage.setItem(IDENTITY_KEY, clean);
      } catch {
        // ignore
      }
    }
  },

  loadSettings(): StoreSettings {
    const pinned = PosRepository.loadPinnedStoreName();
    const raw = dbGetString('settings') ?? dbGetString('settings__prev');
    if (raw) {
      try {
        const decoded = JSON.parse(raw) as Partial<StoreSettings>;
        const merged = { ...DEFAULT_STORE_SETTINGS, ...decoded };
        const safeName = merged.storeName.trim() || pinned || 'EternalBlue Mart';
        if (!pinned && safeName !== 'EternalBlue Mart') PosRepository.savePinnedStoreName(safeName);
        return safeName !== merged.storeName ? { ...merged, storeName: safeName } : merged;
      } catch {
        // fallback
      }
    }
    return pinned ? { ...DEFAULT_STORE_SETTINGS, storeName: pinned } : { ...DEFAULT_STORE_SETTINGS };
  },
  saveSettings(s: StoreSettings) {
    const safeName = s.storeName.trim() || PosRepository.loadPinnedStoreName() || 'EternalBlue Mart';
    const normalized = safeName !== s.storeName ? { ...s, storeName: safeName } : s;
    PosRepository.savePinnedStoreName(safeName);
    dbPutString('settings', JSON.stringify(normalized));
  },

  loadSukiCustomers: (): SukiCustomer[] => loadListResilient('suki'),
  saveSukiCustomers: (list: SukiCustomer[]) => dbPutString('suki', JSON.stringify(list)),

  loadUtangTx: (): UtangTransaction[] => loadListResilient('utang_tx'),
  saveUtangTx: (list: UtangTransaction[]) => dbPutString('utang_tx', JSON.stringify(list)),

  loadRepackRules: (): RepackRule[] => loadListResilient('repack_rules'),
  saveRepackRules: (list: RepackRule[]) => dbPutString('repack_rules', JSON.stringify(list)),

  loadRepackLog: (): RepackLogEntry[] => loadListResilient('repack_log'),
  saveRepackLog: (list: RepackLogEntry[]) => dbPutString('repack_log', JSON.stringify(list)),

  loadDrawerEvents: (): CashDrawerEvent[] => loadListResilient('drawer_events'),
  saveDrawerEvents: (list: CashDrawerEvent[]) => dbPutString('drawer_events', JSON.stringify(list)),

  loadDigitalServices: (): DigitalServiceEntry[] => loadListResilient('digital_services'),
  saveDigitalServices: (list: DigitalServiceEntry[]) => dbPutString('digital_services', JSON.stringify(list)),

  loadCashiers: (): CashierAccount[] => loadListResilient('cashiers'),
  saveCashiers: (list: CashierAccount[]) => dbPutString('cashiers', JSON.stringify(list)),

  loadActiveShift(): ActiveShiftState | null {
    const raw = (dbGetString('active_shift') ?? dbGetString('active_shift__prev'))?.trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ActiveShiftState;
    } catch {
      return null;
    }
  },
  saveActiveShift(shift: ActiveShiftState | null) {
    dbPutString('active_shift', shift ? JSON.stringify(shift) : '');
  },

  loadStockLog: (): StockLogEntry[] => loadListResilient('stock_log'),
  saveStockLog: (list: StockLogEntry[]) => dbPutString('stock_log', JSON.stringify(list)),

  loadSecurityLog: (): SecurityLogEntry[] => loadListResilient('security_log'),
  saveSecurityLog: (list: SecurityLogEntry[]) => dbPutString('security_log', JSON.stringify(list)),

  loadPinLockState(): [number, number] {
    const raw = dbGetString('pin_lock_state');
    if (!raw) return [0, 0];
    const [fStr, uStr] = raw.split('|');
    const fails = Math.max(0, parseInt(fStr ?? '0', 10) || 0);
    const until = Math.max(0, parseInt(uStr ?? '0', 10) || 0);
    return [fails, until];
  },
  savePinLockState(fails: number, untilMs: number) {
    dbPutString('pin_lock_state', `${fails}|${untilMs}`);
  },

  resetAll() {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  },
};
