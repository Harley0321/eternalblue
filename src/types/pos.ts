export type PriceType = 'retail' | 'wholesale';

export type TabName = 'POS' | 'INVENTORY' | 'OPERATIONS' | 'SALES' | 'SETTINGS';

export const TAB_LABELS: Record<TabName, string> = {
  POS: 'POS',
  INVENTORY: 'Stock',
  OPERATIONS: 'Ops & Suki',
  SALES: 'Sales',
  SETTINGS: 'Settings',
};

export type OperationsSubTab = 'UTANG' | 'REPACK' | 'SHIFT' | 'SERVICES' | 'PRINTING';

export const OPS_SUBTAB_LABELS: Record<OperationsSubTab, string> = {
  UTANG: 'Utang & Suki',
  REPACK: 'Tingi / Repack',
  SHIFT: 'Shift & Gastos',
  SERVICES: 'GCash / E-Load',
  PRINTING: 'Printer & Labels',
};

export type StockFilter =
  | 'ALL'
  | 'LOW'
  | 'OUT'
  | 'FAST_LOW'
  | 'DEAD'
  | 'EXPIRED'
  | 'SOON'
  | 'NO_CAP'
  | 'LOSS';

export const STOCK_FILTER_LABELS: Record<StockFilter, string> = {
  ALL: 'All Items',
  LOW: 'Low Stock',
  OUT: 'Out of Stock',
  FAST_LOW: 'Fast-Draining',
  DEAD: 'Dead Stock',
  EXPIRED: 'Expired',
  SOON: 'Expiring Soon',
  NO_CAP: 'No Capital',
  LOSS: 'Below Capital',
};

export type StockSort =
  | 'DEFAULT'
  | 'COVER_ASC'
  | 'STOCK_ASC'
  | 'STOCK_DESC'
  | 'VELOCITY_DESC'
  | 'VALUE_DESC'
  | 'EXPIRY_ASC'
  | 'NAME_ASC';

export interface Product {
  id: string;
  barcode: string;
  name: string;
  category: string;
  unit: string;
  capital?: number | null;
  retailPrice: number;
  wholesalePrice: number;
  wholesaleMinQty: number;
  stock: number;
  lowStockThreshold?: number | null;
  expiry?: string | null;
  scEligible?: boolean | null;
  icon?: string | null;
  iconColor?: string | null;
  updatedAt?: string | null;
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
  productId?: string | null;
  category?: string | null;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  priceType: PriceType;
  capital?: number | null;
  lineTotal: number;
}

export interface SplitDetails {
  cash: number;
  digital: number;
  digitalMethod: string;
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
  refNo?: string | null;
  splitDetails?: SplitDetails | null;
  seniorId?: string | null;
  seniorBase?: number | null;
  seniorCapped?: boolean | null;
  voided?: boolean | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  pointsEarned?: number | null;
  pointsRedeemed?: number | null;
  pointsDiscount?: number | null;
  utangDueDate?: string | null;
  cashierName?: string | null;
  shiftId?: string | null;
}

export interface HeldOrder {
  id: string;
  label?: string | null;
  time: string;
  items: CartLine[];
  total: number;
  isSeniorPwd?: boolean | null;
  priceMode?: PriceType | null;
}

export interface StoreSettings {
  storeName: string;
  storeAddress: string;
  storeTin: string;
  zCount: number;
  storePhone: string;
  receiptFooter: string;
  storeIcon: string;
  storeTagline?: string | null;
  lowStockThreshold: number;
  expiryWarnDays: number;
  reorderLeadDays: number;
  reorderSafetyDays: number;
  beep: boolean;
  scDiscountCap: number;
  receiptWidth: string;
  loyaltyPesoPerPoint: number;
  loyaltyPointValue: number;
  adminPinHash?: string | null;
  adminPinSalt?: string | null;
  adminPinIter: number;
  autoLockMinutes: number;
  lockWholePos: boolean;
  qrPayLabel?: string | null;
  qrMerchantName?: string | null;
  qrAccountNumber?: string | null;
  qrEmvPayload?: string | null;
  customerDisplayGreeting?: string | null;
  githubRepo: string;
  autoUpdateEnabled: boolean;
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: 'EternalBlue Mart',
  storeAddress: 'Mangatarem, Pangasinan, Philippines',
  storeTin: 'NON-VAT / NON-BIR INVOICE',
  zCount: 0,
  storePhone: '',
  receiptFooter: 'Thank you for shopping with us!',
  storeIcon: 'basket',
  storeTagline: null,
  lowStockThreshold: 10,
  expiryWarnDays: 30,
  reorderLeadDays: 3,
  reorderSafetyDays: 2,
  beep: true,
  scDiscountCap: 125,
  receiptWidth: '80mm',
  loyaltyPesoPerPoint: 50,
  loyaltyPointValue: 1,
  adminPinHash: null,
  adminPinSalt: null,
  adminPinIter: 100000,
  autoLockMinutes: 5,
  lockWholePos: false,
  qrPayLabel: null,
  qrMerchantName: null,
  qrAccountNumber: null,
  qrEmvPayload: null,
  customerDisplayGreeting: null,
  githubRepo: 'Harley0321/eternalblue',
  autoUpdateEnabled: true,
};

export interface SukiCustomer {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  creditLimit: number;
  balance: number;
  dueDate?: string | null;
  points: number;
  totalSpent: number;
  createdAt: string;
  updatedAt: string;
}

export interface UtangTransaction {
  id: string;
  customerId: string;
  customerName: string;
  type: 'charge' | 'payment';
  amount: number;
  balanceAfter: number;
  receiptNo?: string | null;
  paymentMethod?: string | null;
  note?: string | null;
  dateIso: string;
  cashierName?: string | null;
}

export interface RepackRule {
  id: string;
  name: string;
  masterProductId: string;
  targetProductId: string;
  yieldQty: number;
  autoComputeCost: boolean;
  updatedAt: string;
}

export interface RepackLogEntry {
  id: string;
  dateIso: string;
  ruleId: string;
  masterProductId: string;
  masterName: string;
  masterQtyUsed: number;
  targetProductId: string;
  targetName: string;
  targetQtyAdded: number;
  unitCost: number;
  cashierName?: string | null;
}

export interface CashDrawerEvent {
  id: string;
  dateIso: string;
  type: string; // float | expense | drop | topup
  category: string;
  amount: number;
  note?: string | null;
  cashierName?: string | null;
  shiftId?: string | null;
}

export interface DigitalServiceEntry {
  id: string;
  dateIso: string;
  kind: string; // GCASH_IN | GCASH_OUT | MAYA_IN | MAYA_OUT | ELOAD | BILLS_PAY
  amount: number;
  fee: number;
  reference?: string | null;
  customerPhone?: string | null;
  note?: string | null;
  cashierName?: string | null;
}

export interface CashierAccount {
  id: string;
  name: string;
  role: string; // manager | cashier
  active: boolean;
  createdAt: string;
}

export interface ActiveShiftState {
  shiftId: string;
  cashierId: string;
  cashierName: string;
  cashierRole: string;
  openedAt: string;
  openingFloat: number;
}

export interface StockLogEntry {
  id: string;
  dateIso: string;
  productId: string;
  productName: string;
  delta: number;
  prevStock: number;
  newStock: number;
  reason: string;
  note?: string | null;
}

export interface SecurityLogEntry {
  id: string;
  seq: number;
  timestamp: string;
  event: string;
  severity: string;
  summary: string;
  prevHash: string;
  entryHash: string;
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

export type ToastType = 'INFO' | 'WARNING' | 'ERROR';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

export interface ActiveCartSnapshot {
  cart: CartLine[];
  priceMode: PriceType;
  isSeniorPwd: boolean;
  seniorId: string;
}

export interface PosBackupPayload {
  app: string;
  version: string;
  exportedAt: string;
  settings: StoreSettings;
  products: Product[];
  sales: SaleRecord[];
  heldOrders: HeldOrder[];
  sukiCustomers: SukiCustomer[];
  utangTransactions: UtangTransaction[];
  repackRules: RepackRule[];
  repackLog: RepackLogEntry[];
  drawerEvents: CashDrawerEvent[];
  digitalServices: DigitalServiceEntry[];
  stockLog: StockLogEntry[];
  cashiers: CashierAccount[];
  activeShift?: ActiveShiftState | null;
}
