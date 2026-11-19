import type { Product } from '../types';

export interface LowStockAlertSummary {
  lowStockItems: Product[];
  outOfStockItems: Product[];
  lowCount: number;
  outCount: number;
  totalAlertCount: number;
}

export interface StockAlertNotificationPayload {
  title: string;
  body: string;
  tag: string;
  itemsCount: number;
}

export type BrowserNotificationPermissionState =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported';

export function normalizeThreshold(value: unknown, fallback = 10): number {
  const n = Number(value);
  if (value !== '' && value !== null && value !== undefined && Number.isFinite(n) && n >= 0) {
    return n;
  }
  return fallback;
}

export function getEffectiveLowStockThreshold(
  product: Pick<Product, 'lowStockThreshold'>,
  globalThreshold: number,
): number {
  const globalVal = normalizeThreshold(globalThreshold, 10);
  if (
    product.lowStockThreshold !== undefined &&
    product.lowStockThreshold !== null &&
    Number.isFinite(Number(product.lowStockThreshold)) &&
    Number(product.lowStockThreshold) >= 0
  ) {
    return Number(product.lowStockThreshold);
  }
  return globalVal;
}

export function isProductLowStock(
  product: Pick<Product, 'stock' | 'lowStockThreshold'>,
  globalThreshold: number,
): boolean {
  const stock = Number(product.stock) || 0;
  const threshold = getEffectiveLowStockThreshold(product, globalThreshold);
  return stock <= threshold;
}

export function computeLowStockAlerts(
  products: Product[],
  globalThreshold: number,
): LowStockAlertSummary {
  const lowStockItems: Product[] = [];
  const outOfStockItems: Product[] = [];

  for (const p of products) {
    const stock = Number(p.stock) || 0;
    const th = getEffectiveLowStockThreshold(p, globalThreshold);
    if (stock <= 0) {
      outOfStockItems.push(p);
    } else if (stock <= th) {
      lowStockItems.push(p);
    }
  }

  return {
    lowStockItems,
    outOfStockItems,
    lowCount: lowStockItems.length,
    outCount: outOfStockItems.length,
    totalAlertCount: lowStockItems.length + outOfStockItems.length,
  };
}

/**
 * Returns products that newly crossed at/below their low-stock threshold
 * (or dropped from low-stock into out-of-stock <= 0) compared to prevProducts.
 */
export function detectNewlyLowStockProducts(
  prevProducts: Product[],
  nextProducts: Product[],
  globalThreshold: number,
  prevGlobalThreshold: number = globalThreshold,
): Product[] {
  const prevById = new Map<string, Product>();
  for (const p of prevProducts) {
    prevById.set(p.id, p);
  }

  const triggered: Product[] = [];
  for (const nextProd of nextProducts) {
    const nextStock = Number(nextProd.stock) || 0;
    const nextTh = getEffectiveLowStockThreshold(nextProd, globalThreshold);
    const isNowAlert = nextStock <= nextTh;
    if (!isNowAlert) continue;

    const prevProd = prevById.get(nextProd.id);
    if (!prevProd) {
      triggered.push(nextProd);
      continue;
    }

    const prevStock = Number(prevProd.stock) || 0;
    const prevTh = getEffectiveLowStockThreshold(prevProd, prevGlobalThreshold);
    const wasAlert = prevStock <= prevTh;

    if (!wasAlert) {
      triggered.push(nextProd);
    } else if (prevStock > 0 && nextStock <= 0) {
      triggered.push(nextProd);
    }
  }

  return triggered;
}

export function buildStockAlertNotificationPayload(
  items: Product[],
  globalThreshold: number,
  storeName: string,
): StockAlertNotificationPayload {
  const safeStore = (storeName || 'EternalBlue Mart').trim();
  if (items.length === 0) {
    return {
      title: `Stock Alert · ${safeStore}`,
      body: 'All inventory items are currently above low-stock thresholds.',
      tag: 'eternalblue-stock-alert',
      itemsCount: 0,
    };
  }

  const outCount = items.filter((p) => (Number(p.stock) || 0) <= 0).length;
  const title =
    outCount > 0 && outCount === items.length
      ? `Out of Stock Alert · ${safeStore}`
      : `Low Stock Alert · ${safeStore}`;

  const preview = items.slice(0, 3).map((p) => {
    const stk = Number(p.stock) || 0;
    const th = getEffectiveLowStockThreshold(p, globalThreshold);
    if (stk <= 0) return `${p.name} (OUT OF STOCK)`;
    return `${p.name} (${stk} ${p.unit} left, min ${th})`;
  });

  const extra = items.length > 3 ? ` +${items.length - 3} more` : '';
  const body =
    items.length === 1
      ? `${preview[0]} is below its low-stock threshold.`
      : `${items.length} products need restock: ${preview.join(', ')}${extra}.`;

  return {
    title,
    body,
    tag: 'eternalblue-stock-alert',
    itemsCount: items.length,
  };
}

export function getBrowserNotificationPermission(): BrowserNotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  const perm = Notification.permission;
  if (perm === 'granted' || perm === 'denied' || perm === 'default') {
    return perm;
  }
  return 'default';
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted' || result === 'denied' || result === 'default') {
      return result;
    }
    return 'default';
  } catch {
    return getBrowserNotificationPermission();
  }
}

export async function dispatchBrowserStockNotification(
  payload: Pick<StockAlertNotificationPayload, 'title' | 'body' | 'tag'>,
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  const options: NotificationOptions & { renotify?: boolean } = {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag,
    renotify: true,
  };

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker?.controller) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(payload.title, options);
        return true;
      }
    }
  } catch {
    // Fall back to standard Notification constructor below
  }

  try {
    const notif = new Notification(payload.title, options);
    notif.onclick = () => {
      try {
        window.focus();
        notif.close();
      } catch {
        // ignore
      }
    };
    return true;
  } catch {
    return false;
  }
}
