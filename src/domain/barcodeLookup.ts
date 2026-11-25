import type { Product } from '../types/pos';

export function findDuplicateBarcodeProduct(
  products: readonly Product[],
  rawBarcode: string,
  excludeProductId?: string | null
): Product | null {
  const clean = rawBarcode.trim().toLowerCase();
  if (!clean) return null;
  for (const p of products) {
    if (excludeProductId && p.id === excludeProductId) continue;
    if (p.barcode.trim().toLowerCase() === clean) {
      return p;
    }
  }
  return null;
}
