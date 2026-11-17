export type PriceType = 'retail' | 'wholesale';
export type PaymentMethod = 'Cash' | 'GCash' | 'Card' | 'Split';
export type TabName = 'pos' | 'inventory' | 'sales' | 'settings';
export type ScannerMode = 'pos' | 'inventory' | 'product-form';

export interface Product {
  id: string;
  barcode: string;
  name: string;
  category: string;
  unit: string;
  capital?: number;
  retailPrice: number;
  wholesalePrice: number;
  wholesaleMinQty: number;
  stock: number;
  expiry?: string;
  scEligible?: boolean;
}

export interface CartLine {
  productId: string;
  name: string;
  unit: string;
  retailPrice: number;
  wholesalePrice: number;
  wholesaleMinQty: number;
  priceType: PriceType;
  qty: number;
}

export interface SaleItem {
  productId?: string;
  category?: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  priceType: PriceType;
  capital?: number;
  lineTotal: number;
}

export interface SaleRecord {
  receiptNo: string;
  dateIso: string;
  dateFormatted: string;
  items: SaleItem[];
  retailSubtotal: number;
  wholesaleSavings: number;
  seniorDiscount: number;
  grandTotal: number;
  paymentMethod: string;
  tendered: number;
  change: number;
  refNo?: string;
  splitDetails?: {
    cash: number;
    digital: number;
    digitalMethod: 'GCash' | 'Card';
  };
  seniorId?: string;
  seniorBase?: number;
  seniorCapped?: boolean;
  voided?: boolean;
  voidedAt?: string;
  voidReason?: string;
}

export interface HeldOrder {
  id: string;
  label?: string;
  time: string;
  items: CartLine[];
  total: number;
}

export interface StoreSettings {
  storeName: string;
  storeAddress: string;
  storeTin: string;
  zCount: number;
  storePhone: string;
  receiptFooter: string;
  lowStockThreshold: number;
  expiryWarnDays: number;
  reorderLeadDays: number;
  reorderSafetyDays: number;
  beep: boolean;
  vibrate: boolean;
  lastBackup: string;
  scDiscountCap: number;
  receiptWidth?: '80mm' | '58mm';
  // PIN fields (legacy adminPin or salted PBKDF2 fields)
  adminPin?: string;
  adminPinHash?: string;
  adminPinSalt?: string;
  adminPinIter?: number;
  adminPinWeak?: boolean;
  [key: string]: unknown;
}

export interface StockLogEntry {
  id: string;
  dateIso: string;
  productId: string;
  productName: string;
  delta: number;
  prevStock: number;
  newStock: number;
  reason: 'Restock' | 'Spoilage / Expired' | 'Damage' | 'Count Correction' | 'Other';
  note?: string;
}

export interface CartTotals {
  retailSubtotal: number;
  wholesaleSavings: number;
  seniorDiscount: number;
  grandTotal: number;
  isSeniorPwd: boolean;
  seniorBase: number;
  seniorCapped: boolean;
  seniorCap: number;
  scKinds: number;
  scOtherLines: number;
}

export interface ConfigSnapshot {
  id: string;
  version: string;
  createdAt: string;
  label: string;
  source: 'baseline' | 'auto' | 'manual' | 'rollback';
  changedFields: string[];
  config: {
    storeName: string;
    storeAddress: string;
    storeTin: string;
    storePhone: string;
    receiptFooter: string;
    lowStockThreshold: number;
    expiryWarnDays: number;
    reorderLeadDays: number;
    reorderSafetyDays: number;
    beep: boolean;
    vibrate: boolean;
    scDiscountCap: number;
    receiptWidth: '80mm' | '58mm';
  };
}

