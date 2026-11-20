import { PosMath } from '../domain/posMath';
import type { SaleRecord, StoreSettings } from '../types/pos';

export const EscPosPrinter = {
  formatReceiptText(sale: SaleRecord, settings: StoreSettings): string {
    const width = settings.receiptWidth === '58mm' ? 32 : 42;
    const sep = '-'.repeat(width);
    const lines: string[] = [];

    lines.push(settings.storeName.toUpperCase());
    lines.push(settings.storeAddress);
    if (settings.storeTin.trim()) lines.push(settings.storeTin);
    if (settings.storePhone.trim()) lines.push(`Tel: ${settings.storePhone}`);
    lines.push(sep);
    lines.push(`OR: ${sale.receiptNo}`);
    lines.push(`Date: ${sale.dateFormatted}`);
    if (sale.cashierName) lines.push(`Cashier: ${sale.cashierName}`);
    if (sale.customerName) lines.push(`Suki: ${sale.customerName}`);
    lines.push(sep);

    for (const it of sale.items) {
      lines.push(it.name);
      const qtyStr = `${PosMath.formatQty(it.qty, it.unit)} x ${PosMath.formatPeso(it.unitPrice)}`;
      const totalStr = PosMath.formatPeso(it.lineTotal);
      const pad = Math.max(1, width - qtyStr.length - totalStr.length);
      lines.push(qtyStr + ' '.repeat(pad) + totalStr);
    }

    lines.push(sep);
    if (sale.wholesaleSavings > 0) {
      lines.push(`Wholesale Savings: -${PosMath.formatPeso(sale.wholesaleSavings)}`);
    }
    if (sale.seniorDiscount > 0) {
      lines.push(`SC/PWD 5% Disc: -${PosMath.formatPeso(sale.seniorDiscount)}`);
    }
    if (sale.pointsDiscount && sale.pointsDiscount > 0) {
      lines.push(`Suki Pts (${sale.pointsRedeemed ?? 0}): -${PosMath.formatPeso(sale.pointsDiscount)}`);
    }
    lines.push(`TOTAL: ${PosMath.formatPeso(sale.grandTotal)}`);
    lines.push(`Payment: ${sale.paymentMethod}`);
    if (sale.paymentMethod === 'Split' && sale.splitDetails) {
      lines.push(
        `  Cash: ${PosMath.formatPeso(sale.splitDetails.cash)} | ${sale.splitDetails.digitalMethod}: ${PosMath.formatPeso(sale.splitDetails.digital)}`
      );
    }
    if (sale.tendered > 0) lines.push(`Tendered: ${PosMath.formatPeso(sale.tendered)}`);
    if (sale.change > 0) lines.push(`Change: ${PosMath.formatPeso(sale.change)}`);
    if (sale.refNo && sale.refNo.trim()) lines.push(`Ref #: ${sale.refNo}`);
    lines.push(sep);
    lines.push(settings.receiptFooter);
    return lines.join('\n') + '\n';
  },
};
