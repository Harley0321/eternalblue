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
    const rate = pesoPerPoint > 0 ? pesoPerPoint : 50;
    return Math.floor(Math.max(0, grandTotal) / rate);
  },

  isCustomerOverdue(customer: SukiCustomer, todayYmd = PosMath.todayYmd()): boolean {
    if (customer.balance <= 0 || !customer.dueDate || !customer.dueDate.trim()) return false;
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
    const charge = PosMath.round2(amount);
    if (charge <= 0) return { ok: false, error: 'Charge amount must be greater than ₱0.00' };
    const nextBal = PosMath.round2(customer.balance + charge);
    if (!allowOverLimit && customer.creditLimit > 0 && nextBal > customer.creditLimit + 1e-6) {
      return { ok: false, error: `Exceeds credit limit (${PosMath.formatPeso(customer.creditLimit)}).` };
    }
    const nowIso = new Date().toISOString();
    const next: SukiCustomer = {
      ...customer,
      balance: nextBal,
      dueDate: dueDate && dueDate.trim().length > 0 ? dueDate.trim() : customer.dueDate,
      totalSpent: PosMath.round2(customer.totalSpent + charge),
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
    const pay = PosMath.round2(amount);
    if (pay <= 0) return { ok: false, error: 'Payment must be greater than ₱0.00' };
    const cur = PosMath.round2(customer.balance);
    if (cur <= 0) return { ok: false, error: `${customer.name} has zero balance.` };
    const applied = Math.min(cur, pay);
    const nextBal = PosMath.round2(Math.max(0, cur - applied));
    const nowIso = new Date().toISOString();
    const next: SukiCustomer = {
      ...customer,
      balance: nextBal,
      dueDate: nextBal <= 0 ? null : customer.dueDate,
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
    const unpack = PosMath.round3(masterQtyToUnpack);
    if (unpack <= 0) return { ok: false, error: 'Unpack quantity must be > 0.' };
    const master = products.find((p) => p.id === rule.masterProductId);
    if (!master) return { ok: false, error: 'Master SKU not found.' };
    const target = products.find((p) => p.id === rule.targetProductId);
    if (!target) return { ok: false, error: 'Target SKU not found.' };
    if (master.stock + 1e-6 < unpack) {
      return { ok: false, error: `Not enough ${master.name} in stock.` };
    }

    const added = PosMath.round3(unpack * rule.yieldQty);
    const nextMasterStock = Math.max(0, PosMath.round3(master.stock - unpack));
    const nextTargetStock = PosMath.round3(target.stock + added);
    const masterCap = master.capital ?? 0;
    const derivedCost = masterCap > 0 && rule.yieldQty > 0 ? PosMath.round2(masterCap / rule.yieldQty) : 0;

    let nextTargetCap = target.capital ?? null;
    if (rule.autoComputeCost && derivedCost > 0) {
      const prevStock = Math.max(0, target.stock);
      const prevCap = target.capital ?? 0;
      if (prevStock > 0 && prevCap > 0 && nextTargetStock > 0) {
        nextTargetCap = PosMath.round2((prevStock * prevCap + added * derivedCost) / nextTargetStock);
      } else {
        nextTargetCap = derivedCost;
      }
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
    if (amount <= 0) return 0;
    if (kind === 'ELOAD') return amount >= 100 ? 5 : 3;
    if (kind === 'BILLS_PAY') return 15;
    if (amount <= 500) return 10;
    if (amount <= 1000) return 15;
    return Math.ceil(amount / 1000) * 20;
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
