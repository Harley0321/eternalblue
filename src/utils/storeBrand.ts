import {
  Building2,
  Coffee,
  Package,
  ShoppingBag,
  ShoppingBasket,
  Store,
  Utensils,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

export type StoreIconId =
  | 'basket'
  | 'store'
  | 'bag'
  | 'building'
  | 'warehouse'
  | 'coffee'
  | 'utensils'
  | 'package';

export interface StoreIconOption {
  id: StoreIconId;
  label: string;
  icon: LucideIcon;
}

export const STORE_ICON_OPTIONS: StoreIconOption[] = [
  { id: 'basket', label: 'Basket', icon: ShoppingBasket },
  { id: 'store', label: 'Storefront', icon: Store },
  { id: 'bag', label: 'Tote Bag', icon: ShoppingBag },
  { id: 'building', label: 'Supermart', icon: Building2 },
  { id: 'warehouse', label: 'Wholesale', icon: Warehouse },
  { id: 'coffee', label: 'Cafe / Snacks', icon: Coffee },
  { id: 'utensils', label: 'Eatery / Food', icon: Utensils },
  { id: 'package', label: 'Supply Hub', icon: Package },
];

export const STORE_ICON_MAP: Record<StoreIconId, StoreIconOption> = STORE_ICON_OPTIONS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<StoreIconId, StoreIconOption>,
);

export function resolveStoreIconOption(iconId?: string): StoreIconOption {
  if (iconId && iconId in STORE_ICON_MAP) {
    return STORE_ICON_MAP[iconId as StoreIconId];
  }
  return STORE_ICON_MAP.basket;
}

const MINOR_WORDS = new Set(['ni', 'ng', 'sa', 'at', 'of', 'the', 'and', 'for', 'in', 'on', 'by']);

export function normalizeStoreNameInput(raw: string, fallback = 'OmniMart PH Supermarket'): string {
  const collapsed = String(raw || '').replace(/\s+/g, ' ').trim();
  return collapsed || fallback;
}

export function formatStoreTitleCase(raw: string): string {
  const clean = normalizeStoreNameInput(raw, '');
  if (!clean) return '';
  return clean
    .split(' ')
    .map((word, idx) => {
      if (/^(PH|POS|INC|OPC|CO|MM|XL|II|III|IV)$/i.test(word)) {
        return word.toUpperCase();
      }
      if (/^[A-Z0-9&.-]{2,4}$/.test(word)) {
        return word;
      }
      const lower = word.toLowerCase();
      if (idx > 0 && MINOR_WORDS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function getStoreMonogram(storeName: string): string {
  const clean = normalizeStoreNameInput(storeName, 'OM');
  const words = clean
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'OM';
  const significant = words.filter((w) => !MINOR_WORDS.has(w.toLowerCase()));
  const pool = significant.length > 0 ? significant : words;
  if (pool.length === 1) {
    return pool[0].slice(0, 2).toUpperCase();
  }
  return `${pool[0][0]}${pool[1][0]}`.toUpperCase();
}
