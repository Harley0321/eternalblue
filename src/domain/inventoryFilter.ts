import type { Product, SaleRecord, StockFilter, StockSort, StoreSettings } from '../types/pos';
import { PosMath } from './posMath';
import { StockAlerts } from './stockAlerts';

export const InventoryFilter = {
  filterAndSort(
    products: Product[],
    sales: SaleRecord[],
    settings: StoreSettings,
    query: string,
    filter: StockFilter,
    sort: StockSort
  ): Product[] {
    const velocities = PosMath.computeProductVelocities(products, sales, 30);
    const q = query.trim().toLowerCase();

    const filtered = products.filter((p) => {
      const matchQuery =
        q.length === 0 ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q);
      if (!matchQuery) return false;

      const v = velocities[p.id] ?? 0;
      const exp = PosMath.expiryInfo(p, settings.expiryWarnDays);
      const cap = p.capital ?? 0;

      switch (filter) {
        case 'ALL':
          return true;
        case 'LOW':
          return StockAlerts.isLowStock(p, settings);
        case 'OUT':
          return StockAlerts.isOutOfStock(p);
        case 'FAST_LOW':
          return v > 0 && p.stock > 0 && p.stock / v <= settings.reorderLeadDays + settings.reorderSafetyDays;
        case 'DEAD':
          return v <= 0 && p.stock > 0;
        case 'EXPIRED':
          return exp.status === 'EXPIRED';
        case 'SOON':
          return exp.status === 'SOON';
        case 'NO_CAP':
          return PosMath.toCents(cap) <= 0;
        case 'LOSS':
          return PosMath.toCents(cap) > 0 && PosMath.toCents(p.retailPrice) < PosMath.toCents(cap);
      }
    });

    const sorted = [...filtered];
    switch (sort) {
      case 'DEFAULT':
        return sorted;
      case 'COVER_ASC':
        return sorted.sort((a, b) => {
          const va = velocities[a.id] ?? 0;
          const vb = velocities[b.id] ?? 0;
          return (va > 0 ? a.stock / va : 999999) - (vb > 0 ? b.stock / vb : 999999);
        });
      case 'STOCK_ASC':
        return sorted.sort((a, b) => a.stock - b.stock);
      case 'STOCK_DESC':
        return sorted.sort((a, b) => b.stock - a.stock);
      case 'VELOCITY_DESC':
        return sorted.sort((a, b) => (velocities[b.id] ?? 0) - (velocities[a.id] ?? 0));
      case 'VALUE_DESC':
        return sorted.sort(
          (a, b) =>
            PosMath.lineCents(b.retailPrice, Math.max(0, b.stock)) -
            PosMath.lineCents(a.retailPrice, Math.max(0, a.stock))
        );
      case 'EXPIRY_ASC':
        return sorted.sort(
          (a, b) =>
            (PosMath.expiryInfo(a, settings.expiryWarnDays).days ?? 999999) -
            (PosMath.expiryInfo(b, settings.expiryWarnDays).days ?? 999999)
        );
      case 'NAME_ASC':
        return sorted.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    }
  },
};
