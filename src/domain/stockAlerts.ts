import type { Product, StoreSettings } from '../types/pos';

export const StockAlerts = {
  effectiveThreshold(product: Product, settings: StoreSettings): number {
    const custom = product.lowStockThreshold ?? 0;
    if (custom > 0) return custom;
    return settings.lowStockThreshold > 0 ? settings.lowStockThreshold : 10;
  },

  isOutOfStock(product: Product): boolean {
    return product.stock <= 0.0001;
  },

  isLowStock(product: Product, settings: StoreSettings): boolean {
    return product.stock > 0.0001 && product.stock <= StockAlerts.effectiveThreshold(product, settings) + 1e-6;
  },
};
