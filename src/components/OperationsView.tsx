import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Bluetooth,
  BookOpen,
  Coins,
  Copy,
  PackageOpen,
  Plus,
  Printer,
  Scissors,
  Search,
  Smartphone,
  Tag,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import type {
  ActiveShiftState,
  CashDrawerEvent,
  CashierAccount,
  DigitalServiceEntry,
  DigitalServiceKind,
  DrawerEventType,
  OperationsSubTab,
  Product,
  RepackLogEntry,
  RepackRule,
  SaleRecord,
  StoreSettings,
  SukiCustomer,
  UtangTransaction,
} from '../types';
import {
  buildEscPosCashDrawerKick,
  buildEscPosTestSlip,
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  getBluetoothPrinterSession,
  isWebBluetoothSupported,
  sendBytesToBluetoothPrinter,
} from '../utils/escPosPrinter';
import {
  buildUtangSmsStatement,
  computeRepackUnitCost,
  computeShiftLedgerSummary,
  isCustomerOverdue,
  suggestServiceFee,
  summarizeDigitalServices,
  summarizeUtangLedger,
} from '../utils/opsMath';
import { DAY_MS, formatPeso, startOfDay } from '../utils/posMath';
import { BarcodeSvg } from './BarcodeSvg';

interface OperationsViewProps {
  initialSubTab?: OperationsSubTab;
  subTabSignal?: number;
  settings: StoreSettings;
  products: Product[];
  sales: SaleRecord[];
  customers: SukiCustomer[];
  utangTxs: UtangTransaction[];
  repackRules: RepackRule[];
  repackLogs: RepackLogEntry[];
  drawerEvents: CashDrawerEvent[];
  serviceEntries: DigitalServiceEntry[];
  cashiers: CashierAccount[];
  activeShift: ActiveShiftState | null;
  onUpdateSettings: (next: StoreSettings) => void;
  onAddCustomer: (data: {
    name: string;
    phone?: string;
    address?: string;
    creditLimit: number;
    notes?: string;
  }) => SukiCustomer;
  onUpdateCustomer: (id: string, patch: Partial<SukiCustomer>) => void;
  onUtangPayment: (
    customerId: string,
    amount: number,
    method: 'Cash' | 'GCash' | 'Card',
    note?: string,
  ) => void;
  onUtangManualCharge: (
    customerId: string,
    amount: number,
    dueDate?: string,
    note?: string,
    allowOverLimit?: boolean,
  ) => void;
  onCreateRepackRule: (rule: Omit<RepackRule, 'id' | 'updatedAt'>) => void;
  onDeleteRepackRule: (ruleId: string) => void;
  onRunRepack: (ruleId: string, qty: number) => void;
  onOpenShift: (cashierId: string, openingFloat: number, pinInput?: string) => boolean;
  onAddCashier: (data: { name: string; role: 'manager' | 'cashier'; pin?: string }) => void;
  onToggleCashierActive: (cashierId: string) => void;
  onAddDrawerEvent: (data: {
    type: DrawerEventType;
    category: string;
    amount: number;
    note?: string;
  }) => void;
  onDeleteDrawerEvent: (id: string) => void;
  onAddServiceEntry: (data: {
    kind: DigitalServiceKind;
    amount: number;
    fee: number;
    reference?: string;
    customerPhone?: string;
    note?: string;
  }) => void;
  onDeleteServiceEntry: (id: string) => void;
  onToast: (msg: string, type?: 'success' | 'warning' | 'error') => void;
}

const EXPENSE_CATEGORIES = [
  'Plastic / Packaging',
  'Ice / Utilities',
  'Delivery / Grab / Tricycle',
  'Staff Meal / Allowance',
  'Supplier C.O.D.',
  'Store Supplies / Repair',
  'Other',
];

const SERVICE_KINDS: DigitalServiceKind[] = [
  'GCash Cash-In',
  'GCash Cash-Out',
  'Maya Cash-In',
  'Maya Cash-Out',
  'E-Load',
  'Bills Pay',
];

export const OperationsView: React.FC<OperationsViewProps> = ({
  initialSubTab = 'utang',
  subTabSignal,
  settings,
  products,
  sales,
  customers,
  utangTxs,
  repackRules,
  repackLogs,
  drawerEvents,
  serviceEntries,
  cashiers,
  activeShift,
  onUpdateSettings,
  onAddCustomer,
  onUtangPayment,
  onUtangManualCharge,
  onCreateRepackRule,
  onDeleteRepackRule,
  onRunRepack,
  onOpenShift,
  onAddCashier,
  onToggleCashierActive,
  onAddDrawerEvent,
  onDeleteDrawerEvent,
  onAddServiceEntry,
  onDeleteServiceEntry,
  onToast,
}) => {
  const [subTab, setSubTab] = useState<OperationsSubTab>(initialSubTab);

  useEffect(() => {
    if (subTabSignal && subTabSignal > 0) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab, subTabSignal]);

  // --------------------------------------------------------------------------
  // 1. Utang & Suki State
  // --------------------------------------------------------------------------
  const [sukiQuery, setSukiQuery] = useState('');
  const [showOnlyDebtors, setShowOnlyDebtors] = useState(false);
  const [newSukiOpen, setNewSukiOpen] = useState(false);
  const [sukiName, setSukiName] = useState('');
  const [sukiPhone, setSukiPhone] = useState('');
  const [sukiAddress, setSukiAddress] = useState('');
  const [sukiLimitStr, setSukiLimitStr] = useState('1500');
  const [activeUtangAction, setActiveUtangAction] = useState<{
    type: 'payment' | 'charge' | 'ledger';
    customerId: string;
  } | null>(null);
  const [utangAmtStr, setUtangAmtStr] = useState('');
  const [utangPayMethod, setUtangPayMethod] = useState<'Cash' | 'GCash' | 'Card'>('Cash');
  const [utangDueInput, setUtangDueInput] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA'),
  );
  const [utangNote, setUtangNote] = useState('');
  const [utangAllowOver, setUtangAllowOver] = useState(false);

  const utangSummary = useMemo(
    () => summarizeUtangLedger(customers, utangTxs),
    [customers, utangTxs],
  );

  const filteredCustomers = useMemo(() => {
    const q = sukiQuery.trim().toLowerCase();
    return customers
      .filter((c) => {
        if (showOnlyDebtors && !(c.balance > 0)) return false;
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q) ||
          (c.address || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  }, [customers, sukiQuery, showOnlyDebtors]);

  // --------------------------------------------------------------------------
  // 2. Tingi / Repack State
  // --------------------------------------------------------------------------
  const [ruleName, setRuleName] = useState('');
  const [masterPid, setMasterPid] = useState('');
  const [targetPid, setTargetPid] = useState('');
  const [yieldQtyStr, setYieldQtyStr] = useState('50');
  const [autoCost, setAutoCost] = useState(true);
  const [unpackQtys, setUnpackQtys] = useState<Record<string, string>>({});

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const selectedMasterProd = masterPid ? productById.get(masterPid) : undefined;
  const selectedTargetProd = targetPid ? productById.get(targetPid) : undefined;
  const previewUnitCost = computeRepackUnitCost(
    selectedMasterProd?.capital,
    parseFloat(yieldQtyStr) || 0,
  );

  // --------------------------------------------------------------------------
  // 3. Shift, Cashier & Expenses State
  // --------------------------------------------------------------------------
  const [shiftCashierId, setShiftCashierId] = useState(() => cashiers[0]?.id || '');
  const [shiftFloatStr, setShiftFloatStr] = useState(() =>
    String(activeShift?.openingFloat ?? 1000),
  );
  const [shiftPin, setShiftPin] = useState('');
  const [newCashierName, setNewCashierName] = useState('');
  const [newCashierRole, setNewCashierRole] = useState<'cashier' | 'manager'>('cashier');
  const [newCashierPin, setNewCashierPin] = useState('');
  const [eventType, setEventType] = useState<DrawerEventType>('expense');
  const [eventCategory, setEventCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [eventAmtStr, setEventAmtStr] = useState('');
  const [eventNote, setEventNote] = useState('');

  useEffect(() => {
    if (!shiftCashierId && cashiers.length > 0) {
      setShiftCashierId(cashiers[0].id);
    }
  }, [cashiers, shiftCashierId]);

  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const todayEnd = useMemo(() => new Date(todayStart.getTime() + DAY_MS), [todayStart]);

  const shiftLedger = useMemo(
    () =>
      computeShiftLedgerSummary({
        sales,
        products,
        drawerEvents,
        utangTransactions: utangTxs,
        serviceEntries,
        openingFloat: activeShift?.openingFloat ?? 0,
        from: todayStart,
        to: todayEnd,
      }),
    [sales, products, drawerEvents, utangTxs, serviceEntries, activeShift, todayStart, todayEnd],
  );

  // --------------------------------------------------------------------------
  // 4. GCash / Maya / E-Load State
  // --------------------------------------------------------------------------
  const [svcKind, setSvcKind] = useState<DigitalServiceKind>('GCash Cash-In');
  const [svcAmtStr, setSvcAmtStr] = useState('');
  const [svcFeeStr, setSvcFeeStr] = useState('');
  const [svcPhone, setSvcPhone] = useState('');
  const [svcRef, setSvcRef] = useState('');
  const [svcNote, setSvcNote] = useState('');

  const todayServiceSummary = useMemo(
    () => summarizeDigitalServices(serviceEntries, todayStart, todayEnd),
    [serviceEntries, todayStart, todayEnd],
  );

  // --------------------------------------------------------------------------
  // 5. Bluetooth Printer & Shelf Label Studio State
  // --------------------------------------------------------------------------
  const [btStatus, setBtStatus] = useState(() => getBluetoothPrinterSession());
  const [btBusy, setBtBusy] = useState(false);
  const btSupported = isWebBluetoothSupported();

  const [labelSearch, setLabelSearch] = useState('');
  const [labelQuantities, setLabelQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    products.slice(0, 6).forEach((p) => {
      init[p.id] = 1;
    });
    return init;
  });
  const [labelShowBarcode, setLabelShowBarcode] = useState(true);
  const [labelShowWholesale, setLabelShowWholesale] = useState(true);
  const [labelShowStore, setLabelShowStore] = useState(true);

  const labelCatalogMatches = useMemo(() => {
    const q = labelSearch.trim().toLowerCase();
    return products
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q))
      .slice(0, 30);
  }, [products, labelSearch]);

  const printableLabelsList = useMemo(() => {
    const out: { key: string; product: Product }[] = [];
    for (const p of products) {
      const qty = Math.min(20, Math.max(0, labelQuantities[p.id] || 0));
      for (let i = 0; i < qty; i++) {
        out.push({ key: `${p.id}-${i}`, product: p });
      }
    }
    return out;
  }, [products, labelQuantities]);

  const handleCopySms = async (cust: SukiCustomer) => {
    try {
      await navigator.clipboard.writeText(buildUtangSmsStatement(cust, settings.storeName));
      onToast(`Copied reminder for ${cust.name}`, 'success');
    } catch {
      onToast('Clipboard unavailable in this browser', 'error');
    }
  };

  const handleBtConnect = async () => {
    setBtBusy(true);
    try {
      const sess = await connectBluetoothPrinter();
      setBtStatus(sess);
      onToast(`Connected to ${sess.deviceName}`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Bluetooth pairing cancelled', 'warning');
    } finally {
      setBtBusy(false);
    }
  };

  const handleBtTestSlip = async () => {
    setBtBusy(true);
    try {
      const bytes = buildEscPosTestSlip(
        settings,
        settings.receiptWidth === '58mm' ? '58mm' : '80mm',
      );
      await sendBytesToBluetoothPrinter(bytes);
      onToast('Test slip sent to thermal printer', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to send test slip', 'error');
    } finally {
      setBtBusy(false);
    }
  };

  const handleBtKickDrawer = async () => {
    setBtBusy(true);
    try {
      await sendBytesToBluetoothPrinter(buildEscPosCashDrawerKick());
      onToast('Cash drawer pulse sent (ESC p)', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Connect thermal printer first', 'warning');
    } finally {
      setBtBusy(false);
    }
  };

  const subTabs: {
    id: OperationsSubTab;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    badge?: string;
    badgeTone?: string;
  }[] = [
    {
      id: 'utang',
      label: 'Utang & Suki',
      Icon: BookOpen,
      badge: utangSummary.overdueCount > 0 ? `${utangSummary.overdueCount} due` : undefined,
      badgeTone: 'bg-rose-100 text-rose-700',
    },
    {
      id: 'repack',
      label: 'Tingi / Repack',
      Icon: PackageOpen,
      badge: repackRules.length > 0 ? String(repackRules.length) : undefined,
      badgeTone: 'bg-indigo-100 text-indigo-700',
    },
    {
      id: 'shift',
      label: 'Shift & Gastos',
      Icon: Wallet,
      badge: activeShift ? activeShift.cashierName.split(' ')[0] : 'No shift',
      badgeTone: activeShift ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
    },
    {
      id: 'services',
      label: 'GCash / E-Load',
      Icon: Smartphone,
      badge: todayServiceSummary.count > 0 ? formatPeso(todayServiceSummary.totalFees) : undefined,
      badgeTone: 'bg-sky-100 text-sky-800',
    },
    {
      id: 'printing',
      label: 'Printer & Labels',
      Icon: Tag,
      badge: btStatus.connected ? 'BT Ready' : undefined,
      badgeTone: 'bg-emerald-100 text-emerald-800',
    },
  ];

  const activeActionCustomer = activeUtangAction
    ? customers.find((c) => c.id === activeUtangAction.customerId) || null
    : null;

  return (
    <section
      data-testid="operations-view"
      className="h-full flex flex-col overflow-hidden p-3 sm:p-4 lg:p-6 gap-3"
    >
      {/* Store Ops Sub-Tab Strip */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        {subTabs.map(({ id, label, Icon, badge, badgeTone }) => {
          const active = subTab === id;
          return (
            <button
              key={id}
              type="button"
              data-testid={`ops-subtab-${id}`}
              onClick={() => setSubTab(id)}
              aria-pressed={active}
              className={`px-3 py-2 min-h-[40px] rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition ${
                active
                  ? 'bg-slate-900 text-emerald-400 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{label}</span>
              {badge && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono-num font-extrabold ${
                    active ? 'bg-slate-800 text-emerald-300' : badgeTone || 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Scrollable Sub-View Workspace */}
      <div className="flex-1 overflow-y-auto scroll-contain space-y-3 pb-4">
        {/* ================================================================ */}
        {/* SUB-TAB 1: DIGITAL UTANG & SUKI LOYALTY                          */}
        {/* ================================================================ */}
        {subTab === 'utang' && (
          <div className="space-y-3" data-testid="ops-panel-utang">
            {/* KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Total Receivables</div>
                <div
                  data-testid="utang-total-receivable"
                  className="font-mono-num font-extrabold text-xl text-amber-600 mt-0.5"
                >
                  {formatPeso(utangSummary.totalReceivable)}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                  {utangSummary.activeDebtors} Suki account(s) with balance
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Overdue Balance</div>
                <div className="font-mono-num font-extrabold text-xl text-rose-600 mt-0.5">
                  {formatPeso(utangSummary.overdueAmount)}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                  {utangSummary.overdueCount} overdue notice(s)
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Collected Today</div>
                <div className="font-mono-num font-extrabold text-xl text-emerald-700 mt-0.5">
                  {formatPeso(utangSummary.collectedToday)}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                  Charged today: {formatPeso(utangSummary.chargedToday)}
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Suki Loyalty Pool</div>
                <div className="font-mono-num font-extrabold text-xl text-indigo-700 mt-0.5">
                  {utangSummary.totalPoints.toLocaleString('en-PH')} pts
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                  ₱{settings.loyaltyPesoPerPoint ?? 50} spend = 1 pt · 1 pt = ₱{settings.loyaltyPointValue ?? 1}
                </div>
              </div>
            </div>

            {/* Loyalty Rate & Search Toolbar */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center gap-2.5 justify-between">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={sukiQuery}
                    onChange={(e) => setSukiQuery(e.target.value)}
                    placeholder="Search Suki name, phone, or purok..."
                    className="w-full pl-9 pr-3 py-2 min-h-[40px] rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowOnlyDebtors((v) => !v)}
                  className={`px-3 py-2 min-h-[40px] rounded-xl border text-xs font-bold cursor-pointer ${
                    showOnlyDebtors
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {showOnlyDebtors ? 'With Balance Only ✓' : 'All Suki'}
                </button>
                <button
                  type="button"
                  data-testid="add-suki-toggle-btn"
                  onClick={() => setNewSukiOpen((v) => !v)}
                  className="px-3.5 py-2 min-h-[40px] rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{newSukiOpen ? 'Close Form' : '+ Add Suki'}</span>
                </button>
              </div>

              {/* Inline Loyalty Rate Config */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                <Award className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="font-bold text-slate-700">Points Rule:</span>
                <label className="inline-flex items-center gap-1 text-slate-600">
                  <span>₱</span>
                  <input
                    type="number"
                    min={1}
                    value={settings.loyaltyPesoPerPoint ?? 50}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        loyaltyPesoPerPoint: Math.max(1, Number(e.target.value) || 50),
                      })
                    }
                    className="w-14 px-1.5 py-1 rounded border border-slate-300 bg-white font-mono-num font-bold text-right"
                  />
                  <span>= 1 pt</span>
                </label>
                <label className="inline-flex items-center gap-1 text-slate-600">
                  <span>· 1 pt = ₱</span>
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={settings.loyaltyPointValue ?? 1}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        loyaltyPointValue: Math.max(0.25, Number(e.target.value) || 1),
                      })
                    }
                    className="w-14 px-1.5 py-1 rounded border border-slate-300 bg-white font-mono-num font-bold text-right"
                  />
                </label>
              </div>
            </div>

            {/* New Suki Form */}
            {newSukiOpen && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!sukiName.trim()) {
                    onToast('Customer name is required', 'warning');
                    return;
                  }
                  onAddCustomer({
                    name: sukiName.trim(),
                    phone: sukiPhone.trim() || undefined,
                    address: sukiAddress.trim() || undefined,
                    creditLimit: Math.max(0, parseFloat(sukiLimitStr) || 0),
                  });
                  setSukiName('');
                  setSukiPhone('');
                  setSukiAddress('');
                  setSukiLimitStr('1500');
                  setNewSukiOpen(false);
                }}
                className="bg-white p-3.5 rounded-2xl border border-emerald-200 grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end"
              >
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Full Name / Store *
                  </label>
                  <input
                    type="text"
                    data-testid="suki-name-input"
                    value={sukiName}
                    onChange={(e) => setSukiName(e.target.value)}
                    placeholder="e.g. Aling Nena Santos"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Mobile #</label>
                  <input
                    type="tel"
                    data-testid="suki-phone-input"
                    value={sukiPhone}
                    onChange={(e) => setSukiPhone(e.target.value)}
                    placeholder="0917..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Credit Limit (₱)
                  </label>
                  <input
                    type="number"
                    min={0}
                    data-testid="suki-limit-input"
                    value={sukiLimitStr}
                    onChange={(e) => setSukiLimitStr(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono-num font-bold"
                  />
                </div>
                <button
                  type="submit"
                  data-testid="suki-save-btn"
                  className="px-4 py-2 min-h-[38px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer"
                >
                  Save Suki
                </button>
              </form>
            )}

            {/* Inline Utang Action Drawer (Bayad / Charge / History) */}
            {activeUtangAction && activeActionCustomer && (
              <div className="bg-white p-4 rounded-2xl border-2 border-slate-900 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      {activeUtangAction.type === 'payment'
                        ? `Record Bayad — ${activeActionCustomer.name}`
                        : activeUtangAction.type === 'charge'
                          ? `Manual Utang Charge — ${activeActionCustomer.name}`
                          : `Ledger History — ${activeActionCustomer.name}`}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Current Balance: <strong className="font-mono-num text-amber-700">{formatPeso(activeActionCustomer.balance)}</strong>
                      {' · '}Points: <strong className="font-mono-num text-indigo-700">{activeActionCustomer.points} pts</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveUtangAction(null)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                {activeUtangAction.type === 'payment' && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const amt = parseFloat(utangAmtStr) || 0;
                      onUtangPayment(activeActionCustomer.id, amt, utangPayMethod, utangNote.trim() || undefined);
                      setUtangAmtStr('');
                      setUtangNote('');
                      setActiveUtangAction(null);
                    }}
                    className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end"
                  >
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Payment Amount (₱)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0.01}
                        data-testid="utang-payment-amt"
                        value={utangAmtStr}
                        onChange={(e) => setUtangAmtStr(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono-num font-extrabold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Method</label>
                      <select
                        value={utangPayMethod}
                        onChange={(e) => setUtangPayMethod(e.target.value as 'Cash' | 'GCash' | 'Card')}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                      >
                        <option value="Cash">Cash (adds to drawer)</option>
                        <option value="GCash">GCash</option>
                        <option value="Card">Card / Bank</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Note</label>
                      <input
                        type="text"
                        value={utangNote}
                        onChange={(e) => setUtangNote(e.target.value)}
                        placeholder="Partial / full bayad"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                      />
                    </div>
                    <button
                      type="submit"
                      data-testid="utang-payment-submit"
                      className="px-4 py-2 min-h-[38px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer"
                    >
                      Post Bayad
                    </button>
                  </form>
                )}

                {activeUtangAction.type === 'charge' && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const amt = parseFloat(utangAmtStr) || 0;
                      onUtangManualCharge(
                        activeActionCustomer.id,
                        amt,
                        utangDueInput || undefined,
                        utangNote.trim() || undefined,
                        utangAllowOver,
                      );
                      setUtangAmtStr('');
                      setUtangNote('');
                      setUtangAllowOver(false);
                      setActiveUtangAction(null);
                    }}
                    className="space-y-2.5"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Charge Amount (₱)</label>
                        <input
                          type="number"
                          step="0.01"
                          min={0.01}
                          value={utangAmtStr}
                          onChange={(e) => setUtangAmtStr(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono-num font-extrabold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Due Date</label>
                        <input
                          type="date"
                          value={utangDueInput}
                          onChange={(e) => setUtangDueInput(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Items / Note</label>
                        <input
                          type="text"
                          value={utangNote}
                          onChange={(e) => setUtangNote(e.target.value)}
                          placeholder="e.g. 2kg rice, coffee"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-2 min-h-[38px] rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold cursor-pointer"
                      >
                        Add Utang Charge
                      </button>
                    </div>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={utangAllowOver}
                        onChange={(e) => setUtangAllowOver(e.target.checked)}
                      />
                      <span>Allow override if over credit limit</span>
                    </label>
                  </form>
                )}

                {activeUtangAction.type === 'ledger' && (
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                    {utangTxs
                      .filter((tx) => tx.customerId === activeActionCustomer.id)
                      .map((tx) => (
                        <div key={tx.id} className="py-2 flex items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-800">
                              {tx.type === 'payment' ? 'Bayad' : 'Utang Charge'}{' '}
                              {tx.receiptNo ? `(${tx.receiptNo})` : ''}
                            </div>
                            <div className="text-[10.5px] text-slate-500">
                              {new Date(tx.dateIso).toLocaleString('en-PH')} · {tx.note || tx.paymentMethod || ''}
                            </div>
                          </div>
                          <div className="text-right font-mono-num">
                            <div
                              className={`font-extrabold ${
                                tx.type === 'payment' ? 'text-emerald-700' : 'text-amber-700'
                              }`}
                            >
                              {tx.type === 'payment' ? '−' : '+'}
                              {formatPeso(tx.amount)}
                            </div>
                            <div className="text-[10px] text-slate-400">Bal: {formatPeso(tx.balanceAfter)}</div>
                          </div>
                        </div>
                      ))}
                    {utangTxs.filter((tx) => tx.customerId === activeActionCustomer.id).length === 0 && (
                      <div className="py-4 text-center text-slate-400">No ledger entries recorded yet.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Customers List */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {filteredCustomers.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No Suki customers yet. Click <strong>+ Add Suki</strong> or add one directly during POS Checkout!
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredCustomers.map((c) => {
                    const overdue = isCustomerOverdue(c);
                    const pct = c.creditLimit > 0 ? Math.min(100, Math.round((c.balance / c.creditLimit) * 100)) : 0;
                    return (
                      <div
                        key={c.id}
                        data-testid={`suki-row-${c.id}`}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
                      >
                        <div className="min-w-0 space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900">{c.name}</span>
                            {overdue && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-extrabold uppercase">
                                Overdue ({c.dueDate})
                              </span>
                            )}
                            {!overdue && c.balance > 0 && c.dueDate && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                Due {c.dueDate}
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-mono-num font-bold">
                              {c.points} pts
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            {c.phone && <span className="font-mono-num">{c.phone}</span>}
                            <span>Total spent: {formatPeso(c.totalSpent)}</span>
                            <span>
                              Limit: {c.creditLimit > 0 ? formatPeso(c.creditLimit) : 'No limit'}
                            </span>
                          </div>
                          {c.creditLimit > 0 && c.balance > 0 && (
                            <div className="w-full max-w-xs h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  pct >= 90 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <div className="text-right mr-2">
                            <div className="text-[10px] font-bold uppercase text-slate-400">Utang Bal</div>
                            <div
                              data-testid={`suki-balance-${c.id}`}
                              className={`font-mono-num font-extrabold text-base ${
                                c.balance > 0 ? 'text-amber-600' : 'text-emerald-700'
                              }`}
                            >
                              {formatPeso(c.balance)}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={c.balance <= 0}
                            data-testid={`suki-bayad-btn-${c.id}`}
                            onClick={() => {
                              setUtangAmtStr(c.balance > 0 ? c.balance.toFixed(2) : '');
                              setUtangPayMethod('Cash');
                              setUtangNote('');
                              setActiveUtangAction({ type: 'payment', customerId: c.id });
                            }}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold cursor-pointer"
                          >
                            Bayad
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUtangAmtStr('');
                              setUtangNote('');
                              setActiveUtangAction({ type: 'charge', customerId: c.id });
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold cursor-pointer"
                          >
                            + Charge
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveUtangAction((prev) =>
                                prev?.customerId === c.id && prev.type === 'ledger'
                                  ? null
                                  : { type: 'ledger', customerId: c.id },
                              )
                            }
                            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                          >
                            Ledger
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopySms(c)}
                            title="Copy SMS / Messenger balance reminder"
                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SUB-TAB 2: TINGI & BULK PACK-TO-PIECE UNIT CONVERSION            */}
        {/* ================================================================ */}
        {subTab === 'repack' && (
          <div className="space-y-3" data-testid="ops-panel-repack">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
              <div>
                <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Scissors className="w-4 h-4 text-indigo-600" />
                  <span>Create Bulk-to-Tingi Repack Rule (Buksan)</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Convert a sack, box, case, or bundle into retail kilo/piece units with automatic capital calculation.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!masterPid || !targetPid || masterPid === targetPid) {
                    onToast('Pick two distinct products: Master Bulk SKU & Target Tingi SKU', 'warning');
                    return;
                  }
                  const y = parseFloat(yieldQtyStr) || 0;
                  if (!(y > 0)) {
                    onToast('Yield quantity must be greater than 0', 'warning');
                    return;
                  }
                  const mName = selectedMasterProd?.name || 'Bulk';
                  const tName = selectedTargetProd?.name || 'Tingi';
                  onCreateRepackRule({
                    name: ruleName.trim() || `${mName} → ${y}× ${tName}`,
                    masterProductId: masterPid,
                    targetProductId: targetPid,
                    yieldQty: y,
                    autoComputeCost: autoCost,
                  });
                  setRuleName('');
                }}
                className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end"
              >
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Master Bulk SKU (e.g. 50kg Sack / Case)
                  </label>
                  <select
                    data-testid="repack-master-select"
                    value={masterPid}
                    onChange={(e) => setMasterPid(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                  >
                    <option value="">Select bulk SKU…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.stock} {p.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Target Tingi SKU (e.g. Per Kilo / Per Piece)
                  </label>
                  <select
                    data-testid="repack-target-select"
                    value={targetPid}
                    onChange={(e) => setTargetPid(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                  >
                    <option value="">Select tingi SKU…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.stock} {p.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Yield / 1 Bulk
                  </label>
                  <input
                    type="number"
                    step="any"
                    min={0.01}
                    data-testid="repack-yield-input"
                    value={yieldQtyStr}
                    onChange={(e) => setYieldQtyStr(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-mono-num font-bold"
                  />
                </div>

                <button
                  type="submit"
                  data-testid="repack-create-btn"
                  className="px-4 py-2 min-h-[38px] rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 text-xs font-extrabold cursor-pointer"
                >
                  + Save Rule
                </button>
              </form>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 pt-1">
                <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCost}
                    onChange={(e) => setAutoCost(e.target.checked)}
                  />
                  <span>Auto-update Tingi capital via weighted unit cost average</span>
                </label>
                {selectedMasterProd && previewUnitCost > 0 && (
                  <span className="font-mono-num font-bold text-indigo-700">
                    Derived cost: {formatPeso(previewUnitCost)} / {selectedTargetProd?.unit || 'unit'}
                  </span>
                )}
              </div>
            </div>

            {/* Active Rules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {repackRules.length === 0 ? (
                <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 text-center text-xs text-slate-400">
                  No repack rules saved yet. Add your first bulk-to-tingi conversion above!
                </div>
              ) : (
                repackRules.map((r) => {
                  const m = productById.get(r.masterProductId);
                  const t = productById.get(r.targetProductId);
                  const qtyStr = unpackQtys[r.id] ?? '1';
                  const derived = computeRepackUnitCost(m?.capital, r.yieldQty);
                  return (
                    <div
                      key={r.id}
                      data-testid={`repack-rule-${r.id}`}
                      className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-extrabold text-sm text-slate-900 truncate">{r.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            1 {m?.unit || 'bulk'} <strong>{m?.name || 'Missing SKU'}</strong> →{' '}
                            <strong className="font-mono-num text-indigo-700">{r.yieldQty}</strong>{' '}
                            {t?.unit || 'unit'} <strong>{t?.name || 'Missing SKU'}</strong>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteRepackRule(r.id)}
                          aria-label={`Delete rule ${r.name}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 rounded-xl p-2 border border-slate-100">
                        <div>
                          <span className="text-slate-400 block">Bulk Stock</span>
                          <strong className="font-mono-num text-slate-800">
                            {m ? `${m.stock} ${m.unit}` : '—'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Tingi Stock {derived > 0 ? `(${formatPeso(derived)}/u)` : ''}</span>
                          <strong className="font-mono-num text-emerald-700">
                            {t ? `${t.stock} ${t.unit}` : '—'}
                          </strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold text-slate-600 shrink-0">Unpack:</label>
                        <input
                          type="number"
                          step="any"
                          min={0.1}
                          data-testid={`repack-qty-${r.id}`}
                          value={qtyStr}
                          onChange={(e) =>
                            setUnpackQtys((prev) => ({ ...prev, [r.id]: e.target.value }))
                          }
                          className="w-20 px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-mono-num font-bold text-center"
                        />
                        <button
                          type="button"
                          data-testid={`repack-run-${r.id}`}
                          onClick={() => onRunRepack(r.id, parseFloat(qtyStr) || 0)}
                          className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold cursor-pointer"
                        >
                          Buksan / Unpack (+{((parseFloat(qtyStr) || 0) * r.yieldQty).toFixed(0)} {t?.unit || 'pcs'})
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Repack Log */}
            {repackLogs.length > 0 && (
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">
                  Recent Unpack History
                </div>
                <div className="divide-y divide-slate-100 text-xs max-h-56 overflow-y-auto">
                  {repackLogs.slice(0, 20).map((log) => (
                    <div key={log.id} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-800">{log.masterName}</span> →{' '}
                        <span className="font-bold text-emerald-700">+{log.targetQtyAdded} {log.targetName}</span>
                        <div className="text-[10.5px] text-slate-500">
                          {new Date(log.dateIso).toLocaleString('en-PH')}
                          {log.cashierName ? ` · by ${log.cashierName}` : ''}
                        </div>
                      </div>
                      <span className="font-mono-num text-[11px] font-bold text-slate-600">
                        −{log.masterQtyUsed} bulk · {formatPeso(log.unitCost)}/u
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* SUB-TAB 3: SHIFT FLOAT, CASHIERS & DAILY EXPENSES (GASTOS)       */}
        {/* ================================================================ */}
        {subTab === 'shift' && (
          <div className="space-y-3" data-testid="ops-panel-shift">
            {/* Live Shift & Cash Drawer Reconciliation KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Opening Float</div>
                <div className="font-mono-num font-extrabold text-xl text-slate-900 mt-0.5">
                  {formatPeso(activeShift?.openingFloat ?? 0)}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-0.5 truncate">
                  {activeShift ? `${activeShift.cashierName} (${activeShift.cashierRole})` : 'No active shift started'}
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Expected Drawer Cash</div>
                <div
                  data-testid="shift-expected-cash"
                  className="font-mono-num font-extrabold text-xl text-indigo-700 mt-0.5"
                >
                  {formatPeso(shiftLedger.expectedDrawerCash)}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-0.5 truncate">
                  Cash sales {formatPeso(shiftLedger.cashSales)} · Drops {formatPeso(shiftLedger.cashDrops)}
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Today&apos;s Gastos</div>
                <div
                  data-testid="shift-expenses-total"
                  className="font-mono-num font-extrabold text-xl text-rose-600 mt-0.5"
                >
                  {formatPeso(shiftLedger.expensesTotal)}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                  Top-ups: {formatPeso(shiftLedger.cashTopUps)}
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">True Net Profit</div>
                <div
                  data-testid="shift-true-net-profit"
                  className={`font-mono-num font-extrabold text-xl mt-0.5 ${
                    shiftLedger.trueNetProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {formatPeso(shiftLedger.trueNetProfit)}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-0.5 truncate">
                  Gross {formatPeso(shiftLedger.grossProfit)} + Fees {formatPeso(shiftLedger.serviceFeesTotal)} − Gastos
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Open / Switch Shift & Cashier Accounts */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>Active Cashier &amp; Shift Opening Float</span>
                </h2>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const ok = onOpenShift(shiftCashierId, Math.max(0, parseFloat(shiftFloatStr) || 0), shiftPin);
                    if (ok) setShiftPin('');
                  }}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end bg-slate-50 border border-slate-200 rounded-xl p-3"
                >
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Cashier</label>
                    <select
                      value={shiftCashierId}
                      onChange={(e) => setShiftCashierId(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                    >
                      {cashiers
                        .filter((c) => c.active)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.role})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Opening Float (₱)</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      data-testid="shift-float-input"
                      value={shiftFloatStr}
                      onChange={(e) => setShiftFloatStr(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono-num font-bold"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    {cashiers.find((c) => c.id === shiftCashierId)?.pin && (
                      <input
                        type="password"
                        maxLength={15}
                        placeholder="PIN / Pass"
                        value={shiftPin}
                        onChange={(e) => setShiftPin(e.target.value.slice(0, 15))}
                        className="w-24 px-2 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono-num"
                      />
                    )}
                    <button
                      type="submit"
                      data-testid="start-shift-btn"
                      className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 text-xs font-extrabold cursor-pointer"
                    >
                      {activeShift ? 'Switch Shift' : 'Start Shift'}
                    </button>
                  </div>
                </form>

                {/* Cashier Roster */}
                <div className="space-y-2 pt-1">
                  <div className="text-[11px] font-extrabold text-slate-700 uppercase flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>Cashier Profiles ({cashiers.length})</span>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newCashierName.trim()) {
                        onToast('Enter cashier name', 'warning');
                        return;
                      }
                      onAddCashier({
                        name: newCashierName.trim(),
                        role: newCashierRole,
                        pin: newCashierPin.trim() || undefined,
                      });
                      setNewCashierName('');
                      setNewCashierPin('');
                    }}
                    className="grid grid-cols-1 sm:grid-cols-4 gap-1.5"
                  >
                    <input
                      type="text"
                      placeholder="Cashier Name"
                      value={newCashierName}
                      onChange={(e) => setNewCashierName(e.target.value)}
                      className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                    />
                    <select
                      value={newCashierRole}
                      onChange={(e) => setNewCashierRole(e.target.value as 'cashier' | 'manager')}
                      className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                    >
                      <option value="cashier">Cashier</option>
                      <option value="manager">Manager</option>
                    </select>
                    <div className="flex gap-1">
                      <input
                        type="password"
                        maxLength={15}
                        placeholder="PIN (max 15)"
                        value={newCashierPin}
                        onChange={(e) => setNewCashierPin(e.target.value.slice(0, 15))}
                        className="w-24 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-mono-num"
                      />
                      <button
                        type="submit"
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                      >
                        + Add
                      </button>
                    </div>
                  </form>

                  <div className="divide-y divide-slate-100 text-xs">
                    {cashiers.map((c) => (
                      <div key={c.id} className="py-1.5 flex items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-800">{c.name}</span>
                          <span className="ml-1.5 text-[10px] font-bold uppercase text-slate-500">
                            {c.role}
                            {c.pin ? ' · PIN locked' : ''}
                          </span>
                        </div>
                        {c.id !== 'CSH-OWNER' && (
                          <button
                            type="button"
                            onClick={() => onToggleCashierActive(c.id)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {c.active ? 'Active' : 'Inactive'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Log Daily Expenses (Gastos) / Cash Drops / Top-Ups */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-rose-600" />
                  <span>Log Expense (Gastos), Cash Drop or Top-Up</span>
                </h2>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const amt = parseFloat(eventAmtStr) || 0;
                    if (!(amt > 0)) {
                      onToast('Amount must be greater than ₱0.00', 'warning');
                      return;
                    }
                    onAddDrawerEvent({
                      type: eventType,
                      category:
                        eventType === 'expense'
                          ? eventCategory
                          : eventType === 'drop'
                            ? 'Safe / Owner Drop'
                            : 'Drawer Cash Top-Up',
                      amount: amt,
                      note: eventNote.trim() || undefined,
                    });
                    setEventAmtStr('');
                    setEventNote('');
                  }}
                  className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3"
                >
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'expense', label: 'Expense (Out)' },
                        { id: 'drop', label: 'Cash Drop (Out)' },
                        { id: 'topup', label: 'Top-Up (In)' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setEventType(opt.id)}
                        className={`py-2 px-2 rounded-lg text-[11px] font-extrabold border cursor-pointer ${
                          eventType === opt.id
                            ? 'bg-slate-900 text-emerald-400 border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {eventType === 'expense' && (
                      <select
                        value={eventCategory}
                        onChange={(e) => setEventCategory(e.target.value)}
                        className="px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                      >
                        {EXPENSE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="number"
                      step="0.01"
                      min={0.01}
                      data-testid="drawer-event-amt"
                      placeholder="Amount ₱"
                      value={eventAmtStr}
                      onChange={(e) => setEventAmtStr(e.target.value)}
                      className="px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono-num font-bold"
                    />
                    <input
                      type="text"
                      data-testid="drawer-event-note"
                      placeholder="Description / OR #"
                      value={eventNote}
                      onChange={(e) => setEventNote(e.target.value)}
                      className={`px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs ${
                        eventType === 'expense' ? '' : 'sm:col-span-2'
                      }`}
                    />
                  </div>

                  <button
                    type="submit"
                    data-testid="drawer-event-submit"
                    className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer"
                  >
                    Record {eventType === 'expense' ? 'Expense' : eventType === 'drop' ? 'Cash Drop' : 'Top-Up'}
                  </button>
                </form>

                <div className="divide-y divide-slate-100 text-xs max-h-56 overflow-y-auto">
                  {drawerEvents.length === 0 ? (
                    <div className="py-5 text-center text-slate-400">
                      No expenses, drops, or top-ups logged yet.
                    </div>
                  ) : (
                    drawerEvents.slice(0, 25).map((ev) => (
                      <div key={ev.id} className="py-2 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-800">
                            {ev.category}
                            {ev.note ? ` · ${ev.note}` : ''}
                          </div>
                          <div className="text-[10.5px] text-slate-500">
                            {new Date(ev.dateIso).toLocaleString('en-PH')}
                            {ev.cashierName ? ` · ${ev.cashierName}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono-num font-extrabold ${
                              ev.type === 'topup' ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {ev.type === 'topup' ? '+' : '−'}
                            {formatPeso(ev.amount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeleteDrawerEvent(ev.id)}
                            aria-label="Delete entry"
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SUB-TAB 4: GCASH / MAYA CASH-IN, CASH-OUT & E-LOAD LOG           */}
        {/* ================================================================ */}
        {subTab === 'services' && (
          <div className="space-y-3" data-testid="ops-panel-services">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Today&apos;s Volume</div>
                <div className="font-mono-num font-extrabold text-xl text-slate-900 mt-0.5">
                  {formatPeso(todayServiceSummary.totalVolume)}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                  {todayServiceSummary.count} transaction(s)
                </div>
              </div>
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Service Fees Earned</div>
                <div
                  data-testid="services-fees-today"
                  className="font-mono-num font-extrabold text-xl text-emerald-700 mt-0.5"
                >
                  {formatPeso(todayServiceSummary.totalFees)}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-0.5">Added to Net Profit</div>
              </div>
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Drawer Cash Impact</div>
                <div
                  className={`font-mono-num font-extrabold text-xl mt-0.5 ${
                    todayServiceSummary.cashDrawerImpact >= 0 ? 'text-indigo-700' : 'text-rose-600'
                  }`}
                >
                  {todayServiceSummary.cashDrawerImpact >= 0 ? '+' : ''}
                  {formatPeso(todayServiceSummary.cashDrawerImpact)}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-0.5">Cash-In +Fees −Cash-Out</div>
              </div>
            </div>

            {/* Log E-Wallet / E-Load Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amt = parseFloat(svcAmtStr) || 0;
                const fee = parseFloat(svcFeeStr) || 0;
                if (!(amt > 0)) {
                  onToast('Transaction amount must be greater than ₱0', 'warning');
                  return;
                }
                onAddServiceEntry({
                  kind: svcKind,
                  amount: amt,
                  fee: Math.max(0, fee),
                  customerPhone: svcPhone.trim() || undefined,
                  reference: svcRef.trim() || undefined,
                  note: svcNote.trim() || undefined,
                });
                setSvcAmtStr('');
                setSvcFeeStr('');
                setSvcPhone('');
                setSvcRef('');
                setSvcNote('');
              }}
              className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3"
            >
              <div className="text-xs font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-sky-600" />
                <span>Log GCash / Maya / E-Load / Bills Payment</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5">
                {SERVICE_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    data-testid={`svc-kind-${k.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    onClick={() => {
                      setSvcKind(k);
                      const amt = parseFloat(svcAmtStr) || 0;
                      if (amt > 0) setSvcFeeStr(String(suggestServiceFee(k, amt)));
                    }}
                    className={`py-2 px-2 rounded-xl border text-[11px] font-bold cursor-pointer ${
                      svcKind === k
                        ? 'bg-slate-900 text-emerald-400 border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Amount (₱) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min={1}
                    data-testid="svc-amount-input"
                    value={svcAmtStr}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSvcAmtStr(val);
                      const num = parseFloat(val) || 0;
                      setSvcFeeStr(num > 0 ? String(suggestServiceFee(svcKind, num)) : '');
                    }}
                    placeholder="500.00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono-num font-extrabold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Patong / Fee (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    data-testid="svc-fee-input"
                    value={svcFeeStr}
                    onChange={(e) => setSvcFeeStr(e.target.value)}
                    placeholder="10.00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono-num font-bold text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Mobile / Account #</label>
                  <input
                    type="tel"
                    value={svcPhone}
                    onChange={(e) => setSvcPhone(e.target.value)}
                    placeholder="0917..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Reference #</label>
                  <input
                    type="text"
                    value={svcRef}
                    onChange={(e) => setSvcRef(e.target.value)}
                    placeholder="Ref # (optional)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono-num"
                  />
                </div>
                <button
                  type="submit"
                  data-testid="svc-submit-btn"
                  className="py-2 px-4 min-h-[38px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer"
                >
                  Log Transaction
                </button>
              </div>
            </form>

            {/* Recent Service Transactions */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {serviceEntries.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No GCash, Maya, or E-Load entries logged yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {serviceEntries.slice(0, 40).map((entry) => (
                    <div key={entry.id} className="p-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-extrabold text-slate-900">
                          {entry.kind}
                          {entry.customerPhone ? ` · ${entry.customerPhone}` : ''}
                        </div>
                        <div className="text-[10.5px] text-slate-500">
                          {new Date(entry.dateIso).toLocaleString('en-PH')}
                          {entry.reference ? ` · Ref: ${entry.reference}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right font-mono-num">
                          <div className="font-extrabold text-slate-900">{formatPeso(entry.amount)}</div>
                          <div className="text-[10.5px] font-bold text-emerald-700">
                            Fee: +{formatPeso(entry.fee)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteServiceEntry(entry.id)}
                          aria-label="Delete service entry"
                          className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SUB-TAB 5: BLUETOOTH THERMAL PRINTER & SHELF BARCODE LABELS      */}
        {/* ================================================================ */}
        {subTab === 'printing' && (
          <div className="space-y-3" data-testid="ops-panel-printing">
            {/* Web Bluetooth ESC/POS Thermal Printer Control Card */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                    <Bluetooth className="w-4 h-4 text-indigo-600" />
                    <span>Bluetooth ESC/POS Thermal Printer (58mm / 80mm)</span>
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Pair directly with portable thermal printers (Xprinter, Gprinter, RPP02N) for instant receipt printing &amp; RJ11 cash drawer kick.
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                    btStatus.connected
                      ? 'bg-emerald-100 text-emerald-800'
                      : btSupported
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {btStatus.connected
                    ? `Connected: ${btStatus.deviceName}`
                    : btSupported
                      ? 'Not Connected'
                      : 'Browser lacks Web Bluetooth'}
                </span>
              </div>

              {!btSupported && (
                <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Use Chrome or Edge on Android, Windows, or macOS over HTTPS / localhost to pair Bluetooth printers. Browser Print (USB / PDF) always works on all devices.
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={btBusy}
                  data-testid="bt-connect-btn"
                  onClick={handleBtConnect}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Bluetooth className="w-3.5 h-3.5" />
                  <span>{btStatus.connected ? 'Switch Printer' : 'Pair BT Printer'}</span>
                </button>
                <button
                  type="button"
                  disabled={!btStatus.connected || btBusy}
                  onClick={handleBtTestSlip}
                  className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-800 border border-indigo-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Test Slip</span>
                </button>
                <button
                  type="button"
                  disabled={!btStatus.connected || btBusy}
                  onClick={handleBtKickDrawer}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Kick Cash Drawer</span>
                </button>
                {btStatus.connected && (
                  <button
                    type="button"
                    onClick={() => {
                      disconnectBluetoothPrinter();
                      setBtStatus(getBluetoothPrinterSession());
                      onToast('Bluetooth printer disconnected', 'warning');
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>

            {/* Shelf Price Tags & Barcode Label Generator */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-emerald-600" />
                    <span>Shelf Price Tags &amp; Code-128B Barcode Labels</span>
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Pick SKUs and quantities to print scannable Code-128B shelf tags or product stickers.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={printableLabelsList.length === 0}
                  data-testid="print-shelf-labels-btn"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print {printableLabelsList.length} Label(s)</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={labelSearch}
                    onChange={(e) => setLabelSearch(e.target.value)}
                    placeholder="Filter SKUs to add labels..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
                <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={labelShowBarcode}
                    onChange={(e) => setLabelShowBarcode(e.target.checked)}
                  />
                  <span>Barcode SVG</span>
                </label>
                <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={labelShowWholesale}
                    onChange={(e) => setLabelShowWholesale(e.target.checked)}
                  />
                  <span>Wholesale Tier</span>
                </label>
                <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={labelShowStore}
                    onChange={(e) => setLabelShowStore(e.target.checked)}
                  />
                  <span>Store Name</span>
                </label>
                <button
                  type="button"
                  onClick={() => setLabelQuantities({})}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold cursor-pointer"
                >
                  Clear All
                </button>
              </div>

              {/* Quick SKU Selector Pills */}
              <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {labelCatalogMatches.map((p) => {
                  const q = labelQuantities[p.id] || 0;
                  return (
                    <div
                      key={p.id}
                      className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                        q > 0 ? 'bg-emerald-50/70 border-emerald-300' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate">{p.name}</div>
                        <div className="font-mono-num text-[10px] text-slate-500">
                          {formatPeso(p.retailPrice)} · {p.barcode || p.id}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setLabelQuantities((prev) => ({
                              ...prev,
                              [p.id]: Math.max(0, (prev[p.id] || 0) - 1),
                            }))
                          }
                          className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold cursor-pointer"
                        >
                          −
                        </button>
                        <span className="w-5 text-center font-mono-num font-extrabold">{q}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setLabelQuantities((prev) => ({
                              ...prev,
                              [p.id]: Math.min(20, (prev[p.id] || 0) + 1),
                            }))
                          }
                          className="w-6 h-6 rounded bg-emerald-600 text-white font-bold cursor-pointer"
                        >
                          <Plus className="w-3 h-3 mx-auto" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Printable Sheet Grid */}
              <div className="bg-slate-100 rounded-xl p-3 border border-slate-200 overflow-x-auto">
                <div
                  id="printable-labels"
                  data-testid="printable-labels-grid"
                  className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"
                >
                  {printableLabelsList.map(({ key, product }) => (
                    <div
                      key={key}
                      className="bg-white border border-dashed border-slate-400 rounded-lg p-2.5 flex flex-col justify-between gap-1 text-slate-900"
                    >
                      {labelShowStore && (
                        <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400 truncate">
                          {settings.storeName}
                        </div>
                      )}
                      <div className="font-extrabold text-[11px] leading-tight line-clamp-2">
                        {product.name}
                      </div>
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="font-mono-num font-extrabold text-base text-slate-950">
                          {formatPeso(product.retailPrice)}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">/{product.unit}</span>
                      </div>
                      {labelShowWholesale &&
                        product.wholesalePrice > 0 &&
                        product.wholesalePrice < product.retailPrice && (
                          <div className="text-[9.5px] font-bold text-indigo-700 font-mono-num">
                            WS: {formatPeso(product.wholesalePrice)} ({product.wholesaleMinQty}+ {product.unit})
                          </div>
                        )}
                      {labelShowBarcode && (
                        <BarcodeSvg value={product.barcode || product.id} height={32} className="mt-1" />
                      )}
                    </div>
                  ))}
                  {printableLabelsList.length === 0 && (
                    <div className="col-span-full py-6 text-center text-xs text-slate-400">
                      Add label quantities above to preview printable shelf tags.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
