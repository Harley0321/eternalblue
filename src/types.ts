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
  isSeniorPwd?: boolean;
  priceMode?: PriceType;
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
  // PIN & Hardware Security fields (legacy adminPin, PBKDF2-SHA256, or PBKDF2-SHA512)
  adminPin?: string;
  adminPinHash?: string;
  adminPinSalt?: string;
  adminPinIter?: number;
  adminPinAlgo?: 'PBKDF2-SHA256' | 'PBKDF2-SHA512';
  adminPinWeak?: boolean;
  autoLockMinutes?: number;
  lockWholePos?: boolean;
  // Local WebAuthn / FIDO2 Passkey credential (ECDSA P-256 SPKI verified client-side)
  passkeyCredId?: string;
  passkeyPubKeySpki?: string;
  passkeyLabel?: string;
  passkeyRegisteredAt?: string;
  [key: string]: unknown;
}

export type SecuritySeverity = 'info' | 'warning' | 'critical';

export type SecurityEventType =
  | 'PIN_SET'
  | 'PIN_UPGRADED'
  | 'PIN_FAIL'
  | 'PIN_LOCKOUT'
  | 'SETTINGS_UNLOCK'
  | 'SETTINGS_LOCK'
  | 'POS_LOCK'
  | 'POS_UNLOCK'
  | 'PASSKEY_ENROLLED'
  | 'PASSKEY_UNLOCK'
  | 'PASSKEY_REMOVED'
  | 'SALE_VOIDED'
  | 'BACKUP_EXPORTED'
  | 'BACKUP_ENCRYPTED_EXPORTED'
  | 'BACKUP_RESTORED'
  | 'DATA_CLEARED'
  | 'FACTORY_RESET'
  | 'TAMPER_ALERT';

export interface SecurityLogEntry {
  id: string;
  seq: number;
  timestamp: string;
  event: SecurityEventType;
  severity: SecuritySeverity;
  summary: string;
  prevHash: string;
  entryHash: string;
  hmacSig?: string;
}

export interface EncryptedVaultEnvelope {
  app: 'omnimart-ph-pos';
  format: 'omnimart-aes256gcm-v2';
  kdf: 'PBKDF2-SHA512+HKDF-SHA256';
  iterations: number;
  salt: string;
  hkdfSalt: string;
  iv: string;
  ciphertext: string;
  exportedAt: string;
  summary: {
    products: number;
    sales: number;
    heldOrders: number;
  };
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

