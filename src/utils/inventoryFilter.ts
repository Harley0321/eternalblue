import type { Product, StockLogEntry } from '../types';
import {
  expiryInfo,
  extractScanPayload,
  lineTotalPeso,
  normBarcode,
  type CsvImportRowPreview,
  type ExpiryStatus,
  type ProductVelocity,
} from './posMath';
import { getEffectiveLowStockThreshold } from './stockAlerts';

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

export type StockSort =
  | 'default'
  | 'cover-asc'
  | 'stock-asc'
  | 'stock-desc'
  | 'velocity-desc'
  | 'value-desc'
  | 'expiry-asc'
  | 'margin-asc'
  | 'name-asc';

export interface InventoryFilterParams {
  products: Product[];
  searchQuery: string;
  stockFilter: StockFilter;
  selectedCategory: string;
  sortBy: StockSort;
  lowStockThreshold: number;
  coverWarnDays: number;
  expiryMap: Map<string, ExpiryStatus>;
  velocityById: Map<string, ProductVelocity>;
}

/**
 * Matches a product against a free-text inventory search query.
 * Supports product name, category, barcode substrings, normalized barcodes (ignoring leading zeros),
 * and cashier multiplier prefixes (e.g. "5*4800016644801").
 */
export function matchesInventorySearch(
  product: Pick<Product, 'name' | 'barcode' | 'category'>,
  rawQuery: string,
): boolean {
  const trimmed = rawQuery.trim();
  if (!trimmed) return true;

  const { code, rawQuery: extractedQuery } = extractScanPayload(trimmed);
  const qLower = trimmed.toLowerCase();
  const extractedLower = extractedQuery.toLowerCase();
  const codeLower = code.toLowerCase();
  const normQ = normBarcode(code || extractedQuery);

  const nameLower = product.name.toLowerCase();
  const catLower = (product.category || '').toLowerCase();
  const bcLower = (product.barcode || '').toLowerCase();

  if (
    nameLower.includes(qLower) ||
    catLower.includes(qLower) ||
    bcLower.includes(qLower)
  ) {
    return true;
  }

  if (
    extractedLower !== qLower &&
    (nameLower.includes(extractedLower) ||
      catLower.includes(extractedLower) ||
      bcLower.includes(codeLower))
  ) {
    return true;
  }

  if (normQ) {
    const prodNorm = normBarcode(product.barcode);
    if (prodNorm && (prodNorm === normQ || prodNorm.includes(normQ))) {
      return true;
    }
  }

  return false;
}

export function buildExpiryStatusMap(
  products: Product[],
  expiryWarnDays: number,
  nowDate: Date = new Date(),
): Map<string, ExpiryStatus> {
  const map = new Map<string, ExpiryStatus>();
  for (const p of products) {
    map.set(p.id, expiryInfo(p, expiryWarnDays, nowDate));
  }
  return map;
}

export function filterAndSortInventory({
  products,
  searchQuery,
  stockFilter,
  selectedCategory,
  sortBy,
  lowStockThreshold,
  coverWarnDays,
  expiryMap,
  velocityById,
}: InventoryFilterParams): Product[] {
  const hasQuery = searchQuery.trim().length > 0;

  const filtered = products.filter((p) => {
    if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;
    if (hasQuery && !matchesInventorySearch(p, searchQuery)) return false;

    if (stockFilter === 'ALL') return true;

    const stk = Number(p.stock) || 0;
    const st = expiryMap.get(p.id)?.status ?? 'none';
    const vel = velocityById.get(p.id);
    const cap = Number(p.capital) || 0;
    const effLowTh = getEffectiveLowStockThreshold(p, lowStockThreshold);

    switch (stockFilter) {
      case 'LOW':
        return stk > 0 && stk <= effLowTh;
      case 'OUT':
        return stk <= 0;
      case 'FAST_LOW':
        return stk > 0 && vel?.daysOfCover !== null && vel !== undefined && vel.daysOfCover <= coverWarnDays;
      case 'DEAD':
        return !!vel?.isDeadStock;
      case 'EXPIRED':
        return st === 'expired';
      case 'SOON':
        return st === 'soon';
      case 'NO_CAP':
        return !(cap > 0);
      case 'LOSS':
        return cap > 0 && (p.retailPrice < cap || (p.wholesalePrice > 0 && p.wholesalePrice < cap));
      default:
        return true;
    }
  });

  if (sortBy === 'default') return filtered;

  return [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'stock-asc':
        return a.stock - b.stock;
      case 'stock-desc':
        return b.stock - a.stock;
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'cover-asc': {
        const ca = velocityById.get(a.id)?.daysOfCover ?? 999999;
        const cb = velocityById.get(b.id)?.daysOfCover ?? 999999;
        return ca - cb;
      }
      case 'velocity-desc': {
        const va = velocityById.get(a.id)?.avgDaily ?? 0;
        const vb = velocityById.get(b.id)?.avgDaily ?? 0;
        return vb - va;
      }
      case 'value-desc':
        return lineTotalPeso(b.retailPrice, b.stock) - lineTotalPeso(a.retailPrice, a.stock);
      case 'expiry-asc': {
        const da = expiryMap.get(a.id)?.days ?? 999999;
        const db = expiryMap.get(b.id)?.days ?? 999999;
        return da - db;
      }
      case 'margin-asc': {
        const ma =
          Number(a.capital) > 0 && a.retailPrice > 0
            ? (a.retailPrice - Number(a.capital)) / a.retailPrice
            : 999;
        const mb =
          Number(b.capital) > 0 && b.retailPrice > 0
            ? (b.retailPrice - Number(b.capital)) / b.retailPrice
            : 999;
        return ma - mb;
      }
      default:
        return 0;
    }
  });
}

export interface AppliedCsvImportResult {
  nextProducts: Product[];
  newLogs: StockLogEntry[];
  created: number;
  updated: number;
}

/**
 * Purely applies parsed CSV rows onto an existing product catalog.
 * Updates existing rows in-place via a stable index map before prepending
 * newly created SKUs so mixed create+update CSVs never corrupt array indices.
 */
export function applyCsvImportToCatalog(
  products: Product[],
  rows: CsvImportRowPreview[],
  mode: 'merge' | 'new-only',
  nowIso: string = new Date().toISOString(),
  stampMs: number = Date.now(),
): AppliedCsvImportResult {
  const updatedProducts = [...products];
  const indexById = new Map(updatedProducts.map((p, i) => [p.id, i]));
  const createdProducts: Product[] = [];
  const newLogs: StockLogEntry[] = [];
  let created = 0;
  let updated = 0;
  const stamp = stampMs.toString(36);

  for (const row of rows) {
    if (row.action === 'update' && mode === 'merge' && row.existing && row.data) {
      const idx = indexById.get(row.existing.id);
      if (idx === undefined) continue;
      const oldProd = updatedProducts[idx];
      updatedProducts[idx] = { ...oldProd, ...row.data, updatedAt: nowIso };
      updated++;
      const delta = Number((row.data.stock - oldProd.stock).toFixed(3));
      if (delta !== 0) {
        newLogs.push({
          id: `LOG-${stamp}-${row.rowNum}`,
          dateIso: nowIso,
          productId: oldProd.id,
          productName: row.data.name,
          delta,
          prevStock: oldProd.stock,
          newStock: row.data.stock,
          reason: delta > 0 ? 'Restock' : 'Count Correction',
          note: 'CSV Import',
        });
      }
    } else if (row.action === 'create' && row.data) {
      const id = `SKU-${stamp.toUpperCase()}-${row.rowNum}`;
      createdProducts.unshift({ id, ...row.data, updatedAt: nowIso });
      created++;
      if (row.data.stock > 0) {
        newLogs.push({
          id: `LOG-${stamp}-C${row.rowNum}`,
          dateIso: nowIso,
          productId: id,
          productName: row.data.name,
          delta: row.data.stock,
          prevStock: 0,
          newStock: row.data.stock,
          reason: 'Restock',
          note: 'CSV Import (new SKU)',
        });
      }
    }
  }

  return {
    nextProducts: [...createdProducts, ...updatedProducts],
    newLogs,
    created,
    updated,
  };
}
