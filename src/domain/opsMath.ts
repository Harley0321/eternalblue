import type {
  CashDrawerEvent,
  DigitalServiceEntry,
  Product,
  RepackLogEntry,
  RepackRule,
  SaleRecord,
  StockLogEntry,
  SukiCustomer,
  UtangTransaction,
} from '../types/pos';
import { PosMath } from './posMath';

export type UtangResult =
  | { ok: true; customer: SukiCustomer; tx: UtangTransaction }
  | { ok: false; error: string };

export type RepackResult =
  | { ok: true; nextProducts: Product[]; stockLogs: StockLogEntry[]; repackLog: RepackLogEntry }
  | { ok: false; error: string };

export interface ShiftLedgerSummary {
  cashSales: number;
  digitalSales: number;
  utangCollectedCash: number;
  openingFloat: number;
  cashTopUps: number;
  expenses: number;
  cashDrops: number;
  serviceFees: number;
  expectedDrawerCash: number;
}

export const OpsMath = {
  computeLoyaltyPointsEarned(grandTotal: number, pesoPerPoint = 50): number {
    const rateC = PosMath.toCents(pesoPerPoint > 0 ? pesoPerPoint : 50);
    const totalC = Math.max(0, PosMath.toCents(grandTotal));
    return rateC > 0 ? Math.floor(totalC / rateC) : 0;
  },

  isCustomerOverdue(customer: SukiCustomer, todayYmd = PosMath.todayYmd()): boolean {
    if (PosMath.toCents(customer.balance) <= 0 || !customer.dueDate || !customer.dueDate.trim()) return false;
    return todayYmd > customer.dueDate.trim();
  },

  applyUtangCharge(
    customer: SukiCustomer,
    amount: number,
    receiptNo?: string | null,
    dueDate?: string | null,
    note?: string | null,
    cashierName?: string | null,
    allowOverLimit = false
  ): UtangResult {
    const chargeC = PosMath.toCents(amount);
    if (chargeC <= 0) return { ok: false, error: 'Charge amount must be greater than ₱0.00' };
    const curC = PosMath.toCents(customer.balance);
    const nextBalC = curC + chargeC;
    const limitC = PosMath.toCents(customer.creditLimit);
    if (!allowOverLimit && limitC > 0 && nextBalC > limitC) {
      return { ok: false, error: `Exceeds credit limit (${PosMath.formatPeso(customer.creditLimit)}).` };
    }
    const charge = PosMath.fromCents(chargeC);
    const nextBal = PosMath.fromCents(nextBalC);
    const nowIso = new Date().toISOString();
    const next: SukiCustomer = {
      ...customer,
      balance: nextBal,
      dueDate: dueDate && dueDate.trim().length > 0 ? dueDate.trim() : customer.dueDate,
      totalSpent: PosMath.fromCents(PosMath.toCents(customer.totalSpent) + chargeC),
      updatedAt: nowIso,
    };
    const tx: UtangTransaction = {
      id: `UTX-${Date.now()}`,
      customerId: customer.id,
      customerName: customer.name,
      type: 'charge',
      amount: charge,
      balanceAfter: nextBal,
      receiptNo: receiptNo ?? null,
      note: note ?? (receiptNo ? `POS Receipt ${receiptNo}` : 'Store credit charge'),
      dateIso: nowIso,
      cashierName: cashierName ?? null,
    };
    return { ok: true, customer: next, tx };
  },

  applyUtangPayment(
    customer: SukiCustomer,
    amount: number,
    paymentMethod = 'Cash',
    note?: string | null,
    cashierName?: string | null
  ): UtangResult {
    const payC = PosMath.toCents(amount);
    if (payC <= 0) return { ok: false, error: 'Payment must be greater than ₱0.00' };
    const curC = PosMath.toCents(customer.balance);
    if (curC <= 0) return { ok: false, error: `${customer.name} has zero balance.` };
    const appliedC = Math.min(curC, payC);
    const nextBalC = Math.max(0, curC - appliedC);
    const applied = PosMath.fromCents(appliedC);
    const nextBal = PosMath.fromCents(nextBalC);
    const nowIso = new Date().toISOString();
    const next: SukiCustomer = {
      ...customer,
      balance: nextBal,
      dueDate: nextBalC <= 0 ? null : customer.dueDate,
      updatedAt: nowIso,
    };
    const tx: UtangTransaction = {
      id: `UPY-${Date.now()}`,
      customerId: customer.id,
      customerName: customer.name,
      type: 'payment',
      amount: applied,
      balanceAfter: nextBal,
      paymentMethod,
      note: note ?? `Bayad utang (${paymentMethod})`,
      dateIso: nowIso,
      cashierName: cashierName ?? null,
    };
    return { ok: true, customer: next, tx };
  },

  executeRepackConversion(
    products: Product[],
    rule: RepackRule,
    masterQtyToUnpack: number,
    cashierName?: string | null
  ): RepackResult {
    const unpackMilli = PosMath.toMilli(masterQtyToUnpack);
    if (unpackMilli <= 0) return { ok: false, error: 'Unpack quantity must be > 0.' };
    const yieldMilli = PosMath.toMilli(rule.yieldQty);
    if (yieldMilli <= 0) return { ok: false, error: 'Repack yield must be > 0.' };

    const master = products.find((p) => p.id === rule.masterProductId);
    if (!master) return { ok: false, error: 'Master SKU not found.' };
    const target = products.find((p) => p.id === rule.targetProductId);
    if (!target) return { ok: false, error: 'Target SKU not found.' };

    const masterStockMilli = PosMath.toMilli(master.stock);
    if (masterStockMilli < unpackMilli) {
      return { ok: false, error: `Not enough ${master.name} in stock.` };
    }

    const unpack = PosMath.fromMilli(unpackMilli);
    const addedMilli = Math.floor((unpackMilli * yieldMilli + 500) / 1000);
    const added = PosMath.fromMilli(addedMilli);
    const nextMasterStock = Math.max(0, PosMath.fromMilli(masterStockMilli - unpackMilli));
    const prevTargetStockMilli = Math.max(0, PosMath.toMilli(target.stock));
    const nextTargetStock = PosMath.fromMilli(prevTargetStockMilli + addedMilli);

    const masterCap = master.capital ?? 0;
    const incomingBatchCostC = masterCap > 0 ? PosMath.lineCents(masterCap, unpack) : 0;
    const derivedCost =
      incomingBatchCostC > 0 && added > 0
        ? PosMath.fromCents(Math.round(incomingBatchCostC / added))
        : 0;

    let nextTargetCap = target.capital ?? null;
    if (rule.autoComputeCost && incomingBatchCostC > 0 && nextTargetStock > 0) {
      const prevStock = PosMath.fromMilli(prevTargetStockMilli);
      const prevCap = target.capital ?? 0;
      const prevCostC = prevStock > 0 && prevCap > 0 ? PosMath.lineCents(prevCap, prevStock) : 0;
      nextTargetCap = PosMath.fromCents(Math.round((prevCostC + incomingBatchCostC) / nextTargetStock));
    }

    const nowIso = new Date().toISOString();
    const updated = products.map((p) => {
      if (p.id === master.id) return { ...p, stock: nextMasterStock, updatedAt: nowIso };
      if (p.id === target.id) return { ...p, stock: nextTargetStock, capital: nextTargetCap, updatedAt: nowIso };
      return p;
    });

    const tag = Date.now().toString(36).toUpperCase();
    const stockLogs: StockLogEntry[] = [
      {
        id: `LOG-${tag}-OUT`,
        dateIso: nowIso,
        productId: master.id,
        productName: master.name,
        delta: -unpack,
        prevStock: master.stock,
        newStock: nextMasterStock,
        reason: 'Count Correction',
        note: `Unpacked ${PosMath.formatQty(unpack, master.unit)} → +${PosMath.formatQty(added, target.unit)}`,
      },
      {
        id: `LOG-${tag}-IN`,
        dateIso: nowIso,
        productId: target.id,
        productName: target.name,
        delta: added,
        prevStock: target.stock,
        newStock: nextTargetStock,
        reason: 'Restock',
        note: `Repack from ${master.name}`,
      },
    ];

    const repackLog: RepackLogEntry = {
      id: `RPK-${tag}`,
      dateIso: nowIso,
      ruleId: rule.id,
      masterProductId: master.id,
      masterName: master.name,
      masterQtyUsed: unpack,
      targetProductId: target.id,
      targetName: target.name,
      targetQtyAdded: added,
      unitCost: derivedCost > 0 ? derivedCost : target.capital ?? 0,
      cashierName: cashierName ?? null,
    };

    return { ok: true, nextProducts: updated, stockLogs, repackLog };
  },

  suggestServiceFee(kind: string, amount: number): number {
    const amtC = PosMath.toCents(amount);
    if (amtC <= 0) return 0;
    if (kind === 'ELOAD') return amtC >= 10000 ? 5 : 3;
    if (kind === 'BILLS_PAY') return 15;
    if (amtC <= 50000) return 10;
    if (amtC <= 100000) return 15;
    return Math.ceil(amtC / 100000) * 20;
  },

  summarizeShiftDrawer(
    sales: SaleRecord[],
    drawerEvents: CashDrawerEvent[],
    utangTx: UtangTransaction[],
    digitalServices: DigitalServiceEntry[],
    fromMs: number,
    toMs: number
  ): ShiftLedgerSummary {
    let cashC = 0;
    let digC = 0;
    for (const s of sales) {
      if (s.voided === true) continue;
      const ms = PosMath.parseIsoMs(s.dateIso);
      if (ms < fromMs || ms >= toMs) continue;
      const pm = s.paymentMethod.toLowerCase();
      if (pm === 'cash') {
        cashC += PosMath.toCents(s.grandTotal);
      } else if (pm === 'split' && s.splitDetails) {
        cashC += PosMath.toCents(s.splitDetails.cash);
        digC += PosMath.toCents(s.splitDetails.digital);
      } else if (pm !== 'utang') {
        digC += PosMath.toCents(s.grandTotal);
      }
    }

    let floatC = 0;
    let topupC = 0;
    let expC = 0;
    let dropC = 0;
    for (const ev of drawerEvents) {
      const ms = PosMath.parseIsoMs(ev.dateIso);
      if (ms < fromMs || ms >= toMs) continue;
      if (ev.type === 'float') floatC += PosMath.toCents(ev.amount);
      else if (ev.type === 'topup') topupC += PosMath.toCents(ev.amount);
      else if (ev.type === 'expense') expC += PosMath.toCents(ev.amount);
      else if (ev.type === 'drop') dropC += PosMath.toCents(ev.amount);
    }

    let utangCashC = 0;
    for (const tx of utangTx) {
      const ms = PosMath.parseIsoMs(tx.dateIso);
      if (ms < fromMs || ms >= toMs) continue;
      if (tx.type === 'payment' && (!tx.paymentMethod || tx.paymentMethod.toLowerCase() === 'cash')) {
        utangCashC += PosMath.toCents(tx.amount);
      }
    }

    let feeC = 0;
    for (const ds of digitalServices) {
      const ms = PosMath.parseIsoMs(ds.dateIso);
      if (ms < fromMs || ms >= toMs) continue;
      feeC += PosMath.toCents(ds.fee);
    }

    const expectedC = floatC + topupC + cashC + utangCashC - expC - dropC;
    return {
      cashSales: PosMath.fromCents(cashC),
      digitalSales: PosMath.fromCents(digC),
      utangCollectedCash: PosMath.fromCents(utangCashC),
      openingFloat: PosMath.fromCents(floatC),
      cashTopUps: PosMath.fromCents(topupC),
      expenses: PosMath.fromCents(expC),
      cashDrops: PosMath.fromCents(dropC),
      serviceFees: PosMath.fromCents(feeC),
      expectedDrawerCash: PosMath.fromCents(expectedC),
    };
  },

  buildUtangSmsStatement(customer: SukiCustomer, storeName: string): string {
    const lines = [
      `[${storeName}] Suki Balance Reminder`,
      `Hi ${customer.name}, your current store utang balance is ${PosMath.formatPeso(customer.balance)}.`,
    ];
    if (customer.dueDate && customer.dueDate.trim()) {
      lines.push(`Due date: ${customer.dueDate}`);
    }
    if (customer.points > 0) {
      lines.push(`Available Suki Points: ${customer.points} pts`);
    }
    lines.push('Maraming salamat po!');
    return lines.join('\n');
  },
};
