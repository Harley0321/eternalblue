import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AutoSafetyBackupRepository } from '../data/autoSafetyBackups';
import { POS_STORAGE_WRITE_ERROR_EVENT, PosRepository } from '../data/posRepository';
import { AssistantEngine, type AssistantLang, type ChatMessage, type StorePulse } from '../domain/assistantEngine';
import { analyzeBackupDeviceOrigin } from '../domain/deviceIdentity';
import { GitHubUpdateChecker, type ReleaseInfo } from '../domain/githubUpdateChecker';
import { OpsMath } from '../domain/opsMath';
import { PosMath } from '../domain/posMath';
import { DeviceBridge, type UpdateProgressEvent } from '../hardware/deviceBridge';
import { SecurityManager } from '../security/securityManager';
import { DEFAULT_STORE_SETTINGS } from '../types/pos';
import type {
  ActiveShiftState,
  CartLine,
  CartTotals,
  CashDrawerEvent,
  CashierAccount,
  DeviceIdentityInfo,
  DigitalServiceEntry,
  HeldOrder,
  OperationsSubTab,
  PosBackupPayload,
  PriceType,
  Product,
  RepackLogEntry,
  RepackRule,
  SaleItem,
  SaleRecord,
  SecurityLogEntry,
  StockFilter,
  StockLogEntry,
  StockSort,
  StoreSettings,
  SukiCustomer,
  TabName,
  ToastItem,
  ToastType,
  UtangTransaction,
} from '../types/pos';

export type PinModalMode = 'unlockSettings' | 'setPin' | 'unlockTerminal' | 'unlockVoid' | null;

export interface CrossDeviceRestorePrompt {
  rawJson: string;
  sourceLabel: string;
  exportedAt: string;
  productCount: number;
  saleCount: number;
}

export interface PosUiState {
  activeTab: TabName;
  opsSubTab: OperationsSubTab;
  deviceIdentity: DeviceIdentityInfo;
  products: Product[];
  sales: SaleRecord[];
  heldOrders: HeldOrder[];
  settings: StoreSettings;
  sukiCustomers: SukiCustomer[];
  utangTransactions: UtangTransaction[];
  repackRules: RepackRule[];
  repackLog: RepackLogEntry[];
  drawerEvents: CashDrawerEvent[];
  digitalServices: DigitalServiceEntry[];
  cashiers: CashierAccount[];
  activeShift: ActiveShiftState | null;
  stockLog: StockLogEntry[];
  securityLog: SecurityLogEntry[];
  cart: CartLine[];
  priceMode: PriceType;
  isSeniorPwd: boolean;
  seniorId: string;
  posSearch: string;
  posCategory: string;
  stockSearch: string;
  stockFilter: StockFilter;
  stockSort: StockSort;
  settingsUnlocked: boolean;
  terminalLocked: boolean;
  checkoutOpen: boolean;
  receiptModalSale: SaleRecord | null;
  assistantOpen: boolean;
  assistantLang: AssistantLang;
  assistantMessages: ChatMessage[];
  scannerOpen: boolean;
  scannerTarget: 'pos' | 'inventory' | 'productForm';
  editingProduct: Product | null;
  productModalOpen: boolean;
  productModalScannedBarcode: string;
  stockAdjustProduct: Product | null;
  batchModalOpen: boolean;
  stockLogModalOpen: boolean;
  heldOrdersModalOpen: boolean;
  holdCartModalOpen: boolean;
  voidSaleTarget: SaleRecord | null;
  pendingVoidSale: SaleRecord | null;
  pendingCrossDeviceRestore: CrossDeviceRestorePrompt | null;
  pinModalMode: PinModalMode;
  pinBusy: boolean;
  pinError: string | null;
  pinFailCount: number;
  pinLockoutUntilMs: number;
  scannedProductPromptCode: string | null;
  updateChecking: boolean;
  updateInfo: ReleaseInfo | null;
  updateCheckedAt: string | null;
  updateProgress: UpdateProgressEvent | null;
  installedVersion: { versionName: string; versionCode: number };
  toasts: ToastItem[];
}

export interface CheckoutInput {
  paymentMethod: string;
  tendered: number;
  refNo?: string;
  splitCash?: number;
  splitDigital?: number;
  splitMethod?: string;
  customerId?: string | null;
  utangDueDate?: string | null;
  redeemPoints?: number;
}

interface PosContextValue {
  state: PosUiState;
  productMap: Map<string, Product>;
  cartTotals: CartTotals;
  pinConfigured: boolean;
  storePulse: StorePulse;
  toast: (msg: string, type?: ToastType) => void;
  setActiveTab: (tab: TabName) => void;
  setOpsSubTab: (sub: OperationsSubTab) => void;
  setPosSearch: (q: string) => void;
  setPosCategory: (cat: string) => void;
  setStockSearch: (q: string) => void;
  setStockFilter: (f: StockFilter) => void;
  setStockSort: (s: StockSort) => void;
  togglePriceMode: (mode: PriceType) => void;
  toggleSeniorPwd: (enabled: boolean) => void;
  setSeniorId: (id: string) => void;
  addToCart: (product: Product, qtyDelta?: number) => void;
  updateCartQty: (productId: string, nextQty: number) => void;
  toggleLinePriceType: (productId: string) => void;
  clearCart: () => void;
  setHoldCartOpen: (open: boolean) => void;
  setHeldOrdersOpen: (open: boolean) => void;
  holdCurrentCart: (label: string) => void;
  recallHeldOrder: (order: HeldOrder) => void;
  deleteHeldOrder: (id: string) => void;
  openCheckout: () => void;
  closeCheckout: () => void;
  closeReceipt: () => void;
  openReceipt: (sale: SaleRecord) => void;
  completeCheckout: (input: CheckoutInput) => void;
  openProductModal: (product?: Product | null, prefillBarcode?: string) => void;
  closeProductModal: () => void;
  saveProduct: (p: Product) => void;
  deleteProduct: (id: string) => void;
  openStockAdjust: (p: Product | null) => void;
  applyStockAdjustment: (productId: string, nextStock: number, reason: string, note: string) => void;
  setBatchModalOpen: (open: boolean) => void;
  setStockLogModalOpen: (open: boolean) => void;
  applyBatchStock: (deltas: Record<string, number>, isCycleCount: boolean, note: string) => void;
  openScanner: (target?: 'pos' | 'inventory' | 'productForm') => void;
  closeScanner: () => void;
  dismissScannedPrompt: () => void;
  handleBarcodeDetected: (rawCode: string, keepScannerOpen?: boolean) => void;
  addSukiCustomer: (name: string, phone: string, address: string, limit: number) => void;
  recordUtangPayment: (customerId: string, amount: number, method: string, note: string) => void;
  addRepackRule: (name: string, masterId: string, targetId: string, yieldQty: number) => void;
  runRepackRule: (rule: RepackRule, masterQty: number) => void;
  recordDrawerEvent: (type: string, category: string, amount: number, note: string) => void;
  startShift: (cashier: CashierAccount, openingFloat: number) => void;
  addCashierAccount: (name: string, role: 'owner' | 'cashier') => void;
  deleteCashierAccount: (id: string) => void;
  recordDigitalService: (kind: string, amount: number, fee: number, phone: string, ref: string) => void;
  requestVoidSale: (sale: SaleRecord) => void;
  closeVoidSale: () => void;
  confirmVoidSale: (reason: string) => Promise<void>;
  updateSettings: (mutator: (prev: StoreSettings) => StoreSettings) => void;
  openPinModal: (mode: Exclude<PinModalMode, null>) => void;
  closePinModal: () => void;
  clearPinError: () => void;
  setAdminPin: (pin: string) => Promise<void>;
  verifyAndUnlock: (pin: string, mode: string) => Promise<void>;
  lockTerminalNow: () => void;
  lockSettingsNow: () => void;
  exportBackupJson: () => string;
  importBackupJson: (rawJson: string, forceCrossDeviceConfirm?: boolean) => Promise<void>;
  confirmCrossDeviceRestore: () => Promise<void>;
  cancelCrossDeviceRestore: () => void;
  factoryResetAll: () => Promise<void>;
  setAssistantOpen: (open: boolean) => void;
  setAssistantLang: (lang: AssistantLang) => void;
  askAssistant: (query: string) => void;
  checkForGitHubUpdates: (silent?: boolean, repoOverride?: string) => Promise<void>;
  installAppUpdate: () => void;
  refreshWebApp: () => void;
}

const PosContext = createContext<PosContextValue | null>(null);

function createInitialState(): PosUiState {
  const deviceIdentity = PosRepository.loadDeviceIdentity();
  const products = PosRepository.loadProducts();
  const sales = PosRepository.loadSales();
  const heldOrders = PosRepository.loadHeldOrders();
  const settings = PosRepository.loadSettings();
  const sukiCustomers = PosRepository.loadSukiCustomers();
  const utangTransactions = PosRepository.loadUtangTx();
  const repackRules = PosRepository.loadRepackRules();
  const repackLog = PosRepository.loadRepackLog();
  const drawerEvents = PosRepository.loadDrawerEvents();
  const digitalServices = PosRepository.loadDigitalServices();
  const cashiers = PosRepository.loadCashiers();
  const activeShift = PosRepository.loadActiveShift();
  const stockLog = PosRepository.loadStockLog();
  const securityLog = PosRepository.loadSecurityLog();
  const cartSnap = PosRepository.loadActiveCart();
  const [pinFailCount, pinLockoutUntilMs] = PosRepository.loadPinLockState();
  const pinConf = Boolean(settings.adminPinHash && settings.adminPinHash.trim());
  const welcome = AssistantEngine.welcome('EN');

  return {
    activeTab: 'POS',
    opsSubTab: 'UTANG',
    deviceIdentity,
    products,
    sales,
    heldOrders,
    settings,
    sukiCustomers,
    utangTransactions,
    repackRules,
    repackLog,
    drawerEvents,
    digitalServices,
    cashiers,
    activeShift,
    stockLog,
    securityLog,
    cart: cartSnap.cart,
    priceMode: cartSnap.priceMode,
    isSeniorPwd: cartSnap.isSeniorPwd,
    seniorId: cartSnap.seniorId,
    posSearch: '',
    posCategory: 'All',
    stockSearch: '',
    stockFilter: 'ALL',
    stockSort: 'DEFAULT',
    settingsUnlocked: !pinConf,
    terminalLocked: pinConf && settings.lockWholePos,
    checkoutOpen: false,
    receiptModalSale: null,
    assistantOpen: false,
    assistantLang: 'EN',
    assistantMessages: [{ id: 1, isUser: false, text: welcome.text, metrics: [], chips: welcome.chips }],
    scannerOpen: false,
    scannerTarget: 'pos',
    editingProduct: null,
    productModalOpen: false,
    productModalScannedBarcode: '',
    stockAdjustProduct: null,
    batchModalOpen: false,
    stockLogModalOpen: false,
    heldOrdersModalOpen: false,
    holdCartModalOpen: false,
    voidSaleTarget: null,
    pendingVoidSale: null,
    pendingCrossDeviceRestore: null,
    pinModalMode: null,
    pinBusy: false,
    pinError: null,
    pinFailCount,
    pinLockoutUntilMs,
    scannedProductPromptCode: null,
    updateChecking: false,
    updateInfo: null,
    updateCheckedAt: null,
    updateProgress: null,
    installedVersion: DeviceBridge.getInstalledVersionInfo(),
    toasts: [],
  };
}

export const PosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PosUiState>(createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const checkoutBusyRef = useRef(false);
  const lastBackgroundedAtRef = useRef(0);
  const lastAutoCheckAtRef = useRef(0);
  const lastSafetyBackupErrorAtRef = useRef(0);

  const persistCart = useCallback((next: PosUiState) => {
    PosRepository.saveActiveCart({
      cart: next.cart,
      priceMode: next.priceMode,
      isSeniorPwd: next.isSeniorPwd,
      seniorId: next.seniorId,
    });
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'INFO') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setState((prev) => ({
      ...prev,
      toasts: [...prev.toasts, { id, message, type }].slice(-3),
    }));
    setTimeout(() => {
      setState((prev) => ({
        ...prev,
        toasts: prev.toasts.filter((t) => t.id !== id),
      }));
    }, 2800);
  }, []);

  useEffect(() => {
    const reportStorageWriteError = () =>
      toast('Could not save your latest changes. Free up device storage and export a backup.', 'ERROR');
    window.addEventListener(POS_STORAGE_WRITE_ERROR_EVENT, reportStorageWriteError);
    return () => window.removeEventListener(POS_STORAGE_WRITE_ERROR_EVENT, reportStorageWriteError);
  }, [toast]);

  const productMap = useMemo(() => new Map(state.products.map((p) => [p.id, p])), [state.products]);
  const cartTotals = useMemo(
    () => PosMath.computeCartTotals(state.cart, productMap, state.isSeniorPwd, state.settings),
    [state.cart, productMap, state.isSeniorPwd, state.settings]
  );
  const pinConfigured = Boolean(state.settings.adminPinHash && state.settings.adminPinHash.trim());
  const storePulse = useMemo(
    () => AssistantEngine.computePulse(state.products, state.sales, state.heldOrders, state.settings),
    [state.products, state.sales, state.heldOrders, state.settings]
  );

  const checkForGitHubUpdates = useCallback(
    async (silent = false, repoOverride?: string) => {
      if (DeviceBridge.isMobileOrTablet()) return;
      if (stateRef.current.updateChecking) return;
      const rawRepo = (repoOverride ?? stateRef.current.settings.githubRepo).trim() || 'Harley0321/eternalblue';
      const normalized = GitHubUpdateChecker.normalizeRepoSlug(rawRepo);
      if (normalized !== stateRef.current.settings.githubRepo && normalized.includes('/')) {
        const nextSettings = { ...stateRef.current.settings, githubRepo: normalized };
        PosRepository.saveSettings(nextSettings);
        setState((prev) => ({ ...prev, settings: nextSettings }));
      }
      const installed = DeviceBridge.getInstalledVersionInfo();
      setState((prev) => ({ ...prev, updateChecking: true, installedVersion: installed }));
      const result = await GitHubUpdateChecker.checkLatest(
        normalized,
        installed.versionName,
        installed.versionCode
      );
      const checkedAt = PosMath.formatDateTime(new Date().toISOString());
      setState((prev) => ({
        ...prev,
        updateChecking: false,
        updateInfo: result,
        updateCheckedAt: checkedAt,
      }));
      if (result.isNewer) {
        if (!silent) toast(`Update available: ${result.tagName}`, 'INFO');
      } else if (!silent) {
        const toastType: ToastType =
          result.status === 'ERROR' ? 'ERROR' : result.status === 'NO_RELEASE_APK_YET' ? 'WARNING' : 'INFO';
        toast(result.message, toastType);
      }
    },
    [toast]
  );

  const installAppUpdate = useCallback(() => {
    if (DeviceBridge.isMobileOrTablet()) return;
    const info = stateRef.current.updateInfo;
    if (!info) {
      void checkForGitHubUpdates(false);
      return;
    }
    const apkUrl = info.apkDownloadUrl?.trim();
    if (!apkUrl) {
      DeviceBridge.openExternalUrl(info.htmlUrl);
      return;
    }
    const fileName = info.apkFileName?.trim() || `EternalBlue-POS-${info.tagName || 'update'}.apk`;
    if (DeviceBridge.isAndroidHost()) {
      setState((prev) => ({
        ...prev,
        updateProgress: {
          status: 'DOWNLOADING',
          progress: 1,
          message: `Starting ${fileName} download...`,
        },
      }));
      DeviceBridge.downloadAndInstallAndroidApk(
        apkUrl,
        fileName,
        info.expectedSha256,
        info.manifestUrl
      );
      return;
    }

    DeviceBridge.triggerRemoteDownload(apkUrl, fileName);
    toast(`Downloading ${fileName}...`, 'INFO');
  }, [checkForGitHubUpdates, toast]);

  const refreshWebApp = useCallback(() => {
    if (DeviceBridge.isMobileOrTablet()) return;
    toast('Refreshing latest web version...', 'INFO');
    void DeviceBridge.refreshWebApp();
  }, [toast]);

  useEffect(() => {
    window.__onAndroidUpdateProgress = (ev: UpdateProgressEvent) => {
      setState((prev) => ({ ...prev, updateProgress: ev }));
      if (ev.status === 'ERROR') {
        toast(ev.message, 'ERROR');
      } else if (ev.status === 'PERMISSION_NEEDED') {
        toast(ev.message, 'WARNING');
      } else if (ev.status === 'READY') {
        toast('Update ready — complete installation in Android prompt', 'INFO');
      }
    };
    return () => {
      delete window.__onAndroidUpdateProgress;
    };
  }, [toast]);

  useEffect(() => {
    if (DeviceBridge.isMobileOrTablet()) return;
    lastAutoCheckAtRef.current = Date.now();
    void checkForGitHubUpdates(true);
  }, [checkForGitHubUpdates]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const st = stateRef.current;
      const hasPin = Boolean(st.settings.adminPinHash && st.settings.adminPinHash.trim());
      if (document.hidden) {
        lastBackgroundedAtRef.current = Date.now();
        if (hasPin) {
          setState((prev) => ({ ...prev, settingsUnlocked: false, pendingVoidSale: null }));
        }
      } else {
        const timeoutMin = st.settings.autoLockMinutes;
        if (hasPin && st.settings.lockWholePos && timeoutMin > 0 && lastBackgroundedAtRef.current > 0) {
          const elapsed = Date.now() - lastBackgroundedAtRef.current;
          if (elapsed >= timeoutMin * 60_000) {
            setState((prev) => ({
              ...prev,
              terminalLocked: true,
              settingsUnlocked: false,
              pendingVoidSale: null,
              pinError: null,
            }));
          }
        }
        lastBackgroundedAtRef.current = 0;
        const now = Date.now();
        if (!DeviceBridge.isMobileOrTablet() && now - lastAutoCheckAtRef.current >= 180_000) {
          lastAutoCheckAtRef.current = now;
          void checkForGitHubUpdates(true);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [checkForGitHubUpdates]);

  const setActiveTab = useCallback((activeTab: TabName) => setState((s) => ({ ...s, activeTab })), []);
  const setOpsSubTab = useCallback((opsSubTab: OperationsSubTab) => setState((s) => ({ ...s, opsSubTab })), []);
  const setPosSearch = useCallback((posSearch: string) => setState((s) => ({ ...s, posSearch })), []);
  const setPosCategory = useCallback((posCategory: string) => setState((s) => ({ ...s, posCategory })), []);
  const setStockSearch = useCallback((stockSearch: string) => setState((s) => ({ ...s, stockSearch })), []);
  const setStockFilter = useCallback((stockFilter: StockFilter) => setState((s) => ({ ...s, stockFilter })), []);
  const setStockSort = useCallback((stockSort: StockSort) => setState((s) => ({ ...s, stockSort })), []);

  const togglePriceMode = useCallback(
    (priceMode: PriceType) => {
      setState((prev) => {
        const next: PosUiState = {
          ...prev,
          priceMode,
          cart: prev.cart.map((l) => ({ ...l, priceType: priceMode })),
        };
        persistCart(next);
        return next;
      });
    },
    [persistCart]
  );

  const toggleSeniorPwd = useCallback(
    (isSeniorPwd: boolean) => {
      setState((prev) => {
        const next = { ...prev, isSeniorPwd };
        persistCart(next);
        return next;
      });
    },
    [persistCart]
  );

  const setSeniorId = useCallback(
    (seniorId: string) => {
      setState((prev) => {
        const next = { ...prev, seniorId };
        persistCart(next);
        return next;
      });
    },
    [persistCart]
  );

  const addToCart = useCallback(
    (product: Product, qtyDelta = 1) => {
      if (!Number.isFinite(qtyDelta) || qtyDelta <= 0) return;
      if (product.stock <= 0.0001) {
        toast(`${product.name} is out of stock.`, 'WARNING');
        return;
      }
      if (stateRef.current.settings.beep) DeviceBridge.playBeep();
      setState((prev) => {
        const existing = prev.cart.find((c) => c.productId === product.id);
        const nextCart = existing
          ? prev.cart.map((c) =>
              c.productId === product.id
                ? { ...c, qty: PosMath.round3(Math.min(product.stock, PosMath.round3(c.qty + qtyDelta))) }
                : c
            )
          : [
              ...prev.cart,
              {
                productId: product.id,
                name: product.name,
                unit: product.unit,
                retailPrice: product.retailPrice,
                wholesalePrice: product.wholesalePrice,
                wholesaleMinQty: product.wholesaleMinQty,
                priceType: prev.priceMode,
                qty: PosMath.round3(Math.min(product.stock, qtyDelta)),
              },
            ];
        const next = { ...prev, cart: nextCart };
        persistCart(next);
        return next;
      });
    },
    [persistCart, toast]
  );

  const updateCartQty = useCallback(
    (productId: string, nextQty: number) => {
      setState((prev) => {
        const p = prev.products.find((pr) => pr.id === productId);
        const maxStock = p?.stock ?? 99999;
        const clean = PosMath.round3(nextQty);
        const nextCart =
          clean <= 0
            ? prev.cart.filter((l) => l.productId !== productId)
            : prev.cart.map((l) =>
                l.productId === productId ? { ...l, qty: PosMath.round3(Math.min(maxStock, clean)) } : l
              );
        const next = { ...prev, cart: nextCart };
        persistCart(next);
        return next;
      });
    },
    [persistCart]
  );

  const toggleLinePriceType = useCallback(
    (productId: string) => {
      setState((prev) => {
        const nextCart = prev.cart.map((l) =>
          l.productId === productId
            ? { ...l, priceType: (l.priceType === 'retail' ? 'wholesale' : 'retail') as PriceType }
            : l
        );
        const next = { ...prev, cart: nextCart };
        persistCart(next);
        return next;
      });
    },
    [persistCart]
  );

  const clearCart = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, cart: [], isSeniorPwd: false, seniorId: '' };
      persistCart(next);
      return next;
    });
  }, [persistCart]);

  const setHoldCartOpen = useCallback((open: boolean) => setState((s) => ({ ...s, holdCartModalOpen: open })), []);
  const setHeldOrdersOpen = useCallback((open: boolean) => setState((s) => ({ ...s, heldOrdersModalOpen: open })), []);

  const holdCurrentCart = useCallback(
    (label: string) => {
      const st = stateRef.current;
      if (st.cart.length === 0) return;
      const pMap = new Map(st.products.map((p) => [p.id, p]));
      const totals = PosMath.computeCartTotals(st.cart, pMap, st.isSeniorPwd, st.settings);
      const order: HeldOrder = {
        id: `HOLD-${Date.now()}`,
        label: label.trim() || `Customer #${st.heldOrders.length + 1}`,
        time: PosMath.formatDateTime(new Date().toISOString()),
        items: st.cart,
        total: totals.grandTotal,
        isSeniorPwd: st.isSeniorPwd,
        priceMode: st.priceMode,
      };
      const nextHeld = [order, ...st.heldOrders];
      PosRepository.saveHeldOrders(nextHeld);
      setState((prev) => {
        const next: PosUiState = {
          ...prev,
          heldOrders: nextHeld,
          cart: [],
          isSeniorPwd: false,
          seniorId: '',
          holdCartModalOpen: false,
        };
        persistCart(next);
        return next;
      });
      toast(`Order parked (${order.label})`);
    },
    [persistCart, toast]
  );

  const recallHeldOrder = useCallback(
    (order: HeldOrder) => {
      const st = stateRef.current;
      const nextHeld = st.heldOrders.filter((h) => h.id !== order.id);
      PosRepository.saveHeldOrders(nextHeld);
      setState((prev) => {
        const next: PosUiState = {
          ...prev,
          heldOrders: nextHeld,
          cart: order.items,
          isSeniorPwd: order.isSeniorPwd ?? false,
          priceMode: order.priceMode ?? 'retail',
          heldOrdersModalOpen: false,
          activeTab: 'POS',
        };
        persistCart(next);
        return next;
      });
      toast(`Recalled ${order.label || order.id}`);
    },
    [persistCart, toast]
  );

  const deleteHeldOrder = useCallback((id: string) => {
    const next = stateRef.current.heldOrders.filter((h) => h.id !== id);
    PosRepository.saveHeldOrders(next);
    setState((prev) => ({ ...prev, heldOrders: next }));
  }, []);

  const openCheckout = useCallback(() => {
    if (stateRef.current.cart.length === 0) {
      toast('Cart is empty', 'WARNING');
      return;
    }
    setState((s) => ({ ...s, checkoutOpen: true }));
  }, [toast]);

  const closeCheckout = useCallback(() => setState((s) => ({ ...s, checkoutOpen: false })), []);
  const closeReceipt = useCallback(() => setState((s) => ({ ...s, receiptModalSale: null })), []);
  const openReceipt = useCallback((sale: SaleRecord) => setState((s) => ({ ...s, receiptModalSale: sale })), []);

  const completeCheckout = useCallback(
    (input: CheckoutInput) => {
      const st = stateRef.current;
      if (checkoutBusyRef.current || st.cart.length === 0) return;
      checkoutBusyRef.current = true;
      try {
        const {
          paymentMethod,
          tendered,
          refNo = '',
          splitCash = 0,
          splitDigital = 0,
          splitMethod = 'GCash',
          customerId = null,
          utangDueDate = null,
          redeemPoints = 0,
        } = input;

        const map = new Map(st.products.map((p) => [p.id, p]));
        const totals = PosMath.computeCartTotals(st.cart, map, st.isSeniorPwd, st.settings);
        const suki = customerId ? st.sukiCustomers.find((c) => c.id === customerId) : undefined;
        const pointVal = st.settings.loyaltyPointValue > 0 ? st.settings.loyaltyPointValue : 1;
        const pointValC = PosMath.toCents(pointVal);
        const grandC = PosMath.toCents(totals.grandTotal);
        const maxRedeemable = pointValC > 0 ? Math.floor(grandC / pointValC) : 0;
        const usedPoints =
          suki && redeemPoints > 0 && paymentMethod !== 'Utang'
            ? Math.min(Math.floor(redeemPoints), suki.points, maxRedeemable)
            : 0;
        const pointsDiscountC = Math.min(grandC, usedPoints * pointValC);
        const pointsDiscount = PosMath.fromCents(pointsDiscountC);
        const payableC = Math.max(0, grandC - pointsDiscountC);
        const payable = PosMath.fromCents(payableC);

        if (!Number.isFinite(payable)) {
          toast('Invalid checkout total', 'ERROR');
          return;
        }
        const tenderedC = PosMath.toCents(tendered);
        if (paymentMethod === 'Cash' && (!Number.isFinite(tendered) || tenderedC < payableC)) {
          toast('Insufficient cash tendered', 'ERROR');
          return;
        }
        const splitCashC = PosMath.toCents(splitCash);
        const splitDigitalC = PosMath.toCents(splitDigital);
        if (paymentMethod === 'Split') {
          const splitValid =
            Number.isFinite(splitCash) &&
            Number.isFinite(splitDigital) &&
            splitCashC >= 0 &&
            splitDigitalC >= 0 &&
            splitCashC + splitDigitalC === payableC;
          if (!splitValid) {
            toast(`Split amounts must be non-negative and equal ${PosMath.formatPeso(payable)}`, 'ERROR');
            return;
          }
        }
        if (paymentMethod === 'Utang' && !suki) {
          toast('Select a Suki customer for Utang checkout', 'ERROR');
          return;
        }

        const receiptNo = PosMath.nextReceiptNo(st.sales);
        const nowIso = new Date().toISOString();
        const saleItems: SaleItem[] = st.cart.map((line) => {
          const p = map.get(line.productId);
          const unitPrice = PosMath.getLinePrice(line, map);
          return {
            productId: line.productId,
            category: p?.category ?? null,
            name: line.name,
            qty: PosMath.round3(line.qty),
            unit: line.unit,
            unitPrice,
            priceType: PosMath.isWholesaleLine(line, map) ? 'wholesale' : 'retail',
            capital: p?.capital ?? null,
            lineTotal: PosMath.lineTotalPeso(unitPrice, line.qty),
          };
        });

        let nextCustomers = st.sukiCustomers;
        let nextUtang = st.utangTransactions;
        const earnedPoints =
          suki && paymentMethod !== 'Utang'
            ? OpsMath.computeLoyaltyPointsEarned(payable, st.settings.loyaltyPesoPerPoint)
            : 0;

        if (suki) {
          let updatedSuki: SukiCustomer = {
            ...suki,
            points: Math.max(0, suki.points - usedPoints + earnedPoints),
            totalSpent:
              paymentMethod !== 'Utang'
                ? PosMath.fromCents(PosMath.toCents(suki.totalSpent) + payableC)
                : suki.totalSpent,
            updatedAt: nowIso,
          };
          if (paymentMethod === 'Utang') {
            const res = OpsMath.applyUtangCharge(
              updatedSuki,
              payable,
              receiptNo,
              utangDueDate,
              null,
              st.activeShift?.cashierName ?? null
            );
            if (!res.ok) {
              toast(res.error, 'ERROR');
              return;
            }
            updatedSuki = res.customer;
            nextUtang = [res.tx, ...nextUtang];
          }
          nextCustomers = nextCustomers.map((c) => (c.id === updatedSuki.id ? updatedSuki : c));
        }

        const cleanTendered = paymentMethod === 'Cash' ? PosMath.fromCents(tenderedC) : payable;
        const change =
          paymentMethod === 'Cash' ? PosMath.fromCents(Math.max(0, tenderedC - payableC)) : 0;

        const sale: SaleRecord = {
          receiptNo,
          dateIso: nowIso,
          dateFormatted: PosMath.formatDateTime(nowIso),
          items: saleItems,
          retailSubtotal: totals.retailSubtotal,
          wholesaleSavings: totals.wholesaleSavings,
          seniorDiscount: totals.seniorDiscount,
          grandTotal: payable,
          paymentMethod,
          tendered: cleanTendered,
          change,
          refNo: refNo.trim() || null,
          splitDetails:
            paymentMethod === 'Split'
              ? {
                  cash: PosMath.fromCents(splitCashC),
                  digital: PosMath.fromCents(splitDigitalC),
                  digitalMethod: splitMethod,
                }
              : null,
          seniorId: totals.isSeniorPwd ? st.seniorId.trim() || null : null,
          seniorBase: totals.isSeniorPwd ? totals.seniorBase : null,
          seniorCapped: totals.isSeniorPwd ? totals.seniorCapped : null,
          customerId: suki?.id ?? null,
          customerName: suki?.name ?? null,
          pointsEarned: earnedPoints > 0 ? earnedPoints : null,
          pointsRedeemed: usedPoints > 0 ? usedPoints : null,
          pointsDiscount: pointsDiscount > 0 ? pointsDiscount : null,
          utangDueDate: paymentMethod === 'Utang' && utangDueDate?.trim() ? utangDueDate.trim() : null,
          cashierName: st.activeShift?.cashierName ?? null,
          shiftId: st.activeShift?.shiftId ?? null,
        };

        const qtyByPid = new Map(st.cart.map((c) => [c.productId, c.qty]));
        const nextProducts = st.products.map((p) => {
          const sold = qtyByPid.get(p.id) ?? 0;
          return sold > 0
            ? { ...p, stock: Math.max(0, PosMath.round3(p.stock - sold)), updatedAt: nowIso }
            : p;
        });
        const nextSales = [sale, ...st.sales];

        PosRepository.saveProducts(nextProducts);
        PosRepository.saveSales(nextSales);
        PosRepository.saveSukiCustomers(nextCustomers);
        PosRepository.saveUtangTx(nextUtang);

        setState((prev) => {
          const next: PosUiState = {
            ...prev,
            products: nextProducts,
            sales: nextSales,
            sukiCustomers: nextCustomers,
            utangTransactions: nextUtang,
            cart: [],
            isSeniorPwd: false,
            seniorId: '',
            checkoutOpen: false,
            receiptModalSale: sale,
          };
          persistCart(next);
          return next;
        });
        toast(`Sale completed: ${receiptNo}`);
      } finally {
        checkoutBusyRef.current = false;
      }
    },
    [persistCart, toast]
  );

  const openProductModal = useCallback((product: Product | null = null, prefillBarcode = '') => {
    setState((s) => ({
      ...s,
      editingProduct: product,
      productModalOpen: true,
      productModalScannedBarcode: prefillBarcode,
    }));
  }, []);

  const closeProductModal = useCallback(() => {
    setState((s) => ({ ...s, productModalOpen: false, editingProduct: null, productModalScannedBarcode: '' }));
  }, []);

  const saveProduct = useCallback(
    (p: Product) => {
      const st = stateRef.current;
      const now = new Date().toISOString();
      const withTime: Product = { ...p, updatedAt: now };
      const exists = st.products.some((item) => item.id === withTime.id);
      const next = exists
        ? st.products.map((item) => (item.id === withTime.id ? withTime : item))
        : [withTime, ...st.products];
      PosRepository.saveProducts(next);
      setState((prev) => ({ ...prev, products: next, productModalOpen: false, editingProduct: null }));
      toast(exists ? `Updated ${p.name}` : `Added ${p.name}`);
    },
    [toast]
  );

  const deleteProduct = useCallback(
    (id: string) => {
      const st = stateRef.current;
      const hasPin = Boolean(st.settings.adminPinHash && st.settings.adminPinHash.trim());
      if (hasPin && !st.settingsUnlocked) {
        setState((s) => ({ ...s, pinModalMode: 'unlockSettings', pinError: null }));
        toast('Unlock Settings with Manager PIN to delete products', 'WARNING');
        return;
      }
      const next = st.products.filter((p) => p.id !== id);
      PosRepository.saveProducts(next);
      setState((prev) => ({ ...prev, products: next, productModalOpen: false, editingProduct: null }));
      toast('Product deleted');
    },
    [toast]
  );

  const openStockAdjust = useCallback((p: Product | null) => setState((s) => ({ ...s, stockAdjustProduct: p })), []);

  const applyStockAdjustment = useCallback(
    (productId: string, nextStock: number, reason: string, note: string) => {
      const st = stateRef.current;
      const target = st.products.find((p) => p.id === productId);
      if (!target) return;
      const cleanNext = Math.max(0, PosMath.round3(nextStock));
      const delta = PosMath.round3(cleanNext - target.stock);
      const now = new Date().toISOString();
      const nextProducts = st.products.map((p) =>
        p.id === productId ? { ...p, stock: cleanNext, updatedAt: now } : p
      );
      const log: StockLogEntry = {
        id: `LOG-${Date.now()}`,
        dateIso: now,
        productId: target.id,
        productName: target.name,
        delta,
        prevStock: target.stock,
        newStock: cleanNext,
        reason,
        note: note.trim() || null,
      };
      const nextLogs = [log, ...st.stockLog].slice(0, 300);
      PosRepository.saveProducts(nextProducts);
      PosRepository.saveStockLog(nextLogs);
      setState((prev) => ({
        ...prev,
        products: nextProducts,
        stockLog: nextLogs,
        stockAdjustProduct: null,
      }));
      toast(`Stock updated for ${target.name}`);
    },
    [toast]
  );

  const setBatchModalOpen = useCallback((open: boolean) => setState((s) => ({ ...s, batchModalOpen: open })), []);
  const setStockLogModalOpen = useCallback((open: boolean) => setState((s) => ({ ...s, stockLogModalOpen: open })), []);

  const applyBatchStock = useCallback(
    (deltas: Record<string, number>, isCycleCount: boolean, note: string) => {
      const st = stateRef.current;
      const now = new Date().toISOString();
      const logs: StockLogEntry[] = [];
      const nextProducts = st.products.map((p) => {
        const v = deltas[p.id];
        if (v === undefined || !Number.isFinite(v)) return p;
        const newStock = isCycleCount ? Math.max(0, PosMath.round3(v)) : Math.max(0, PosMath.round3(p.stock + v));
        const delta = PosMath.round3(newStock - p.stock);
        if (delta !== 0) {
          logs.push({
            id: `LOG-${Date.now()}-${p.id}`,
            dateIso: now,
            productId: p.id,
            productName: p.name,
            delta,
            prevStock: p.stock,
            newStock,
            reason: isCycleCount ? 'Cycle Count' : 'Batch Receive',
            note: note.trim() || null,
          });
        }
        return { ...p, stock: newStock, updatedAt: now };
      });
      const nextLogs = [...logs, ...st.stockLog].slice(0, 300);
      PosRepository.saveProducts(nextProducts);
      PosRepository.saveStockLog(nextLogs);
      setState((prev) => ({ ...prev, products: nextProducts, stockLog: nextLogs, batchModalOpen: false }));
      toast(`Batch updated ${logs.length} SKUs`);
    },
    [toast]
  );

  const openScanner = useCallback(
    (scannerTarget: 'pos' | 'inventory' | 'productForm' = 'pos') =>
      setState((s) => ({ ...s, scannerOpen: true, scannerTarget })),
    []
  );
  const closeScanner = useCallback(() => setState((s) => ({ ...s, scannerOpen: false })), []);
  const dismissScannedPrompt = useCallback(() => setState((s) => ({ ...s, scannedProductPromptCode: null })), []);

  const handleBarcodeDetected = useCallback(
    (rawCode: string, keepScannerOpen = false) => {
      const clean = rawCode.trim();
      if (!clean) return;
      const st = stateRef.current;
      if (st.settings.vibrateOnScan) DeviceBridge.vibrateOnScan();
      if (st.scannerTarget === 'productForm') {
        setState((s) => ({ ...s, scannerOpen: false, productModalScannedBarcode: clean }));
        toast(`Barcode captured: ${clean}`);
        return;
      }
      const match = st.products.find((p) => p.barcode.toLowerCase() === clean.toLowerCase());
      if (match) {
        if (st.scannerTarget === 'inventory') {
          setState((s) => ({ ...s, scannerOpen: false, stockSearch: clean, activeTab: 'INVENTORY' }));
          toast(`Found ${match.name}`);
        } else {
          if (!keepScannerOpen) {
            setState((s) => ({ ...s, scannerOpen: false }));
          }
          addToCart(match, 1);
          toast(`Added ${match.name}`);
        }
      } else {
        setState((s) => ({ ...s, scannerOpen: false, scannedProductPromptCode: clean }));
      }
    },
    [addToCart, toast]
  );

  const addSukiCustomer = useCallback(
    (name: string, phone: string, address: string, limit: number) => {
      const clean = name.trim();
      if (!clean) return;
      const now = new Date().toISOString();
      const c: SukiCustomer = {
        id: `suki-${Date.now()}`,
        name: clean,
        phone: phone.trim() || null,
        address: address.trim() || null,
        creditLimit: Math.max(0, limit),
        balance: 0,
        dueDate: null,
        points: 0,
        totalSpent: 0,
        createdAt: now,
        updatedAt: now,
      };
      const next = [c, ...stateRef.current.sukiCustomers];
      PosRepository.saveSukiCustomers(next);
      setState((s) => ({ ...s, sukiCustomers: next }));
      toast(`Added Suki: ${clean}`);
    },
    [toast]
  );

  const recordUtangPayment = useCallback(
    (customerId: string, amount: number, method: string, note: string) => {
      const st = stateRef.current;
      const c = st.sukiCustomers.find((sc) => sc.id === customerId);
      if (!c) return;
      const res = OpsMath.applyUtangPayment(
        c,
        amount,
        method,
        note.trim() || null,
        st.activeShift?.cashierName ?? null
      );
      if (!res.ok) {
        toast(res.error, 'ERROR');
        return;
      }
      const nextCust = st.sukiCustomers.map((sc) => (sc.id === c.id ? res.customer : sc));
      const nextTx = [res.tx, ...st.utangTransactions];
      PosRepository.saveSukiCustomers(nextCust);
      PosRepository.saveUtangTx(nextTx);
      setState((s) => ({ ...s, sukiCustomers: nextCust, utangTransactions: nextTx }));
      toast(`Recorded ${PosMath.formatPeso(res.tx.amount)} payment for ${c.name}`);
    },
    [toast]
  );

  const addRepackRule = useCallback(
    (name: string, masterId: string, targetId: string, yieldQty: number) => {
      const cleanYield = PosMath.round3(yieldQty);
      if (masterId === targetId || cleanYield <= 0) {
        toast('Select distinct SKUs and yield > 0', 'WARNING');
        return;
      }
      const rule: RepackRule = {
        id: `rpk-${Date.now()}`,
        name: name.trim() || 'Bulk → Tingi Repack',
        masterProductId: masterId,
        targetProductId: targetId,
        yieldQty: cleanYield,
        autoComputeCost: true,
        updatedAt: new Date().toISOString(),
      };
      const next = [rule, ...stateRef.current.repackRules];
      PosRepository.saveRepackRules(next);
      setState((s) => ({ ...s, repackRules: next }));
      toast('Repack rule saved');
    },
    [toast]
  );

  const runRepackRule = useCallback(
    (rule: RepackRule, masterQty: number) => {
      const st = stateRef.current;
      const res = OpsMath.executeRepackConversion(
        st.products,
        rule,
        masterQty,
        st.activeShift?.cashierName ?? null
      );
      if (!res.ok) {
        toast(res.error, 'ERROR');
        return;
      }
      const nextLogs = [...res.stockLogs, ...st.stockLog].slice(0, 300);
      const nextRepackLogs = [res.repackLog, ...st.repackLog].slice(0, 150);
      PosRepository.saveProducts(res.nextProducts);
      PosRepository.saveStockLog(nextLogs);
      PosRepository.saveRepackLog(nextRepackLogs);
      setState((s) => ({
        ...s,
        products: res.nextProducts,
        stockLog: nextLogs,
        repackLog: nextRepackLogs,
      }));
      toast(`Unpacked ${PosMath.formatQty(masterQty)} → +${PosMath.formatQty(res.repackLog.targetQtyAdded)}`);
    },
    [toast]
  );

  const recordDrawerEvent = useCallback(
    (type: string, category: string, amount: number, note: string) => {
      if (amount <= 0) return;
      const st = stateRef.current;
      const ev: CashDrawerEvent = {
        id: `DRW-${Date.now()}`,
        dateIso: new Date().toISOString(),
        type,
        category: category.trim() || type.toUpperCase(),
        amount: PosMath.round2(amount),
        note: note.trim() || null,
        cashierName: st.activeShift?.cashierName ?? null,
        shiftId: st.activeShift?.shiftId ?? null,
      };
      const next = [ev, ...st.drawerEvents].slice(0, 250);
      PosRepository.saveDrawerEvents(next);
      setState((s) => ({ ...s, drawerEvents: next }));
      toast(`Recorded ${PosMath.formatPeso(ev.amount)} (${type})`);
    },
    [toast]
  );

  const startShift = useCallback(
    (cashier: CashierAccount, openingFloat: number) => {
      const cleanFloat = Math.max(0, PosMath.round2(openingFloat));
      const shift: ActiveShiftState = {
        shiftId: `SHIFT-${Date.now()}`,
        cashierId: cashier.id,
        cashierName: cashier.name,
        cashierRole: cashier.role,
        openedAt: new Date().toISOString(),
        openingFloat: cleanFloat,
      };
      PosRepository.saveActiveShift(shift);
      setState((s) => ({ ...s, activeShift: shift }));
      if (cleanFloat > 0) {
        recordDrawerEvent('float', 'Opening Float', cleanFloat, `Shift opened by ${cashier.name}`);
      } else {
        toast(`Shift active: ${cashier.name}`);
      }
    },
    [recordDrawerEvent, toast]
  );

  const addCashierAccount = useCallback(
    (name: string, role: 'owner' | 'cashier') => {
      const clean = name.trim();
      if (!clean) {
        toast('Enter an Owner or Cashier name', 'WARNING');
        return;
      }
      const st = stateRef.current;
      const duplicate = st.cashiers.some(
        (c) => c.name.trim().toLowerCase() === clean.toLowerCase()
      );
      if (duplicate) {
        toast(`"${clean}" already exists`, 'WARNING');
        return;
      }
      const account: CashierAccount = {
        id: `cashier-${role}-${Date.now()}`,
        name: clean,
        role: role === 'owner' ? 'owner' : 'cashier',
        active: true,
        createdAt: new Date().toISOString(),
      };
      const next = [...st.cashiers, account];
      PosRepository.saveCashiers(next);
      setState((s) => ({ ...s, cashiers: next }));
      toast(`Added ${role === 'owner' ? 'Owner' : 'Cashier'}: ${clean}`);
    },
    [toast]
  );

  const deleteCashierAccount = useCallback(
    (id: string) => {
      const st = stateRef.current;
      if (st.cashiers.length <= 1) {
        toast('At least one Owner or Cashier is required', 'WARNING');
        return;
      }
      const target = st.cashiers.find((c) => c.id === id);
      if (!target) return;
      const next = st.cashiers.filter((c) => c.id !== id);
      PosRepository.saveCashiers(next);

      let nextShift = st.activeShift;
      if (st.activeShift?.cashierId === id) {
        const fallback = next[0];
        nextShift = fallback
          ? {
              shiftId: `SHIFT-${Date.now()}`,
              cashierId: fallback.id,
              cashierName: fallback.name,
              cashierRole: fallback.role,
              openedAt: new Date().toISOString(),
              openingFloat: st.activeShift.openingFloat,
            }
          : null;
        PosRepository.saveActiveShift(nextShift);
      }

      setState((s) => ({ ...s, cashiers: next, activeShift: nextShift }));
      toast(`Deleted ${target.name}`);
    },
    [toast]
  );

  const recordDigitalService = useCallback(
    (kind: string, amount: number, fee: number, phone: string, ref: string) => {
      if (amount <= 0) {
        toast('Amount must be > ₱0.00', 'WARNING');
        return;
      }
      const entry: DigitalServiceEntry = {
        id: `DIG-${Date.now()}`,
        dateIso: new Date().toISOString(),
        kind,
        amount: PosMath.round2(amount),
        fee: PosMath.round2(fee),
        reference: ref.trim() || null,
        customerPhone: phone.trim() || null,
        cashierName: stateRef.current.activeShift?.cashierName ?? null,
      };
      const next = [entry, ...stateRef.current.digitalServices].slice(0, 250);
      PosRepository.saveDigitalServices(next);
      setState((s) => ({ ...s, digitalServices: next }));
      toast(`Logged ${kind} ${PosMath.formatPeso(entry.amount)} (+${PosMath.formatPeso(entry.fee)} fee)`);
    },
    [toast]
  );

  const requestVoidSale = useCallback((sale: SaleRecord) => {
    const st = stateRef.current;
    const hasPin = Boolean(st.settings.adminPinHash && st.settings.adminPinHash.trim());
    if (hasPin && !st.settingsUnlocked) {
      setState((s) => ({ ...s, pendingVoidSale: sale, pinModalMode: 'unlockVoid', pinError: null }));
    } else {
      setState((s) => ({ ...s, voidSaleTarget: sale }));
    }
  }, []);

  const closeVoidSale = useCallback(() => setState((s) => ({ ...s, voidSaleTarget: null, pendingVoidSale: null })), []);

  const confirmVoidSale = useCallback(
    async (reason: string) => {
      const st = stateRef.current;
      const target = st.voidSaleTarget;
      if (!target || target.voided === true) return;
      const hasPin = Boolean(st.settings.adminPinHash && st.settings.adminPinHash.trim());
      if (hasPin && !st.settingsUnlocked) {
        requestVoidSale(target);
        return;
      }
      const now = new Date().toISOString();
      const restoreQtyMilli: Record<string, number> = {};
      for (const it of target.items) {
        if (it.productId) {
          restoreQtyMilli[it.productId] = (restoreQtyMilli[it.productId] ?? 0) + PosMath.toMilli(it.qty);
        }
      }
      const voidStockLogs: StockLogEntry[] = [];
      const nextProducts = st.products.map((p) => {
        const addMilli = restoreQtyMilli[p.id] ?? 0;
        if (addMilli <= 0) return p;
        const add = PosMath.fromMilli(addMilli);
        const newStock = PosMath.fromMilli(PosMath.toMilli(p.stock) + addMilli);
        voidStockLogs.push({
          id: `LOG-${Date.now()}-${p.id}`,
          dateIso: now,
          productId: p.id,
          productName: p.name,
          delta: add,
          prevStock: p.stock,
          newStock,
          reason: 'Sale Void',
          note: `Voided ${target.receiptNo}${reason.trim() ? ` (${reason.trim()})` : ''}`,
        });
        return { ...p, stock: newStock, updatedAt: now };
      });
      const nextLogs = [...voidStockLogs, ...st.stockLog].slice(0, 300);

      const nextSales = st.sales.map((s) =>
        s.receiptNo === target.receiptNo
          ? { ...s, voided: true, voidedAt: now, voidReason: reason.trim() || 'Voided by manager' }
          : s
      );

      let nextCustomers = st.sukiCustomers;
      let nextUtang = st.utangTransactions;
      if (target.customerId) {
        const suki = st.sukiCustomers.find((c) => c.id === target.customerId);
        if (suki) {
          const grandC = PosMath.toCents(target.grandTotal);
          const nextPoints = Math.max(0, suki.points - (target.pointsEarned ?? 0) + (target.pointsRedeemed ?? 0));
          const nextSpent = PosMath.fromCents(Math.max(0, PosMath.toCents(suki.totalSpent) - grandC));
          let nextBal = suki.balance;
          let nextDueDate = suki.dueDate;
          if (target.paymentMethod.toLowerCase() === 'utang') {
            const curBalC = PosMath.toCents(suki.balance);
            const revC = Math.min(curBalC, grandC);
            const nextBalC = Math.max(0, curBalC - revC);
            nextBal = PosMath.fromCents(nextBalC);
            if (nextBalC <= 0) nextDueDate = null;
            if (revC > 0) {
              nextUtang = [
                {
                  id: `UVD-${Date.now()}`,
                  customerId: suki.id,
                  customerName: suki.name,
                  type: 'payment',
                  amount: PosMath.fromCents(revC),
                  balanceAfter: nextBal,
                  receiptNo: target.receiptNo,
                  paymentMethod: 'Void Reversal',
                  note: `Voided ${target.receiptNo}`,
                  dateIso: now,
                  cashierName: st.activeShift?.cashierName ?? null,
                },
                ...nextUtang,
              ];
            }
          }
          nextCustomers = st.sukiCustomers.map((c) =>
            c.id === suki.id
              ? {
                  ...c,
                  points: nextPoints,
                  totalSpent: nextSpent,
                  balance: nextBal,
                  dueDate: nextDueDate,
                  updatedAt: now,
                }
              : c
          );
        }
      }

      const secLog = await SecurityManager.appendSecurityEvent(
        st.securityLog,
        'SALE_VOIDED',
        'warning',
        `Voided ${target.receiptNo}: ${reason}`
      );
      PosRepository.saveProducts(nextProducts);
      PosRepository.saveStockLog(nextLogs);
      PosRepository.saveSales(nextSales);
      PosRepository.saveSukiCustomers(nextCustomers);
      PosRepository.saveUtangTx(nextUtang);
      PosRepository.saveSecurityLog(secLog);
      setState((s) => ({
        ...s,
        products: nextProducts,
        stockLog: nextLogs,
        sales: nextSales,
        sukiCustomers: nextCustomers,
        utangTransactions: nextUtang,
        securityLog: secLog,
        voidSaleTarget: null,
        receiptModalSale: null,
      }));
      toast(`Voided ${target.receiptNo} & restored stock`);
    },
    [requestVoidSale, toast]
  );

  const updateSettings = useCallback(
    (mutator: (prev: StoreSettings) => StoreSettings) => {
      const prev = stateRef.current.settings;
      const candidate = mutator(prev);
      const safeStoreName =
        candidate.storeName.trim() ||
        prev.storeName.trim() ||
        PosRepository.loadPinnedStoreName() ||
        'EternalBlue Mart';
      const next = safeStoreName !== candidate.storeName ? { ...candidate, storeName: safeStoreName } : candidate;
      PosRepository.saveSettings(next);
      setState((s) => ({ ...s, settings: next }));
      toast('Settings saved');
    },
    [toast]
  );

  const openPinModal = useCallback(
    (mode: Exclude<PinModalMode, null>) => setState((s) => ({ ...s, pinModalMode: mode, pinError: null })),
    []
  );
  const closePinModal = useCallback(
    () => setState((s) => ({ ...s, pinModalMode: null, pinError: null, pinBusy: false, pendingVoidSale: null })),
    []
  );
  const clearPinError = useCallback(() => setState((s) => ({ ...s, pinError: null })), []);

  const setAdminPin = useCallback(
    async (pin: string) => {
      if (!/^\d{4,15}$/.test(pin)) {
        setState((s) => ({ ...s, pinError: 'PIN must be 4–15 digits' }));
        return;
      }
      if (SecurityManager.isPinWeak(pin)) {
        setState((s) => ({ ...s, pinError: 'Choose a less common PIN' }));
        return;
      }
      const st = stateRef.current;
      if (st.pinBusy) return;
      setState((s) => ({ ...s, pinBusy: true, pinError: null }));
      const [hash, salt] = await SecurityManager.hashPin(pin);
      const nextSettings: StoreSettings = {
        ...st.settings,
        adminPinHash: hash,
        adminPinSalt: salt,
        adminPinIter: SecurityManager.DEFAULT_PBKDF2_ITER,
      };
      const secLog = await SecurityManager.appendSecurityEvent(
        st.securityLog,
        'PIN_SET',
        'info',
        'Manager PIN configured'
      );
      PosRepository.saveSettings(nextSettings);
      PosRepository.saveSecurityLog(secLog);
      PosRepository.savePinLockState(0, 0);
      setState((s) => ({
        ...s,
        settings: nextSettings,
        securityLog: secLog,
        settingsUnlocked: true,
        pinModalMode: null,
        pinBusy: false,
        pinError: null,
        pinFailCount: 0,
        pinLockoutUntilMs: 0,
      }));
      toast('Manager PIN saved');
    },
    [toast]
  );

  const verifyAndUnlock = useCallback(async (pin: string, mode: string) => {
    const st = stateRef.current;
    if (st.pinBusy) return;
    const now = Date.now();
    if (now < st.pinLockoutUntilMs) {
      const secs = Math.max(1, Math.floor((st.pinLockoutUntilMs - now) / 1000));
      setState((s) => ({ ...s, pinError: `Too many attempts. Wait ${secs}s.` }));
      return;
    }
    if (!/^\d{4,15}$/.test(pin)) {
      setState((s) => ({ ...s, pinError: 'Enter 4–15 digits' }));
      return;
    }

    setState((s) => ({ ...s, pinBusy: true, pinError: null }));
    const ok = await SecurityManager.verifyPin(
      pin,
      st.settings.adminPinHash,
      st.settings.adminPinSalt,
      st.settings.adminPinIter
    );
    if (ok) {
      const ev =
        mode === 'unlockTerminal' ? 'POS_UNLOCK' : mode === 'unlockVoid' ? 'VOID_AUTH' : 'SETTINGS_UNLOCK';
      let nextSettings = st.settings;
      if (st.settings.adminPinIter !== SecurityManager.DEFAULT_PBKDF2_ITER) {
        const [fastHash, fastSalt] = await SecurityManager.hashPin(pin);
        nextSettings = {
          ...st.settings,
          adminPinHash: fastHash,
          adminPinSalt: fastSalt,
          adminPinIter: SecurityManager.DEFAULT_PBKDF2_ITER,
        };
        PosRepository.saveSettings(nextSettings);
      }
      const secLog = await SecurityManager.appendSecurityEvent(st.securityLog, ev, 'info', 'Unlocked with PIN');
      PosRepository.saveSecurityLog(secLog);
      PosRepository.savePinLockState(0, 0);
      setState((s) => {
        const authorizedVoid = mode === 'unlockVoid' ? s.pendingVoidSale : s.voidSaleTarget;
        return {
          ...s,
          settings: nextSettings,
          securityLog: secLog,
          settingsUnlocked: mode === 'unlockSettings' || mode === 'unlockVoid' ? true : s.settingsUnlocked,
          terminalLocked: mode === 'unlockTerminal' ? false : s.terminalLocked,
          voidSaleTarget: authorizedVoid,
          pendingVoidSale: mode === 'unlockVoid' ? null : s.pendingVoidSale,
          pinModalMode: null,
          pinBusy: false,
          pinError: null,
          pinFailCount: 0,
          pinLockoutUntilMs: 0,
        };
      });
    } else {
      const nextFails = st.pinFailCount + 1;
      const lockedOut = nextFails >= 5;
      const lockoutMs = lockedOut ? Date.now() + (15_000 << Math.min(3, nextFails - 5)) : 0;
      const evType = lockedOut ? 'PIN_LOCKOUT' : 'PIN_FAIL';
      const summary = lockedOut
        ? `PIN temporarily locked after ${nextFails} failed attempts`
        : `Failed PIN attempt (${nextFails})`;
      const secLog = await SecurityManager.appendSecurityEvent(st.securityLog, evType, 'warning', summary);
      PosRepository.saveSecurityLog(secLog);
      PosRepository.savePinLockState(nextFails, lockoutMs);
      setState((s) => ({
        ...s,
        securityLog: secLog,
        pinBusy: false,
        pinFailCount: nextFails,
        pinLockoutUntilMs: lockoutMs,
        pinError: lockedOut
          ? `Too many failed attempts. Locked for ${Math.max(1, Math.floor((lockoutMs - Date.now()) / 1000))}s.`
          : `Incorrect PIN (attempt ${nextFails})`,
      }));
    }
  }, []);

  const lockTerminalNow = useCallback(() => {
    const st = stateRef.current;
    const hasPin = Boolean(st.settings.adminPinHash && st.settings.adminPinHash.trim());
    if (!hasPin) {
      toast('Set a Manager PIN in Settings first', 'WARNING');
      return;
    }
    setState((s) => ({
      ...s,
      terminalLocked: true,
      settingsUnlocked: false,
      pendingVoidSale: null,
      voidSaleTarget: null,
      pinError: null,
    }));
  }, [toast]);

  const lockSettingsNow = useCallback(
    () => setState((s) => ({ ...s, settingsUnlocked: false, pendingVoidSale: null })),
    []
  );

  const exportBackupJson = useCallback((): string => {
    const st = stateRef.current;
    const sanitizedSettings: StoreSettings = { ...st.settings, adminPinHash: null, adminPinSalt: null };
    const payload: PosBackupPayload = {
      app: 'eternalblue-pos',
      version: PosMath.APP_VERSION,
      exportedAt: new Date().toISOString(),
      sourceDeviceId: st.deviceIdentity.deviceId,
      sourceDeviceLabel: st.deviceIdentity.shortCode,
      settings: sanitizedSettings,
      products: st.products,
      sales: st.sales,
      heldOrders: st.heldOrders,
      sukiCustomers: st.sukiCustomers,
      utangTransactions: st.utangTransactions,
      repackRules: st.repackRules,
      repackLog: st.repackLog,
      drawerEvents: st.drawerEvents,
      digitalServices: st.digitalServices,
      stockLog: st.stockLog,
      cashiers: st.cashiers,
      activeShift: st.activeShift,
    };
    return JSON.stringify(payload, null, 2);
  }, []);

  useEffect(() => {
    const hasBusinessData = [
      state.products,
      state.sales,
      state.heldOrders,
      state.sukiCustomers,
      state.utangTransactions,
      state.repackRules,
      state.repackLog,
      state.drawerEvents,
      state.digitalServices,
      state.stockLog,
      state.cashiers,
    ].some((items) => items.length > 0) || state.activeShift !== null;
    const settingKeys = Object.keys(DEFAULT_STORE_SETTINGS) as Array<keyof StoreSettings>;
    const hasCustomSettings = settingKeys.some(
      (key) => state.settings[key] !== DEFAULT_STORE_SETTINGS[key]
    );
    if (!hasBusinessData && !hasCustomSettings) return;
    const timer = setTimeout(() => {
      void AutoSafetyBackupRepository.saveLatestAndDaily(
        exportBackupJson(),
        state.products.length,
        state.sales.length
      ).catch(() => {
        const now = Date.now();
        if (now - lastSafetyBackupErrorAtRef.current < 60_000) return;
        lastSafetyBackupErrorAtRef.current = now;
        toast('Automatic safety copy failed. Export a backup and check device storage.', 'WARNING');
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    exportBackupJson,
    state.activeShift,
    state.cashiers,
    state.digitalServices,
    state.drawerEvents,
    state.heldOrders,
    state.products,
    state.repackLog,
    state.repackRules,
    state.sales,
    state.settings,
    state.stockLog,
    state.sukiCustomers,
    state.utangTransactions,
    toast,
  ]);

  const importBackupJson = useCallback(
    async (rawJson: string, forceCrossDeviceConfirm = false) => {
      const st = stateRef.current;
      const hasPin = Boolean(st.settings.adminPinHash && st.settings.adminPinHash.trim());
      if (hasPin && !st.settingsUnlocked) {
        setState((s) => ({ ...s, pinModalMode: 'unlockSettings', pinError: null }));
        toast('Unlock Settings with Manager PIN to restore backup', 'WARNING');
        return;
      }
      let parsed: PosBackupPayload | null = null;
      try {
        const candidate = JSON.parse(rawJson) as Partial<PosBackupPayload>;
        if (candidate && Array.isArray(candidate.products) && Array.isArray(candidate.sales) && candidate.settings) {
          parsed = candidate as PosBackupPayload;
        }
      } catch {
        parsed = null;
      }
      if (!parsed) {
        toast('Invalid or unreadable backup JSON file', 'ERROR');
        return;
      }

      const origin = analyzeBackupDeviceOrigin(parsed, st.deviceIdentity.deviceId);
      if (origin.isCrossDevice && !forceCrossDeviceConfirm) {
        setState((s) => ({
          ...s,
          pendingCrossDeviceRestore: {
            rawJson,
            sourceLabel: origin.sourceDeviceLabel ?? 'Another Device',
            exportedAt: parsed!.exportedAt || '',
            productCount: parsed!.products.length,
            saleCount: parsed!.sales.length,
          },
        }));
        return;
      }

      const restoredStoreName =
        parsed.settings.storeName?.trim() ||
        st.settings.storeName.trim() ||
        PosRepository.loadPinnedStoreName() ||
        'EternalBlue Mart';
      const mergedSettings: StoreSettings = {
        ...st.settings,
        ...parsed.settings,
        storeName: restoredStoreName,
        adminPinHash: st.settings.adminPinHash,
        adminPinSalt: st.settings.adminPinSalt,
        adminPinIter: st.settings.adminPinIter,
      };
      const nextCashiers = parsed.cashiers?.length ? parsed.cashiers : st.cashiers;
      const nextShift = parsed.activeShift ?? st.activeShift;
      const sourceNote = origin.isCrossDevice && origin.sourceDeviceLabel
        ? ` (from ${origin.sourceDeviceLabel})`
        : '';
      const secLog = await SecurityManager.appendSecurityEvent(
        st.securityLog,
        'BACKUP_RESTORED',
        'info',
        `Restored ${parsed.products.length} SKUs & ${parsed.sales.length} sales${sourceNote}`
      );

      PosRepository.saveSettings(mergedSettings);
      PosRepository.saveProducts(parsed.products);
      PosRepository.saveSales(parsed.sales);
      PosRepository.saveHeldOrders(parsed.heldOrders ?? []);
      PosRepository.saveSukiCustomers(parsed.sukiCustomers ?? []);
      PosRepository.saveUtangTx(parsed.utangTransactions ?? []);
      PosRepository.saveRepackRules(parsed.repackRules ?? []);
      if (parsed.repackLog?.length) PosRepository.saveRepackLog(parsed.repackLog);
      PosRepository.saveDrawerEvents(parsed.drawerEvents ?? []);
      PosRepository.saveDigitalServices(parsed.digitalServices ?? []);
      PosRepository.saveStockLog(parsed.stockLog ?? []);
      PosRepository.saveCashiers(nextCashiers);
      PosRepository.saveActiveShift(nextShift ?? null);
      PosRepository.saveSecurityLog(secLog);

      setState((s) => ({
        ...s,
        pendingCrossDeviceRestore: null,
        settings: mergedSettings,
        products: parsed!.products,
        sales: parsed!.sales,
        heldOrders: parsed!.heldOrders ?? [],
        sukiCustomers: parsed!.sukiCustomers ?? [],
        utangTransactions: parsed!.utangTransactions ?? [],
        repackRules: parsed!.repackRules ?? [],
        repackLog: parsed!.repackLog?.length ? parsed!.repackLog : s.repackLog,
        drawerEvents: parsed!.drawerEvents ?? [],
        digitalServices: parsed!.digitalServices ?? [],
        stockLog: parsed!.stockLog ?? [],
        cashiers: nextCashiers,
        activeShift: nextShift ?? null,
        securityLog: secLog,
      }));
      toast(`Restored ${parsed.products.length} SKUs & ${parsed.sales.length} sales`);
    },
    [toast]
  );

  const confirmCrossDeviceRestore = useCallback(async () => {
    const pending = stateRef.current.pendingCrossDeviceRestore;
    if (!pending) return;
    await importBackupJson(pending.rawJson, true);
  }, [importBackupJson]);

  const cancelCrossDeviceRestore = useCallback(() => {
    setState((s) => ({ ...s, pendingCrossDeviceRestore: null }));
    toast('Backup import cancelled — device data unchanged');
  }, [toast]);

  const factoryResetAll = useCallback(async () => {
    try {
      await AutoSafetyBackupRepository.clear();
    } catch {
      toast('Could not clear automatic safety copies. Reset was canceled.', 'ERROR');
      return;
    }
    const preservedStoreName =
      stateRef.current.settings.storeName.trim() || PosRepository.loadPinnedStoreName() || 'EternalBlue Mart';
    PosRepository.resetAll();
    PosRepository.savePinLockState(0, 0);
    const settings = { ...PosRepository.loadSettings(), storeName: preservedStoreName };
    PosRepository.saveSettings(settings);
    const welcome = AssistantEngine.welcome('EN');
    setState((prev) => ({
      ...createInitialState(),
      settings,
      settingsUnlocked: true,
      assistantMessages: prev.assistantMessages.length
        ? prev.assistantMessages
        : [{ id: 1, isUser: false, text: welcome.text, metrics: [], chips: welcome.chips }],
    }));
    toast('Zero-based reset complete (store name preserved)');
  }, [toast]);

  const setAssistantOpen = useCallback((open: boolean) => setState((s) => ({ ...s, assistantOpen: open })), []);

  const setAssistantLang = useCallback((lang: AssistantLang) => {
    const w = AssistantEngine.welcome(lang);
    setState((s) => ({
      ...s,
      assistantLang: lang,
      assistantMessages: [{ id: Date.now(), isUser: false, text: w.text, metrics: [], chips: w.chips }],
    }));
  }, []);

  const askAssistant = useCallback((query: string) => {
    const clean = query.trim();
    if (!clean) return;
    const st = stateRef.current;
    const reply = AssistantEngine.ask(
      clean,
      st.products,
      st.sales,
      st.heldOrders,
      st.cart,
      st.settings,
      st.assistantLang
    );
    const now = Date.now();
    const userMsg: ChatMessage = { id: now, isUser: true, text: clean, metrics: [], chips: [] };
    const botMsg: ChatMessage = {
      id: now + 1,
      isUser: false,
      text: reply.text,
      metrics: reply.metrics,
      chips: reply.chips,
    };
    setState((s) => ({
      ...s,
      assistantLang: reply.lang,
      assistantMessages: [...s.assistantMessages, userMsg, botMsg],
    }));
  }, []);

  const value: PosContextValue = {
    state,
    productMap,
    cartTotals,
    pinConfigured,
    storePulse,
    toast,
    setActiveTab,
    setOpsSubTab,
    setPosSearch,
    setPosCategory,
    setStockSearch,
    setStockFilter,
    setStockSort,
    togglePriceMode,
    toggleSeniorPwd,
    setSeniorId,
    addToCart,
    updateCartQty,
    toggleLinePriceType,
    clearCart,
    setHoldCartOpen,
    setHeldOrdersOpen,
    holdCurrentCart,
    recallHeldOrder,
    deleteHeldOrder,
    openCheckout,
    closeCheckout,
    closeReceipt,
    openReceipt,
    completeCheckout,
    openProductModal,
    closeProductModal,
    saveProduct,
    deleteProduct,
    openStockAdjust,
    applyStockAdjustment,
    setBatchModalOpen,
    setStockLogModalOpen,
    applyBatchStock,
    openScanner,
    closeScanner,
    dismissScannedPrompt,
    handleBarcodeDetected,
    addSukiCustomer,
    recordUtangPayment,
    addRepackRule,
    runRepackRule,
    recordDrawerEvent,
    startShift,
    addCashierAccount,
    deleteCashierAccount,
    recordDigitalService,
    requestVoidSale,
    closeVoidSale,
    confirmVoidSale,
    updateSettings,
    openPinModal,
    closePinModal,
    clearPinError,
    setAdminPin,
    verifyAndUnlock,
    lockTerminalNow,
    lockSettingsNow,
    exportBackupJson,
    importBackupJson,
    confirmCrossDeviceRestore,
    cancelCrossDeviceRestore,
    factoryResetAll,
    setAssistantOpen,
    setAssistantLang,
    askAssistant,
    checkForGitHubUpdates,
    installAppUpdate,
    refreshWebApp,
  };

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
};

export function usePos(): PosContextValue {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error('usePos must be used within PosProvider');
  return ctx;
}
