import type {
  CartLine,
  CartTotals,
  PaymentMethod,
  PriceType,
  Product,
  SaleRecord,
  StoreSettings,
} from '../types';
import { getLinePrice, lineTotalPeso, round2 } from './posMath';
import { resolveCheckoutQrState, type ResolvedCheckoutQr } from './paymentQr';

export const CUSTOMER_DISPLAY_CHANNEL = 'omnimart_customer_display_v1';
export const CUSTOMER_DISPLAY_STORAGE_KEY = 'omnimart_ph_customer_display_v1';

export type CustomerDisplayStatus = 'idle' | 'scanning' | 'checkout' | 'completed';

export interface CustomerDisplayLineItem {
  productId: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  retailPrice: number;
  lineTotal: number;
  priceType: PriceType;
}

export interface CustomerDisplayCheckoutState {
  method: PaymentMethod;
  finalDue: number;
  cashTendered: number;
  cashChange: number;
  splitCash: number;
  splitDigital: number;
  splitDigitalMethod: 'GCash' | 'Card';
  customerName?: string;
  pointsDiscount: number;
  showQr: boolean;
  qr: ResolvedCheckoutQr;
}

export interface CustomerDisplayCompletedState {
  receiptNo: string;
  dateFormatted: string;
  paymentMethod: string;
  grandTotal: number;
  tendered: number;
  change: number;
  customerName?: string;
  pointsEarned?: number;
}

export interface CustomerDisplaySnapshot {
  updatedAt: number;
  status: CustomerDisplayStatus;
  storeName: string;
  storeTagline?: string;
  greeting: string;
  cashierName?: string;
  priceMode: PriceType;
  isSeniorPwd: boolean;
  items: CustomerDisplayLineItem[];
  totals: CartTotals;
  checkout: CustomerDisplayCheckoutState | null;
  completedSale: CustomerDisplayCompletedState | null;
}

export interface CheckoutLiveDraft {
  open: boolean;
  method: PaymentMethod;
  finalDue: number;
  cashTendered: number;
  cashChange: number;
  splitCash: number;
  splitDigital: number;
  splitDigitalMethod: 'GCash' | 'Card';
  customerName?: string;
  pointsDiscount: number;
  forceShowQr?: boolean;
}

export function isCustomerDisplayMode(search = '', hash = ''): boolean {
  try {
    const cleanSearch = search.startsWith('?') ? search.slice(1) : search;
    const params = new URLSearchParams(cleanSearch);
    const val = params.get('display');
    if (val && val.toLowerCase() === 'customer') return true;
  } catch {
    // ignore malformed search string
  }
  const cleanHash = String(hash || '').trim().toLowerCase();
  return cleanHash === '#customer-display' || cleanHash === '#/customer-display';
}

export function buildCustomerDisplayUrl(href: string): string {
  try {
    const url = new URL(href);
    url.searchParams.set('display', 'customer');
    return url.toString();
  } catch {
    return '?display=customer';
  }
}

export function buildCustomerDisplaySnapshot(input: {
  storeName: string;
  storeTagline?: string;
  settings: StoreSettings;
  cashierName?: string;
  priceMode: PriceType;
  isSeniorPwd: boolean;
  cart: CartLine[];
  productMap: Map<string, Product>;
  totals: CartTotals;
  checkoutDraft?: CheckoutLiveDraft | null;
  lastCompletedSale?: SaleRecord | null;
  nowMs?: number;
}): CustomerDisplaySnapshot {
  const {
    storeName,
    storeTagline,
    settings,
    cashierName,
    priceMode,
    isSeniorPwd,
    cart,
    productMap,
    totals,
    checkoutDraft,
    lastCompletedSale,
    nowMs = Date.now(),
  } = input;

  const greeting =
    String(settings.customerDisplayGreeting || '').trim() ||
    `Welcome to ${storeName || 'our store'}!`;

  const items: CustomerDisplayLineItem[] = cart.map((line) => {
    const unitPrice = getLinePrice(line, productMap);
    const pType: PriceType = unitPrice < line.retailPrice ? 'wholesale' : 'retail';
    return {
      productId: line.productId,
      name: line.name,
      unit: line.unit,
      qty: line.qty,
      unitPrice,
      retailPrice: line.retailPrice,
      lineTotal: lineTotalPeso(unitPrice, line.qty),
      priceType: pType,
    };
  });

  if (checkoutDraft && checkoutDraft.open && items.length > 0) {
    const qrAmount =
      checkoutDraft.method === 'Split'
        ? round2(Math.max(0, checkoutDraft.splitDigital))
        : round2(Math.max(0, checkoutDraft.finalDue));

    const qr = resolveCheckoutQrState(settings, qrAmount);
    const qrHasSource = qr.mode !== 'unconfigured';
    const isDigitalMethod =
      checkoutDraft.method === 'GCash' ||
      (checkoutDraft.method === 'Split' && checkoutDraft.splitDigitalMethod === 'GCash');
    const showQr = Boolean(checkoutDraft.forceShowQr || (isDigitalMethod && qrHasSource));

    return {
      updatedAt: nowMs,
      status: 'checkout',
      storeName,
      storeTagline,
      greeting,
      cashierName,
      priceMode,
      isSeniorPwd,
      items,
      totals,
      checkout: {
        method: checkoutDraft.method,
        finalDue: round2(checkoutDraft.finalDue),
        cashTendered: round2(checkoutDraft.cashTendered),
        cashChange: round2(checkoutDraft.cashChange),
        splitCash: round2(checkoutDraft.splitCash),
        splitDigital: round2(checkoutDraft.splitDigital),
        splitDigitalMethod: checkoutDraft.splitDigitalMethod,
        customerName: checkoutDraft.customerName,
        pointsDiscount: round2(checkoutDraft.pointsDiscount),
        showQr,
        qr,
      },
      completedSale: null,
    };
  }

  if (items.length > 0) {
    return {
      updatedAt: nowMs,
      status: 'scanning',
      storeName,
      storeTagline,
      greeting,
      cashierName,
      priceMode,
      isSeniorPwd,
      items,
      totals,
      checkout: null,
      completedSale: null,
    };
  }

  if (lastCompletedSale) {
    return {
      updatedAt: nowMs,
      status: 'completed',
      storeName,
      storeTagline,
      greeting,
      cashierName,
      priceMode,
      isSeniorPwd: false,
      items: [],
      totals,
      checkout: null,
      completedSale: {
        receiptNo: lastCompletedSale.receiptNo,
        dateFormatted: lastCompletedSale.dateFormatted,
        paymentMethod: lastCompletedSale.paymentMethod,
        grandTotal: lastCompletedSale.grandTotal,
        tendered: lastCompletedSale.tendered,
        change: lastCompletedSale.change,
        customerName: lastCompletedSale.customerName,
        pointsEarned: lastCompletedSale.pointsEarned,
      },
    };
  }

  return {
    updatedAt: nowMs,
    status: 'idle',
    storeName,
    storeTagline,
    greeting,
    cashierName,
    priceMode,
    isSeniorPwd: false,
    items: [],
    totals,
    checkout: null,
    completedSale: null,
  };
}

let sharedChannel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (sharedChannel !== undefined) return sharedChannel;
  try {
    sharedChannel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
  } catch {
    sharedChannel = null;
  }
  return sharedChannel;
}

export function publishCustomerDisplaySnapshot(snapshot: CustomerDisplaySnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOMER_DISPLAY_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage quota errors on secondary mirror
  }
  try {
    const ch = getChannel();
    ch?.postMessage({ type: 'snapshot', snapshot });
  } catch {
    // ignore closed channel
  }
}

export function readStoredCustomerDisplaySnapshot(): CustomerDisplaySnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CUSTOMER_DISPLAY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CustomerDisplaySnapshot> | null;
    if (parsed && typeof parsed === 'object' && typeof parsed.status === 'string') {
      return parsed as CustomerDisplaySnapshot;
    }
  } catch {
    // ignore corrupt snapshot
  }
  return null;
}

export function subscribeCustomerDisplaySnapshot(
  onSnapshot: (snapshot: CustomerDisplaySnapshot) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL) : null;
  const handleChannel = (ev: MessageEvent) => {
    const data = ev.data as { type?: string; snapshot?: CustomerDisplaySnapshot } | null;
    if (data?.type === 'snapshot' && data.snapshot) {
      onSnapshot(data.snapshot);
    }
  };
  ch?.addEventListener('message', handleChannel);

  const handleStorage = (ev: StorageEvent) => {
    if (ev.key !== CUSTOMER_DISPLAY_STORAGE_KEY || !ev.newValue) return;
    try {
      const parsed = JSON.parse(ev.newValue) as CustomerDisplaySnapshot;
      if (parsed && typeof parsed.status === 'string') {
        onSnapshot(parsed);
      }
    } catch {
      // ignore
    }
  };
  window.addEventListener('storage', handleStorage);

  return () => {
    ch?.removeEventListener('message', handleChannel);
    try {
      ch?.close();
    } catch {
      // ignore
    }
    window.removeEventListener('storage', handleStorage);
  };
}
