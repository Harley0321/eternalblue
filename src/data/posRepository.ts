import { PosMath } from '../domain/posMath';
import {
  DEFAULT_STORE_SETTINGS,
  type ActiveCartSnapshot,
  type ActiveShiftState,
  type CashDrawerEvent,
  type CashierAccount,
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

export function seedProducts(): Product[] {
  const soon = PosMath.addDaysYmd(14);
  const okDate = PosMath.addMonthsYmd(6);
  return [
    { id: 'p-rice-50', barcode: '4800010000011', name: 'Sinandomeng Rice 25kg Sack', category: 'Rice & Staples', unit: 'sack', capital: 1125.0, retailPrice: 1250.0, wholesalePrice: 1210.0, wholesaleMinQty: 3.0, stock: 8.0, lowStockThreshold: 3.0, expiry: okDate, scEligible: true },
    { id: 'p-rice-1', barcode: '4800010000028', name: 'Sinandomeng Rice 1kg Repack', category: 'Rice & Staples', unit: 'kg', capital: 45.0, retailPrice: 54.0, wholesalePrice: 51.0, wholesaleMinQty: 10.0, stock: 42.0, lowStockThreshold: 15.0, expiry: okDate, scEligible: true },
    { id: 'p-corned', barcode: '4800010000035', name: 'Argentina Corned Beef 175g', category: 'Canned & Noodles', unit: 'can', capital: 33.5, retailPrice: 42.0, wholesalePrice: 39.5, wholesaleMinQty: 12.0, stock: 36.0, lowStockThreshold: 12.0, expiry: okDate, scEligible: true },
    { id: 'p-sardines', barcode: '4800010000042', name: '555 Sardines Tomato 155g', category: 'Canned & Noodles', unit: 'can', capital: 21.0, retailPrice: 27.0, wholesalePrice: 25.5, wholesaleMinQty: 12.0, stock: 48.0, lowStockThreshold: 12.0, expiry: okDate, scEligible: true },
    { id: 'p-canton', barcode: '4800010000059', name: 'Lucky Me Pancit Canton Chilimansi', category: 'Canned & Noodles', unit: 'pack', capital: 12.5, retailPrice: 16.0, wholesalePrice: 15.0, wholesaleMinQty: 12.0, stock: 64.0, lowStockThreshold: 20.0, expiry: okDate, scEligible: true },
    { id: 'p-kopiko', barcode: '4800010000066', name: 'Kopiko Black 3-in-1 Twin Pack', category: 'Beverages', unit: 'pack', capital: 11.0, retailPrice: 15.0, wholesalePrice: 13.75, wholesaleMinQty: 10.0, stock: 55.0, lowStockThreshold: 15.0, expiry: okDate, scEligible: true },
    { id: 'p-milo', barcode: '4800010000073', name: 'Milo Active-Go 24g Sachet', category: 'Beverages', unit: 'sachet', capital: 8.5, retailPrice: 12.0, wholesalePrice: 11.0, wholesaleMinQty: 12.0, stock: 72.0, lowStockThreshold: 24.0, expiry: okDate, scEligible: true },
    { id: 'p-oil', barcode: '4800010000080', name: 'Golden Fiesta Palm Oil 1L', category: 'Condiments & Cooking', unit: 'bottle', capital: 92.0, retailPrice: 112.0, wholesalePrice: 106.0, wholesaleMinQty: 6.0, stock: 18.0, lowStockThreshold: 6.0, expiry: okDate, scEligible: true },
    { id: 'p-toyo', barcode: '4800010000097', name: 'Datu Puti Soy Sauce 385ml', category: 'Condiments & Cooking', unit: 'bottle', capital: 23.0, retailPrice: 30.0, wholesalePrice: 28.0, wholesaleMinQty: 12.0, stock: 24.0, lowStockThreshold: 8.0, expiry: okDate, scEligible: true },
    { id: 'p-eggs', barcode: '4800010000103', name: 'Fresh Farm Eggs Medium (Tray 30s)', category: 'Dairy & Bakery', unit: 'tray', capital: 205.0, retailPrice: 240.0, wholesalePrice: 230.0, wholesaleMinQty: 3.0, stock: 6.0, lowStockThreshold: 3.0, expiry: soon, scEligible: true },
    { id: 'p-cola', barcode: '4800010000110', name: 'Coca-Cola Kasalo 1.5L', category: 'Beverages', unit: 'bottle', capital: 58.0, retailPrice: 72.0, wholesalePrice: 67.0, wholesaleMinQty: 12.0, stock: 22.0, lowStockThreshold: 8.0, expiry: okDate, scEligible: false },
    { id: 'p-water', barcode: '4800010000127', name: 'Absolute Mineral Water 500ml', category: 'Beverages', unit: 'bottle', capital: 10.5, retailPrice: 15.0, wholesalePrice: 13.5, wholesaleMinQty: 24.0, stock: 40.0, lowStockThreshold: 12.0, expiry: okDate, scEligible: true },
    { id: 'p-chips', barcode: '4800010000134', name: 'Piattos Cheese 85g', category: 'Snacks & Biscuits', unit: 'pack', capital: 30.0, retailPrice: 39.0, wholesalePrice: 36.5, wholesaleMinQty: 10.0, stock: 9.0, lowStockThreshold: 10.0, expiry: okDate, scEligible: false },
    { id: 'p-soap', barcode: '4800010000141', name: 'Safeguard Pure White 130g', category: 'Personal & Home', unit: 'bar', capital: 42.0, retailPrice: 52.0, wholesalePrice: 49.0, wholesaleMinQty: 12.0, stock: 16.0, lowStockThreshold: 6.0, expiry: okDate, scEligible: true },
    { id: 'p-ariel', barcode: '4800010000158', name: 'Ariel Sunrise Fresh 75g Twin', category: 'Personal & Home', unit: 'sachet', capital: 13.0, retailPrice: 17.0, wholesalePrice: 15.75, wholesaleMinQty: 12.0, stock: 0.0, lowStockThreshold: 12.0, expiry: okDate, scEligible: true },
    { id: 'p-tocino', barcode: '4800010000165', name: 'CDO Funtastyk Young Pork Tocino 450g', category: 'Frozen Meat', unit: 'pack', capital: 118.0, retailPrice: 145.0, wholesalePrice: 138.0, wholesaleMinQty: 5.0, stock: 14.0, lowStockThreshold: 5.0, expiry: soon, scEligible: true },
  ];
}

export function seedSales(): SaleRecord[] {
  const now = Date.now();
  const oneHourAgo = new Date(now - 3600_000).toISOString();
  const yday = new Date(now - PosMath.DAY_MS).toISOString();
  return [
    {
      receiptNo: 'OR-001001',
      dateIso: oneHourAgo,
      dateFormatted: PosMath.formatDateTime(oneHourAgo),
      items: [
        { productId: 'p-rice-1', category: 'Rice & Staples', name: 'Sinandomeng Rice 1kg Repack', qty: 3, unit: 'kg', unitPrice: 54, priceType: 'retail', capital: 45, lineTotal: 162 },
        { productId: 'p-corned', category: 'Canned & Noodles', name: 'Argentina Corned Beef 175g', qty: 2, unit: 'can', unitPrice: 42, priceType: 'retail', capital: 33.5, lineTotal: 84 },
      ],
      retailSubtotal: 246,
      wholesaleSavings: 0,
      seniorDiscount: 0,
      grandTotal: 246,
      paymentMethod: 'Cash',
      tendered: 300,
      change: 54,
      cashierName: 'Ate Maria (Owner)',
    },
    {
      receiptNo: 'OR-001000',
      dateIso: yday,
      dateFormatted: PosMath.formatDateTime(yday),
      items: [
        { productId: 'p-canton', category: 'Canned & Noodles', name: 'Lucky Me Pancit Canton Chilimansi', qty: 6, unit: 'pack', unitPrice: 16, priceType: 'retail', capital: 12.5, lineTotal: 96 },
        { productId: 'p-cola', category: 'Beverages', name: 'Coca-Cola Kasalo 1.5L', qty: 1, unit: 'bottle', unitPrice: 72, priceType: 'retail', capital: 58, lineTotal: 72 },
      ],
      retailSubtotal: 168,
      wholesaleSavings: 0,
      seniorDiscount: 0,
      grandTotal: 168,
      paymentMethod: 'GCash',
      tendered: 168,
      change: 0,
      refNo: 'GC-884120',
      cashierName: 'Juan (Cashier)',
    },
  ];
}

export function seedCustomers(): SukiCustomer[] {
  const now = new Date().toISOString();
  const due = PosMath.addDaysYmd(5);
  return [
    { id: 'suki-1', name: 'Aling Nena Reyes', phone: '0917-555-0142', address: 'Brgy. Poblacion', creditLimit: 2500, balance: 420, dueDate: due, points: 48, totalSpent: 4820, createdAt: now, updatedAt: now },
    { id: 'suki-2', name: 'Mang Tonyo Cruz', phone: '0918-555-0199', address: 'Sitio Mabini', creditLimit: 1500, balance: 0, dueDate: null, points: 115, totalSpent: 7250, createdAt: now, updatedAt: now },
  ];
}

export function seedRepackRules(): RepackRule[] {
  const now = new Date().toISOString();
  return [
    { id: 'rpk-rice', name: '25kg Sack → 25× 1kg Repack', masterProductId: 'p-rice-50', targetProductId: 'p-rice-1', yieldQty: 25, autoComputeCost: true, updatedAt: now },
  ];
}

export const PosRepository = {
  loadProducts: (): Product[] => loadListResilient('products', seedProducts),
  saveProducts: (list: Product[]) => dbPutString('products', JSON.stringify(list)),

  loadSales: (): SaleRecord[] => loadListResilient('sales', seedSales),
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

  loadSukiCustomers: (): SukiCustomer[] => loadListResilient('suki', seedCustomers),
  saveSukiCustomers: (list: SukiCustomer[]) => dbPutString('suki', JSON.stringify(list)),

  loadUtangTx: (): UtangTransaction[] => loadListResilient('utang_tx'),
  saveUtangTx: (list: UtangTransaction[]) => dbPutString('utang_tx', JSON.stringify(list)),

  loadRepackRules: (): RepackRule[] => loadListResilient('repack_rules', seedRepackRules),
  saveRepackRules: (list: RepackRule[]) => dbPutString('repack_rules', JSON.stringify(list)),

  loadRepackLog: (): RepackLogEntry[] => loadListResilient('repack_log'),
  saveRepackLog: (list: RepackLogEntry[]) => dbPutString('repack_log', JSON.stringify(list)),

  loadDrawerEvents: (): CashDrawerEvent[] => loadListResilient('drawer_events'),
  saveDrawerEvents: (list: CashDrawerEvent[]) => dbPutString('drawer_events', JSON.stringify(list)),

  loadDigitalServices: (): DigitalServiceEntry[] => loadListResilient('digital_services'),
  saveDigitalServices: (list: DigitalServiceEntry[]) => dbPutString('digital_services', JSON.stringify(list)),

  loadCashiers: (): CashierAccount[] =>
    loadListResilient('cashiers', () => {
      const now = new Date().toISOString();
      return [
        { id: 'cashier-owner', name: 'Ate Maria (Owner)', role: 'manager', active: true, createdAt: now },
        { id: 'cashier-shift1', name: 'Juan (Cashier)', role: 'cashier', active: true, createdAt: now },
      ];
    }),
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
