import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CartLine,
  ConfigSnapshot,
  HeldOrder,
  PaymentMethod,
  PriceType,
  Product,
  SaleRecord,
  ScannerMode,
  SecurityEventType,
  SecurityLogEntry,
  SecuritySeverity,
  StockLogEntry,
  StoreSettings,
  TabName,
} from './types';
import {
  applyBatchStockUpdates,
  buildDefaultCatalog,
  buildProductMap,
  computeCartTotals,
  computeSalesStats,
  DAY_MS,
  DEFAULT_SETTINGS,
  diffConfigFields,
  expiryInfo,
  extractGs1Gtin,
  findProductByBarcode,
  formatPeso,
  getLinePrice,
  getTopFastMoverIds,
  inRange,
  linePricing,
  lineTotalPeso,
  nextReceiptNo,
  normBarcode,
  parseQtySearchInput,
  round2,
  sanitizeConfigForSnapshot,
  startOfDay,
  wholesaleBlock,
  type BatchStockAdjustmentInput,
  type CsvImportRowPreview,
} from './utils/posMath';
import { warmUpScannerEngine } from './utils/scannerEngine';
import { APP_VERSION } from './version';
import { pinIsSet } from './utils/pinSecurity';
import {
  createSecurityLogEntry,
  ensureDeviceHmacKey,
  verifySecurityChain,
} from './utils/cryptoVault';
import {
  loadConfigHistoryFromStorage,
  loadHeldFromStorage,
  loadProductsFromStorage,
  loadSalesFromStorage,
  loadSecurityLogFromStorage,
  loadSettingsFromStorage,
  loadStockLogFromStorage,
  loadSyncTombstonesFromStorage,
  saveConfigHistoryToStorage,
  saveHeldToStorage,
  saveProductsToStorage,
  saveSalesToStorage,
  saveSecurityLogToStorage,
  saveSettingsToStorage,
  saveStockLogToStorage,
  saveSyncTombstonesToStorage,
} from './utils/storage';
import {
  fetchSyncStatus,
  normalizeSyncStoreId,
  pullStoreFromSupabase,
  pushStoreToSupabase,
  reconcileStoreData,
  type SyncStatusResponse,
} from './utils/supabaseSync';
import { useOnlineStatus } from './hooks/useOnlineStatus';

import { TopBar } from './components/TopBar';
import { ToastContainer, type ToastItem } from './components/ToastContainer';
import { CategorySheetModal } from './components/CategorySheetModal';
import { PosView } from './components/PosView';
import { InventoryView, type StockFilter } from './components/InventoryView';
import { ProductModal } from './components/ProductModal';
import { StockAdjustModal } from './components/StockAdjustModal';
import { ScReviewModal } from './components/ScReviewModal';
import { ReorderModal } from './components/ReorderModal';
import { BatchStockModal, type BatchPrefillItem } from './components/BatchStockModal';
import { CsvStockImportModal } from './components/CsvStockImportModal';
import { StockLogModal } from './components/StockLogModal';
import { SalesView } from './components/SalesView';
import { SettingsView } from './components/SettingsView';
import { CheckoutModal } from './components/CheckoutModal';
import { ReceiptModal, type ReadingReport } from './components/ReceiptModal';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import {
  ConfirmModal,
  HeldOrdersModal,
  HoldCartModal,
  PinModal,
  VoidSaleModal,
  WeightModal,
} from './components/SmallModals';
import { AssistantWidget } from './components/AssistantWidget';
import type { AssistantAction } from './utils/assistantEngine';

export default function App() {
  // Core persistent state — preserves 100% of existing mobile/tablet data
  const [products, setProducts] = useState<Product[]>(() => loadProductsFromStorage().products);
  const [sales, setSales] = useState<SaleRecord[]>(() => loadSalesFromStorage());
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>(() => loadHeldFromStorage());
  const [settings, setSettings] = useState<StoreSettings>(() => loadSettingsFromStorage());
  const [stockLog, setStockLog] = useState<StockLogEntry[]>(() => loadStockLogFromStorage());
  const [configHistory, setConfigHistory] = useState<ConfigSnapshot[]>(() => {
    const existing = loadConfigHistoryFromStorage();
    if (existing.length > 0) return existing;
    const initSettings = loadSettingsFromStorage();
    const baseline: ConfigSnapshot = {
      id: 'CFG-BASELINE',
      version: APP_VERSION,
      createdAt: new Date().toISOString(),
      label: 'Initial baseline configuration',
      source: 'baseline',
      changedFields: [],
      config: sanitizeConfigForSnapshot(initSettings),
    };
    saveConfigHistoryToStorage([baseline]);
    return [baseline];
  });
  const [syncTombstones, setSyncTombstones] = useState<Record<string, string>>(() =>
    loadSyncTombstonesFromStorage(),
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingCloudPush, setPendingCloudPush] = useState(false);
  const isOnline = useOnlineStatus();
  const suppressAutoSyncRef = useRef(false);
  const syncBootstrappedRef = useRef(false);
  const prevOnlineRef = useRef(isOnline);

  // Navigation & filter state
  const [activeTab, setActiveTab] = useState<TabName>('pos');
  const [posCategory, setPosCategory] = useState('All');
  const [invCategory, setInvCategory] = useState('All');
  const [invStockFilter, setInvStockFilter] = useState<StockFilter>('ALL');
  const [posSearch, setPosSearch] = useState('');
  const [invSearch, setInvSearch] = useState('');

  // Active POS basket state
  const [cart, setCart] = useState<CartLine[]>([]);
  const [priceMode, setPriceMode] = useState<PriceType>('retail');
  const [isSeniorPwd, setIsSeniorPwd] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Security & Lock session
  const [securityLog, setSecurityLog] = useState<SecurityLogEntry[]>(() => loadSecurityLogFromStorage());
  const securityLogRef = useRef<SecurityLogEntry[]>(securityLog);
  securityLogRef.current = securityLog;
  const secQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [deviceKeyReady, setDeviceKeyReady] = useState(false);

  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const [terminalLocked, setTerminalLocked] = useState(false);
  const [pinModal, setPinModal] = useState<{
    open: boolean;
    mode: 'unlock' | 'setup';
    purpose: 'settings';
  }>({ open: false, mode: 'unlock', purpose: 'settings' });

  // Modals state
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState<SaleRecord | null>(null);
  const [receiptReading, setReceiptReading] = useState<ReadingReport | null>(null);
  const [scannerState, setScannerState] = useState<{ open: boolean; mode: ScannerMode }>({
    open: false,
    mode: 'pos',
  });
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);
  const [holdModalOpen, setHoldModalOpen] = useState(false);
  const [heldModalOpen, setHeldModalOpen] = useState(false);

  const [productModal, setProductModal] = useState<{
    open: boolean;
    editingId: string | null;
    initialBarcode: string;
  }>({ open: false, editingId: null, initialBarcode: '' });
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [batchStockModal, setBatchStockModal] = useState<{
    open: boolean;
    mode: 'delta' | 'set';
    reason?: StockLogEntry['reason'];
    prefill?: BatchPrefillItem[];
  }>({ open: false, mode: 'delta' });
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [stockLogOpen, setStockLogOpen] = useState(false);
  const [scReviewOpen, setScReviewOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);

  const [voidTargetSale, setVoidTargetSale] = useState<SaleRecord | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [salesCashDrawerSignal, setSalesCashDrawerSignal] = useState(0);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    type: 'delete-product' | 'clear-cart' | 'clear-sales' | 'factory-reset';
    productId?: string;
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    requirePin?: boolean;
  } | null>(null);

  // Toast notifications (capped at 2 concurrent for uncluttered UI)
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-1), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  // Request durable browser storage once on mount & pre-warm barcode WASM worker on idle
  useEffect(() => {
    try {
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        navigator.storage.persist().catch(() => {});
      }
    } catch {
      // ignore
    }

    const idleWindow = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof idleWindow.requestIdleCallback === 'function') {
      const id = idleWindow.requestIdleCallback(() => {
        warmUpScannerEngine().catch(() => {});
      }, { timeout: 2500 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const tid = window.setTimeout(() => {
      warmUpScannerEngine().catch(() => {});
    }, 1200);
    return () => window.clearTimeout(tid);
  }, []);

  const logSecurityEvent = useCallback(
    (event: SecurityEventType, summary: string, severity: SecuritySeverity = 'info'): Promise<void> => {
      const task = secQueueRef.current.then(async () => {
        const entry = await createSecurityLogEntry(securityLogRef.current, {
          event,
          severity,
          summary,
        });
        const next = [entry, ...securityLogRef.current].slice(0, 250);
        securityLogRef.current = next;
        setSecurityLog(next);
        saveSecurityLogToStorage(next);
      });
      secQueueRef.current = task.catch(() => {});
      return task;
    },
    [],
  );

  // Initialize non-extractable IndexedDB HMAC device keystore & verify stored security chain on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = await ensureDeviceHmacKey();
      if (!cancelled) setDeviceKeyReady(Boolean(key));
      const existing = securityLogRef.current;
      if (existing.length > 0) {
        const report = await verifySecurityChain(existing);
        if (!cancelled && !report.valid) {
          toast('Security ledger integrity alert detected in Settings', 'warning');
          await logSecurityEvent(
            'TAMPER_ALERT',
            `Hash/HMAC mismatch detected on startup (seq ${[...report.brokenSeqs, ...report.hmacMismatches].join(', ')})`,
            'critical',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logSecurityEvent, toast]);

  const productMap = useMemo(() => buildProductMap(products), [products]);
  const fastMoverIds = useMemo(() => getTopFastMoverIds(products, sales, 12), [products, sales]);

  // Derived cart totals
  const cartTotals = useMemo(
    () => computeCartTotals(cart, productMap, isSeniorPwd, settings),
    [cart, productMap, isSeniorPwd, settings],
  );

  const lowStockCount = useMemo(() => {
    const th = Number(settings.lowStockThreshold) || 10;
    return products.filter((p) => p.stock <= th).length;
  }, [products, settings.lowStockThreshold]);

  // Persistence wrappers
  const updateProducts = useCallback(
    (updater: (prev: Product[]) => Product[]) => {
      const nowIso = new Date().toISOString();
      setProducts((prev) => {
        const nextRaw = updater(prev);
        const prevMap = new Map(prev.map((p) => [p.id, p]));
        const next = nextRaw.map((p) => {
          const old = prevMap.get(p.id);
          if (!old) {
            return p.updatedAt ? p : { ...p, updatedAt: nowIso };
          }
          if (old !== p && p.updatedAt === old.updatedAt) {
            return { ...p, updatedAt: nowIso };
          }
          return p;
        });
        const nextIds = new Set(next.map((p) => p.id));
        const removedIds = prev.filter((p) => !nextIds.has(p.id)).map((p) => p.id);
        if (removedIds.length > 0) {
          setSyncTombstones((prevT) => {
            const updatedT = { ...prevT };
            for (const rid of removedIds) updatedT[rid] = nowIso;
            saveSyncTombstonesToStorage(updatedT);
            return updatedT;
          });
        }
        const res = saveProductsToStorage(next);
        if (!res.ok) toast('Device storage nearly full! Export a JSON backup.', 'error');
        return next;
      });
    },
    [toast],
  );

  const updateSales = useCallback(
    (updater: (prev: SaleRecord[]) => SaleRecord[]) => {
      setSales((prev) => {
        const next = updater(prev);
        const res = saveSalesToStorage(next);
        if (!res.ok) toast('Device storage nearly full! Export a JSON backup.', 'error');
        return next;
      });
    },
    [toast],
  );

  const updateHeld = useCallback((updater: (prev: HeldOrder[]) => HeldOrder[]) => {
    setHeldOrders((prev) => {
      const next = updater(prev);
      saveHeldToStorage(next);
      return next;
    });
  }, []);

  const updateSettings = useCallback(
    (next: StoreSettings, snapshotMeta?: { label?: string; source?: ConfigSnapshot['source'] }) => {
      setSettings((prev) => {
        const prevCfg = sanitizeConfigForSnapshot(prev);
        const nextCfg = sanitizeConfigForSnapshot(next);
        const changed = diffConfigFields(prevCfg, nextCfg);
        if (changed.length > 0 || snapshotMeta) {
          setConfigHistory((hist) => {
            const entry: ConfigSnapshot = {
              id: 'CFG-' + Date.now().toString(36),
              version: APP_VERSION,
              createdAt: new Date().toISOString(),
              label:
                snapshotMeta?.label ||
                (changed.length > 0 ? `Updated ${changed.join(', ')}` : 'Configuration snapshot'),
              source: snapshotMeta?.source || 'auto',
              changedFields: changed,
              config: nextCfg,
            };
            const updatedHist = [entry, ...hist].slice(0, 30);
            saveConfigHistoryToStorage(updatedHist);
            return updatedHist;
          });
        }
        saveSettingsToStorage(next);
        return next;
      });
    },
    [],
  );

  const handleCreateConfigCheckpoint = useCallback(
    (label?: string) => {
      const cfg = sanitizeConfigForSnapshot(settings);
      const entry: ConfigSnapshot = {
        id: 'CFG-' + Date.now().toString(36),
        version: APP_VERSION,
        createdAt: new Date().toISOString(),
        label: label?.trim() || 'Manual checkpoint',
        source: 'manual',
        changedFields: [],
        config: cfg,
      };
      setConfigHistory((prev) => {
        const next = [entry, ...prev].slice(0, 30);
        saveConfigHistoryToStorage(next);
        return next;
      });
      toast('Configuration checkpoint saved', 'success');
    },
    [settings, toast],
  );

  const handleRollbackConfig = useCallback(
    (snapshotId: string) => {
      const snap = configHistory.find((c) => c.id === snapshotId);
      if (!snap) return;
      const merged: StoreSettings = {
        ...settings,
        ...snap.config,
      };
      updateSettings(merged, {
        label: `Rolled back to "${snap.label}"`,
        source: 'rollback',
      });
      toast(`Configuration rolled back to "${snap.label}" (inventory & sales untouched)`, 'success');
    },
    [configHistory, settings, toast, updateSettings],
  );

  const appendStockLog = useCallback((entry: StockLogEntry) => {
    setStockLog((prev) => {
      const next = [entry, ...prev].slice(0, 500);
      saveStockLogToStorage(next);
      return next;
    });
  }, []);

  // Keep latest state in a ref for async Supabase sync callbacks
  const syncStateRef = useRef({
    products,
    syncTombstones,
    sales,
    heldOrders,
    stockLog,
    settings,
    configHistory,
  });
  syncStateRef.current = {
    products,
    syncTombstones,
    sales,
    heldOrders,
    stockLog,
    settings,
    configHistory,
  };

  const applyReconciledToState = useCallback(
    (
      nextProducts: Product[],
      nextTombstones: Record<string, string>,
      nextSales: SaleRecord[],
      nextHeld: HeldOrder[],
      nextLogs: StockLogEntry[],
      nextConfigHistory: ConfigSnapshot[],
      nextSettings: StoreSettings,
      syncedAt: string,
    ) => {
      suppressAutoSyncRef.current = true;
      setProducts(nextProducts);
      saveProductsToStorage(nextProducts);
      setSyncTombstones(nextTombstones);
      saveSyncTombstonesToStorage(nextTombstones);
      setSales(nextSales);
      saveSalesToStorage(nextSales);
      setHeldOrders(nextHeld);
      saveHeldToStorage(nextHeld);
      setStockLog(nextLogs);
      saveStockLogToStorage(nextLogs);
      setConfigHistory(nextConfigHistory);
      saveConfigHistoryToStorage(nextConfigHistory);
      const stampedSettings: StoreSettings = { ...nextSettings, lastSyncedAt: syncedAt };
      setSettings(stampedSettings);
      saveSettingsToStorage(stampedSettings);
      window.setTimeout(() => {
        suppressAutoSyncRef.current = false;
      }, 200);
    },
    [],
  );

  const refreshSyncStatus = useCallback(async (): Promise<SyncStatusResponse | null> => {
    try {
      const status = await fetchSyncStatus();
      setSyncStatus(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  const handleSyncWithSupabase = useCallback(
    async (mode: 'merge' | 'push' | 'pull' = 'merge', silent = false) => {
      if (syncBusy) return;
      setSyncBusy(true);
      setSyncError(null);
      try {
        const status = await refreshSyncStatus();
        if (!status?.configured || !status.schemaReady) {
          const isWorker = status?.cloudflareWorker?.runtime === 'cloudflare-worker';
          const reason = !status?.configured
            ? isWorker
              ? 'Supabase key not configured on Cloudflare Worker yet. Add SUPABASE_SERVICE_ROLE_KEY under Worker Settings → Variables and Secrets.'
              : 'Supabase key not configured on server yet.'
            : status.error || 'Supabase tables are not initialized yet.';
          setSyncError(reason);
          if (!silent) toast(reason, 'warning');
          return;
        }

        const cur = syncStateRef.current;
        const storeId = normalizeSyncStoreId(cur.settings.syncStoreId);

        if (mode === 'push') {
          const { syncedAt } = await pushStoreToSupabase({
            storeId,
            products: cur.products,
            deletedProducts: cur.syncTombstones,
            sales: cur.sales,
            heldOrders: cur.heldOrders,
            stockLog: cur.stockLog,
            settings: cur.settings,
            configHistory: cur.configHistory,
          });
          suppressAutoSyncRef.current = true;
          const stamped: StoreSettings = { ...cur.settings, lastSyncedAt: syncedAt, syncStoreId: storeId };
          setSettings(stamped);
          saveSettingsToStorage(stamped);
          window.setTimeout(() => {
            suppressAutoSyncRef.current = false;
          }, 200);
          setPendingCloudPush(false);
          if (!silent) toast(`Pushed to Supabase (${storeId})`, 'success');
          return;
        }

        const pulled = await pullStoreFromSupabase(storeId);
        if (!pulled.found || !pulled.payload) {
          if (mode === 'pull') {
            if (!silent) toast(`No cloud data found yet for store "${storeId}"`, 'warning');
            return;
          }
          // Merge on an empty cloud store seeds it from this device
          const { syncedAt } = await pushStoreToSupabase({
            storeId,
            products: cur.products,
            deletedProducts: cur.syncTombstones,
            sales: cur.sales,
            heldOrders: cur.heldOrders,
            stockLog: cur.stockLog,
            settings: cur.settings,
            configHistory: cur.configHistory,
          });
          suppressAutoSyncRef.current = true;
          const stamped: StoreSettings = { ...cur.settings, lastSyncedAt: syncedAt, syncStoreId: storeId };
          setSettings(stamped);
          saveSettingsToStorage(stamped);
          window.setTimeout(() => {
            suppressAutoSyncRef.current = false;
          }, 200);
          setPendingCloudPush(false);
          if (!silent) toast(`Initialized Supabase cloud store "${storeId}"`, 'success');
          return;
        }

        const reconciled = reconcileStoreData({
          local: {
            products: cur.products,
            deletedProducts: cur.syncTombstones,
            sales: cur.sales,
            heldOrders: cur.heldOrders,
            stockLog: cur.stockLog,
            settings: cur.settings,
            configHistory: cur.configHistory,
          },
          cloud: pulled.payload,
          mode,
        });

        let finalSyncedAt = pulled.payload.updatedAt || new Date().toISOString();
        if (mode === 'merge') {
          const pushRes = await pushStoreToSupabase({
            storeId,
            products: reconciled.products,
            deletedProducts: reconciled.deletedProducts,
            sales: reconciled.sales,
            heldOrders: reconciled.heldOrders,
            stockLog: reconciled.stockLog,
            settings: reconciled.settings,
            configHistory: reconciled.configHistory,
          });
          finalSyncedAt = pushRes.syncedAt;
        }

        applyReconciledToState(
          reconciled.products,
          reconciled.deletedProducts,
          reconciled.sales,
          reconciled.heldOrders,
          reconciled.stockLog,
          reconciled.configHistory,
          reconciled.settings,
          finalSyncedAt,
        );
        setPendingCloudPush(false);
        if (!silent) {
          toast(
            mode === 'pull'
              ? `Pulled ${reconciled.stats.productsCount} SKUs & ${reconciled.stats.salesCount} sales from Supabase`
              : `Synced with Supabase (${reconciled.stats.productsCount} SKUs · ${reconciled.stats.salesCount} sales)`,
            'success',
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Supabase sync failed';
        setSyncError(msg);
        setPendingCloudPush(true);
        if (!silent) toast(msg, 'error');
      } finally {
        setSyncBusy(false);
      }
    },
    [applyReconciledToState, refreshSyncStatus, syncBusy, toast],
  );

  // Check Supabase status on mount & run initial silent merge if ready
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await refreshSyncStatus();
      if (cancelled) return;
      syncBootstrappedRef.current = true;
      if (status?.configured && status.schemaReady && syncStateRef.current.settings.syncEnabled !== false && isOnline) {
        await handleSyncWithSupabase('merge', true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSyncStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-sync debounced push on local data mutations
  useEffect(() => {
    if (!syncBootstrappedRef.current) return;
    if (suppressAutoSyncRef.current) return;
    if (settings.syncEnabled === false) return;
    if (!syncStatus?.configured || !syncStatus.schemaReady) return;
    if (!isOnline) {
      setPendingCloudPush(true);
      return;
    }

    const timer = window.setTimeout(() => {
      void handleSyncWithSupabase('push', true);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [products, sales, heldOrders, stockLog, settings.storeName, settings.syncStoreId, settings.syncEnabled, isOnline, syncStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Automatically reconcile when transitioning from offline -> online
  useEffect(() => {
    const wasOnline = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (!wasOnline && isOnline && syncStatus?.configured && syncStatus.schemaReady && settings.syncEnabled !== false) {
      void handleSyncWithSupabase('merge', true);
    } else if (!wasOnline && isOnline && pendingCloudPush) {
      void handleSyncWithSupabase('merge', true);
    }
  }, [isOnline, pendingCloudPush, settings.syncEnabled, syncStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLockTerminal = useCallback(() => {
    if (!pinIsSet(settings)) return;
    setSettingsUnlocked(false);
    setActiveTab((prev) => (prev === 'settings' ? 'pos' : prev));
    setTerminalLocked(true);
    setPinModal((p) => ({ ...p, open: false }));
    void logSecurityEvent('POS_LOCK', 'Terminal locked manually by operator', 'info');
    toast('Terminal locked', 'success');
  }, [logSecurityEvent, settings, toast]);

  // Configurable inactivity auto-lock (Settings-only or Whole-POS)
  const lastActivityRef = useRef(Date.now());
  useEffect(() => {
    const mins = Number(settings.autoLockMinutes ?? 5);
    if (!pinIsSet(settings) || mins <= 0 || terminalLocked) return;
    const monitorWholePos = Boolean(settings.lockWholePos);
    if (!monitorWholePos && (activeTab !== 'settings' || !settingsUnlocked)) return;

    lastActivityRef.current = Date.now();
    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    const id = setInterval(() => {
      if (Date.now() - lastActivityRef.current > mins * 60 * 1000) {
        if (monitorWholePos) {
          setSettingsUnlocked(false);
          setTerminalLocked(true);
          void logSecurityEvent('POS_LOCK', `Terminal auto-locked after ${mins} min idle`, 'info');
          toast(`Terminal auto-locked (${mins}m idle)`, 'warning');
        } else {
          setSettingsUnlocked(false);
          setActiveTab('pos');
          void logSecurityEvent('SETTINGS_LOCK', `Settings auto-locked after ${mins} min idle`, 'info');
          toast(`Settings locked after ${mins}m of inactivity`, 'warning');
        }
      }
    }, 15000);
    return () => {
      clearInterval(id);
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
    };
  }, [activeTab, settingsUnlocked, settings, terminalLocked, logSecurityEvent, toast]);

  // Cart manipulation
  const addQtyToCart = useCallback(
    (product: Product, addQty: number) => {
      if (product.stock <= 0) {
        toast(`${product.name} is out of stock`, 'error');
        return;
      }

      let warningMsg = '';
      setCart((prev) => {
        const idx = prev.findIndex((c) => c.productId === product.id);
        const currentQty = idx >= 0 ? prev[idx].qty : 0;
        const targetQty = Number((currentQty + addQty).toFixed(3));
        if (targetQty > product.stock + 1e-6) {
          warningMsg = `Only ${product.stock} ${product.unit} available in stock`;
          return prev;
        }
        const preferredType: PriceType =
          priceMode === 'wholesale' &&
          wholesaleBlock(
            {
              productId: product.id,
              retailPrice: product.retailPrice,
              wholesalePrice: product.wholesalePrice,
              wholesaleMinQty: product.wholesaleMinQty,
              qty: targetQty,
            },
            productMap,
          ) === null
            ? 'wholesale'
            : idx >= 0
              ? prev[idx].priceType
              : 'retail';

        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], qty: targetQty, priceType: preferredType };
          return copy;
        }
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            unit: product.unit,
            retailPrice: product.retailPrice,
            wholesalePrice: product.wholesalePrice,
            wholesaleMinQty: product.wholesaleMinQty,
            priceType: preferredType,
            qty: targetQty,
          },
        ];
      });

      if (warningMsg) toast(warningMsg, 'warning');
    },
    [priceMode, productMap, toast],
  );

  const handleProductClick = useCallback(
    (productId: string) => {
      const prod = productMap.get(productId);
      if (!prod) return;
      if (prod.stock <= 0) {
        toast(`${prod.name} is out of stock`, 'error');
        return;
      }
      if (prod.unit === 'kg') {
        setWeightProduct(prod);
      } else {
        addQtyToCart(prod, 1);
      }
    },
    [addQtyToCart, productMap, toast],
  );

  const handleChangeCartQty = useCallback(
    (productId: string, delta: number) => {
      const prod = productMap.get(productId);
      let warn = '';
      setCart((prev) => {
        const idx = prev.findIndex((l) => l.productId === productId);
        if (idx < 0) return prev;
        const line = prev[idx];
        const step = line.unit === 'kg' ? delta * 0.25 : delta;
        const nextQty = Number((line.qty + step).toFixed(3));
        if (nextQty <= 0) {
          return prev.filter((l) => l.productId !== productId);
        }
        if (prod && nextQty > prod.stock + 1e-6) {
          warn = `Only ${prod.stock} ${prod.unit} available in stock`;
          return prev;
        }
        const copy = [...prev];
        copy[idx] = { ...line, qty: nextQty };
        return copy;
      });
      if (warn) toast(warn, 'warning');
    },
    [productMap, toast],
  );

  const handleSetCartQty = useCallback(
    (productId: string, rawValue: string) => {
      const parsed = parseFloat(rawValue);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setCart((prev) => prev.filter((l) => l.productId !== productId));
        return;
      }
      const prod = productMap.get(productId);
      const nextQty = prod?.unit === 'kg' ? Number(parsed.toFixed(3)) : Math.round(parsed);
      if (nextQty <= 0) {
        setCart((prev) => prev.filter((l) => l.productId !== productId));
        return;
      }
      if (prod && nextQty > prod.stock + 1e-6) {
        toast(`Only ${prod.stock} ${prod.unit} available in stock`, 'warning');
        setCart((prev) =>
          prev.map((l) => (l.productId === productId ? { ...l, qty: prod.stock } : l)),
        );
        return;
      }
      setCart((prev) =>
        prev.map((l) => (l.productId === productId ? { ...l, qty: nextQty } : l)),
      );
    },
    [productMap, toast],
  );

  const handleSetPriceMode = useCallback(
    (mode: PriceType) => {
      setPriceMode(mode);
      setCart((prev) =>
        prev.map((line) => {
          if (mode === 'retail') return { ...line, priceType: 'retail' };
          const blk = wholesaleBlock(line, productMap);
          return blk === null ? { ...line, priceType: 'wholesale' } : line;
        }),
      );
    },
    [productMap],
  );

  const handleSetLinePriceType = useCallback(
    (productId: string, type: PriceType) => {
      const line = cart.find((l) => l.productId === productId);
      if (!line) return;
      if (type === 'wholesale') {
        const blk = wholesaleBlock(line, productMap);
        if (blk === 'none') {
          toast('No wholesale discount configured for this item', 'warning');
          return;
        }
        if (blk === 'cost') {
          toast('Wholesale price is below capital cost (blocked)', 'warning');
          return;
        }
        if (blk === 'qty') {
          const minQ = linePricing(line, productMap).minQty;
          toast(`Need at least ${minQ} ${line.unit} for wholesale price`, 'warning');
          return;
        }
      }
      setCart((prev) =>
        prev.map((l) => (l.productId === productId ? { ...l, priceType: type } : l)),
      );
    },
    [cart, productMap, toast],
  );

  const handleUnlockWholesaleLine = useCallback(
    (productId: string, minQty: number) => {
      const prod = productMap.get(productId);
      if (!prod) return;
      if (prod.stock + 1e-6 < minQty) {
        toast(`Only ${prod.stock} ${prod.unit} available (need ${minQty})`, 'warning');
        return;
      }
      setCart((prev) =>
        prev.map((l) =>
          l.productId === productId
            ? { ...l, qty: minQty, priceType: 'wholesale' }
            : l,
        ),
      );
      toast(`Wholesale applied for ${prod.name} (${minQty} ${prod.unit})`, 'success');
    },
    [productMap, toast],
  );

  const handleSearchEnter = useCallback(
    (raw: string) => {
      const { qty, query } = parseQtySearchInput(raw);
      if (!query) return;
      const byBc = findProductByBarcode(query, products);
      if (byBc) {
        if (qty !== 1 || byBc.unit !== 'kg') {
          addQtyToCart(byBc, qty);
        } else {
          handleProductClick(byBc.id);
        }
        setPosSearch('');
        return;
      }
      const lower = query.toLowerCase();
      const matches = products.filter(
        (p) => p.name.toLowerCase().includes(lower) || normBarcode(p.barcode) === normBarcode(query),
      );
      if (matches.length === 1) {
        if (qty !== 1 || matches[0].unit !== 'kg') {
          addQtyToCart(matches[0], qty);
        } else {
          handleProductClick(matches[0].id);
        }
        setPosSearch('');
      }
    },
    [addQtyToCart, handleProductClick, products],
  );

  // Global hardware wedge barcode scanner (fast keystroke burst + Enter) + Cashier shortcuts
  const wedgeRef = useRef<{ buf: string; lastTime: number }>({ buf: '', lastTime: 0 });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        if (activeTab === 'pos' && cart.length > 0) {
          e.preventDefault();
          setCheckoutOpen(true);
        }
        return;
      }
      if (e.key === 'F4') {
        if (activeTab === 'pos' && cart.length > 0) {
          e.preventDefault();
          setHoldModalOpen(true);
        }
        return;
      }
      if (e.key === 'F8') {
        if (activeTab === 'pos') {
          e.preventDefault();
          setScannerState({ open: true, mode: 'pos' });
        }
        return;
      }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') || (e.altKey && e.key.toLowerCase() === 'l')) {
        if (pinIsSet(settings) && !terminalLocked) {
          e.preventDefault();
          handleLockTerminal();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        if (!terminalLocked) {
          e.preventDefault();
          setAssistantOpen((o) => !o);
        }
        return;
      }
      if (e.key === 'F9') {
        if (activeTab === 'pos') {
          e.preventDefault();
          handleSetPriceMode(priceMode === 'retail' ? 'wholesale' : 'retail');
        }
        return;
      }
      if (e.key === 'Escape') {
        if (terminalLocked) return;
        setCheckoutOpen(false);
        setReceiptSale(null);
        setReceiptReading(null);
        setCategorySheetOpen(false);
        setHoldModalOpen(false);
        setHeldModalOpen(false);
        setWeightProduct(null);
        setStockAdjustProduct(null);
        setBatchStockModal((b) => ({ ...b, open: false }));
        setCsvImportOpen(false);
        setStockLogOpen(false);
        setScReviewOpen(false);
        setReorderOpen(false);
        setVoidTargetSale(null);
        setConfirmState(null);
        setPinModal((p) => ({ ...p, open: false }));
        return;
      }

      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (activeTab !== 'pos') return;

      const now = Date.now();
      const elapsed = now - wedgeRef.current.lastTime;
      if (elapsed > 120) {
        wedgeRef.current.buf = '';
      }

      const isFastTabSuffix =
        e.key === 'Tab' && wedgeRef.current.buf.length >= 6 && elapsed < 80;

      if (e.key === 'Enter' || isFastTabSuffix) {
        if (isFastTabSuffix) e.preventDefault();
        const rawCode = wedgeRef.current.buf.trim();
        wedgeRef.current.buf = '';
        wedgeRef.current.lastTime = now;
        if (rawCode.length >= 4) {
          const code = extractGs1Gtin(rawCode) || rawCode;
          const found = findProductByBarcode(code, products);
          if (found) {
            addQtyToCart(found, 1);
            toast(`Scanned: ${found.name}`, 'success');
          } else {
            toast(`Barcode ${code} not found`, 'warning');
          }
        }
        return;
      }

      wedgeRef.current.lastTime = now;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        wedgeRef.current.buf += e.key;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, cart.length, products, addQtyToCart, handleSetPriceMode, priceMode, settings, terminalLocked, handleLockTerminal, toast]);

  // Complete sale
  const handleCompleteSale = (payload: {
    paymentMethod: PaymentMethod;
    tendered: number;
    change: number;
    refNo?: string;
    seniorId?: string;
    splitDetails?: {
      cash: number;
      digital: number;
      digitalMethod: 'GCash' | 'Card';
    };
  }) => {
    const now = new Date();
    const receiptNo = nextReceiptNo(sales, now);

    const saleItems = cart.map((line) => {
      const prod = productMap.get(line.productId);
      const unitPrice = getLinePrice(line, productMap);
      const pType: PriceType = unitPrice < line.retailPrice ? 'wholesale' : 'retail';
      return {
        productId: line.productId,
        category: prod?.category,
        name: line.name,
        qty: line.qty,
        unit: line.unit,
        unitPrice,
        priceType: pType,
        capital: prod && Number(prod.capital) > 0 ? Number(prod.capital) : undefined,
        lineTotal: lineTotalPeso(unitPrice, line.qty),
      };
    });

    const record: SaleRecord = {
      receiptNo,
      dateIso: now.toISOString(),
      dateFormatted: now.toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
      items: saleItems,
      retailSubtotal: cartTotals.retailSubtotal,
      wholesaleSavings: cartTotals.wholesaleSavings,
      seniorDiscount: cartTotals.seniorDiscount,
      grandTotal: cartTotals.grandTotal,
      paymentMethod: payload.paymentMethod,
      tendered: payload.tendered,
      change: payload.change,
      refNo: payload.refNo,
      splitDetails: payload.splitDetails,
      seniorId: payload.seniorId,
      seniorBase: cartTotals.seniorDiscount > 0 ? cartTotals.seniorBase : undefined,
      seniorCapped: cartTotals.seniorDiscount > 0 ? cartTotals.seniorCapped : undefined,
    };

    // Deduct stock safely
    updateProducts((prev) =>
      prev.map((p) => {
        const soldLine = cart.find((c) => c.productId === p.id);
        if (!soldLine) return p;
        const nextStock = Math.max(0, Number((p.stock - soldLine.qty).toFixed(3)));
        return { ...p, stock: nextStock };
      }),
    );

    updateSales((prev) => [...prev, record]);
    setCart([]);
    setIsSeniorPwd(false);
    setPriceMode('retail');
    setCheckoutOpen(false);
    setMobileCartOpen(false);
    setReceiptReading(null);
    setReceiptSale(record);
    toast(`Sale ${receiptNo} completed (${formatPeso(record.grandTotal)})`, 'success');
  };

  // Hold & Recall orders
  const handleConfirmHold = (label?: string) => {
    if (cart.length === 0) return;
    const id = 'HOLD-' + String(Date.now()).slice(-4);
    const entry: HeldOrder = {
      id,
      label,
      time: new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
      items: cart,
      total: cartTotals.grandTotal,
      isSeniorPwd,
      priceMode,
    };
    updateHeld((prev) => [entry, ...prev]);
    setCart([]);
    setIsSeniorPwd(false);
    setPriceMode('retail');
    setHoldModalOpen(false);
    setMobileCartOpen(false);
    toast(`Order parked${label ? ` (${label})` : ''}`, 'success');
  };

  const handleRecallOrder = (id: string) => {
    const order = heldOrders.find((h) => h.id === id);
    if (!order) return;

    // Validate recalled lines against live stock so stale parked baskets cannot oversell
    let adjustedCount = 0;
    const validatedItems: CartLine[] = [];
    for (const line of order.items) {
      const liveProd = productMap.get(line.productId);
      if (!liveProd || liveProd.stock <= 0) {
        adjustedCount++;
        continue;
      }
      if (line.qty > liveProd.stock + 1e-6) {
        adjustedCount++;
        validatedItems.push({ ...line, qty: liveProd.stock });
      } else {
        validatedItems.push(line);
      }
    }

    // If cashier currently has an active non-empty basket, auto-park it so nothing is lost
    const autoParkedEntry: HeldOrder | null =
      cart.length > 0
        ? {
            id: 'HOLD-' + String(Date.now()).slice(-4),
            label: 'Auto-parked before recall',
            time: new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
            items: cart,
            total: cartTotals.grandTotal,
            isSeniorPwd,
            priceMode,
          }
        : null;

    setCart(validatedItems);
    setIsSeniorPwd(Boolean(order.isSeniorPwd));
    setPriceMode(order.priceMode === 'wholesale' ? 'wholesale' : 'retail');
    updateHeld((prev) => {
      const remaining = prev.filter((h) => h.id !== id);
      return autoParkedEntry ? [autoParkedEntry, ...remaining] : remaining;
    });
    setHeldModalOpen(false);
    setActiveTab('pos');

    if (adjustedCount > 0) {
      toast(
        `Recalled ${order.label || order.id} (${adjustedCount} line adjusted to live stock)`,
        'warning',
      );
    } else {
      toast(
        `Recalled ${order.label || order.id}${autoParkedEntry ? ' (current basket auto-parked)' : ''}`,
        'success',
      );
    }
  };

  // X-Read / Z-Read
  const handlePrintReading = (isZ: boolean) => {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today.getTime() + DAY_MS);
    const todaySales = sales.filter((s) => inRange(s, today, tomorrow));
    const live = todaySales.filter((s) => !s.voided);
    const voided = todaySales.filter((s) => s.voided);
    const st = computeSalesStats(live, products);

    let nextZCount = settings.zCount || 0;
    if (isZ) {
      nextZCount += 1;
      updateSettings({ ...settings, zCount: nextZCount });
    }

    const lines: ReadingReport['lines'] = [
      { label: 'Date', value: today.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) },
      ...(isZ ? [{ label: 'Z-Counter', value: `#${nextZCount}` }] : []),
      { label: 'Valid Transactions', value: String(st.count) },
      { label: 'Voided Transactions', value: String(voided.length), dividerAfter: true },
      { label: 'Gross Sales', value: formatPeso(st.gross) },
      { label: 'Wholesale Savings', value: `-${formatPeso(st.wholesaleDisc)}` },
      { label: 'SC/PWD Discounts', value: `-${formatPeso(st.seniorDisc)}` },
      { label: 'NET SALES', value: formatPeso(st.net), bold: true },
      { label: 'Est. Profit', value: formatPeso(st.profit), dividerAfter: true },
      ...Object.entries(st.tender).map(([method, data]) => ({
        label: `${method} (${data.n})`,
        value: formatPeso(data.amt),
      })),
    ];

    setReceiptSale(null);
    setReceiptReading({
      title: isZ ? 'Z-READ END OF DAY' : 'X-READ SHIFT SUMMARY',
      subtitle: new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
      lines,
    });
  };

  // Settings navigation with PIN protection
  const openSettingsTab = () => {
    if (!pinIsSet(settings)) {
      setPinModal({ open: true, mode: 'setup', purpose: 'settings' });
      return;
    }
    if (settingsUnlocked) {
      setActiveTab('settings');
      return;
    }
    setPinModal({ open: true, mode: 'unlock', purpose: 'settings' });
  };

  const handleSelectTab = (tab: TabName) => {
    if (tab === 'settings') {
      openSettingsTab();
    } else {
      setActiveTab(tab);
    }
  };

  // Inventory CRUD
  const editingProduct = useMemo(
    () => products.find((p) => p.id === productModal.editingId) || null,
    [products, productModal.editingId],
  );

  const handleSaveProduct = (data: Omit<Product, 'id'>, editId?: string) => {
    const nowIso = new Date().toISOString();
    if (editId) {
      updateProducts((prev) =>
        prev.map((p) => (p.id === editId ? { ...p, ...data, updatedAt: nowIso } : p)),
      );
      toast(`Updated ${data.name}`, 'success');
    } else {
      const id = 'SKU-' + Date.now().toString(36).toUpperCase();
      updateProducts((prev) => [{ id, ...data, updatedAt: nowIso }, ...prev]);
      toast(`Added ${data.name}`, 'success');
    }
    setProductModal({ open: false, editingId: null, initialBarcode: '' });
  };

  const handleApplyStockAdjust = ({
    productId,
    delta,
    reason,
    note,
    newExpiry,
    newCapital,
  }: {
    productId: string;
    delta: number;
    reason: StockLogEntry['reason'];
    note: string;
    newExpiry?: string;
    newCapital?: number;
  }) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const prevStock = prod.stock;
    const nextStock = Math.max(0, Number((prevStock + delta).toFixed(3)));

    updateProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? {
              ...p,
              stock: nextStock,
              expiry: newExpiry !== undefined ? newExpiry || undefined : p.expiry,
              capital: newCapital !== undefined ? newCapital : p.capital,
            }
          : p,
      ),
    );

    appendStockLog({
      id: 'LOG-' + Date.now().toString(36),
      dateIso: new Date().toISOString(),
      productId: prod.id,
      productName: prod.name,
      delta,
      prevStock,
      newStock: nextStock,
      reason,
      note: note || undefined,
    });

    setStockAdjustProduct(null);
    toast(`Stock updated: ${prod.name} (${nextStock} ${prod.unit})`, 'success');
  };

  const handleApplyBatchStock = (adjustments: BatchStockAdjustmentInput[]) => {
    const res = applyBatchStockUpdates(products, adjustments);
    if (res.changedCount === 0) {
      setBatchStockModal((b) => ({ ...b, open: false }));
      return;
    }
    updateProducts(() => res.nextProducts);
    if (res.logEntries.length > 0) {
      setStockLog((prev) => {
        const next = [...res.logEntries, ...prev].slice(0, 500);
        saveStockLogToStorage(next);
        return next;
      });
    }
    setBatchStockModal((b) => ({ ...b, open: false }));
    toast(`Batch saved: ${res.changedCount} SKU(s) updated cleanly`, 'success');
  };

  const handlePullExpiredBatch = () => {
    const warnDays = Number(settings.expiryWarnDays) || 30;
    const expiredWithStock = products.filter(
      (p) => p.stock > 0 && expiryInfo(p, warnDays).status === 'expired',
    );
    if (expiredWithStock.length === 0) {
      setInvStockFilter('EXPIRED');
      toast('All expired items already show 0 stock on shelf', 'warning');
      return;
    }
    setBatchStockModal({
      open: true,
      mode: 'set',
      reason: 'Spoilage / Expired',
      prefill: expiredWithStock.map((p) => ({
        productId: p.id,
        value: 0,
        note: 'Pull expired stock from shelf',
      })),
    });
  };

  const handlePreviewTestReceipt = (draft: StoreSettings) => {
    const paper = draft.receiptWidth === '58mm' ? '58mm' : '80mm';
    setReceiptSale(null);
    setReceiptReading({
      title: 'TEST RECEIPT LAYOUT',
      subtitle: `${paper} Thermal Width Preview · Non-Sales`,
      settingsOverride: draft,
      lines: [
        { label: 'Store', value: draft.storeName.trim() || 'OmniMart PH', bold: true },
        { label: 'Paper Width', value: paper },
        { label: 'Phone', value: draft.storePhone.trim() || '—', dividerAfter: true },
        { label: 'Sample Item A x2', value: formatPeso(50) },
        { label: 'Sample Item B x1', value: formatPeso(125), dividerAfter: true },
        { label: 'TOTAL SAMPLE', value: formatPeso(175), bold: true },
        { label: 'Footer Note', value: draft.receiptFooter.trim() || 'Thank you!' },
      ],
    });
  };

  const handleApplyCsvImport = (rows: CsvImportRowPreview[], mode: 'merge' | 'new-only') => {
    const nowIso = new Date().toISOString();
    const newLogs: StockLogEntry[] = [];
    let created = 0;
    let updated = 0;

    updateProducts((prev) => {
      const next = [...prev];
      const indexById = new Map(next.map((p, i) => [p.id, i]));

      for (const row of rows) {
        if (row.action === 'update' && mode === 'merge' && row.existing && row.data) {
          const idx = indexById.get(row.existing.id);
          if (idx === undefined) continue;
          const oldProd = next[idx];
          next[idx] = { ...oldProd, ...row.data };
          updated++;
          const delta = Number((row.data.stock - oldProd.stock).toFixed(3));
          if (delta !== 0) {
            newLogs.push({
              id: `LOG-${Date.now().toString(36)}-${row.rowNum}`,
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
          const id = `SKU-${Date.now().toString(36).toUpperCase()}-${row.rowNum}`;
          next.unshift({ id, ...row.data });
          created++;
          if (row.data.stock > 0) {
            newLogs.push({
              id: `LOG-${Date.now().toString(36)}-C${row.rowNum}`,
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
      return next;
    });

    if (newLogs.length > 0) {
      setStockLog((prev) => {
        const next = [...newLogs, ...prev].slice(0, 500);
        saveStockLogToStorage(next);
        return next;
      });
    }

    setCsvImportOpen(false);
    toast(
      `CSV import complete: +${created} new SKU(s)${updated > 0 ? `, ${updated} updated` : ''}`,
      'success',
    );
  };

  const handleSaveScReview = (eligibilityMap: Record<string, boolean>) => {
    updateProducts((prev) =>
      prev.map((p) =>
        typeof eligibilityMap[p.id] === 'boolean' ? { ...p, scEligible: eligibilityMap[p.id] } : p,
      ),
    );
    setScReviewOpen(false);
    toast('SC/PWD eligibility flags saved', 'success');
  };

  const handleConfirmVoid = (receiptNo: string, reason: string, upgradedSettings?: StoreSettings) => {
    if (upgradedSettings) updateSettings(upgradedSettings);
    const target = sales.find((s) => s.receiptNo === receiptNo);
    if (!target || target.voided) {
      setVoidTargetSale(null);
      return;
    }

    const nowIso = new Date().toISOString();
    const voidLogs: StockLogEntry[] = [];

    // Restore stock for each item and record audit entries
    updateProducts((prev) =>
      prev.map((p) => {
        const line = target.items.find((it) => it.productId === p.id || it.name === p.name);
        if (!line) return p;
        const nextStock = Number((p.stock + line.qty).toFixed(3));
        voidLogs.push({
          id: `LOG-${Date.now().toString(36)}-${p.id}`,
          dateIso: nowIso,
          productId: p.id,
          productName: p.name,
          delta: line.qty,
          prevStock: p.stock,
          newStock: nextStock,
          reason: 'Count Correction',
          note: `Void ${receiptNo}: ${reason}`,
        });
        return { ...p, stock: nextStock };
      }),
    );

    if (voidLogs.length > 0) {
      setStockLog((prev) => {
        const next = [...voidLogs, ...prev].slice(0, 500);
        saveStockLogToStorage(next);
        return next;
      });
    }

    updateSales((prev) =>
      prev.map((s) =>
        s.receiptNo === receiptNo
          ? { ...s, voided: true, voidedAt: nowIso, voidReason: reason }
          : s,
      ),
    );

    void logSecurityEvent(
      'SALE_VOIDED',
      `Voided receipt ${receiptNo} (${formatPeso(target.grandTotal)}) — ${reason}`,
      'warning',
    );
    setVoidTargetSale(null);
    toast(`Receipt ${receiptNo} voided and stock restored`, 'warning');
  };

  const handleApplyRestore = (
    payload: {
      products: Product[];
      sales: SaleRecord[];
      heldOrders: HeldOrder[];
      settings?: Partial<StoreSettings>;
    },
    mode: 'replace' | 'merge',
  ) => {
    if (mode === 'replace') {
      updateProducts(() => payload.products);
      updateSales(() => payload.sales);
      updateHeld(() => payload.heldOrders);
      if (payload.settings) {
        // Never overwrite current device Manager PIN or FIDO2 Passkey during restore
        const mergedSettings: StoreSettings = {
          ...DEFAULT_SETTINGS,
          ...payload.settings,
          adminPin: settings.adminPin,
          adminPinHash: settings.adminPinHash,
          adminPinSalt: settings.adminPinSalt,
          adminPinIter: settings.adminPinIter,
          adminPinAlgo: settings.adminPinAlgo,
          adminPinWeak: settings.adminPinWeak,
          passkeyCredId: settings.passkeyCredId,
          passkeyPubKeySpki: settings.passkeyPubKeySpki,
          passkeyLabel: settings.passkeyLabel,
          passkeyRegisteredAt: settings.passkeyRegisteredAt,
        };
        updateSettings(mergedSettings);
      }
      void logSecurityEvent(
        'BACKUP_RESTORED',
        `Replaced device store from backup (${payload.products.length} SKUs, ${payload.sales.length} sales); credentials preserved`,
        'warning',
      );
      toast('Backup restored (device PIN & Passkeys preserved)', 'success');
      return;
    }

    // Merge mode: preserve all existing records, add only missing SKUs/receipts/held orders
    let addedProds = 0;
    updateProducts((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const existingBarcodes = new Set(prev.map((p) => normBarcode(p.barcode)).filter(Boolean));
      const newcomers = payload.products.filter(
        (p) => !existingIds.has(p.id) && (!normBarcode(p.barcode) || !existingBarcodes.has(normBarcode(p.barcode))),
      );
      addedProds = newcomers.length;
      return [...prev, ...newcomers];
    });

    let addedSales = 0;
    updateSales((prev) => {
      const existingReceipts = new Set(prev.map((s) => s.receiptNo));
      const newcomers = payload.sales.filter((s) => !existingReceipts.has(s.receiptNo));
      addedSales = newcomers.length;
      return [...prev, ...newcomers];
    });

    updateHeld((prev) => {
      const ids = new Set(prev.map((h) => h.id));
      return [...prev, ...payload.heldOrders.filter((h) => !ids.has(h.id))];
    });

    void logSecurityEvent(
      'BACKUP_RESTORED',
      `Merged backup (+${addedProds} products, +${addedSales} sales)`,
      'info',
    );
    toast(`Merged +${addedProds} products and +${addedSales} receipts safely`, 'success');
  };

  const handleConfirmAction = (upgradedSettings?: StoreSettings) => {
    if (upgradedSettings) {
      updateSettings(upgradedSettings);
      void logSecurityEvent('PIN_UPGRADED', 'Auto-upgraded Manager PIN to PBKDF2-SHA512 (310k)', 'info');
    }
    if (!confirmState) return;
    const { type, productId } = confirmState;

    if (type === 'delete-product' && productId) {
      updateProducts((prev) => prev.filter((p) => p.id !== productId));
      setCart((prev) => prev.filter((c) => c.productId !== productId));
      toast('Product deleted', 'warning');
    } else if (type === 'clear-cart') {
      setCart([]);
      setIsSeniorPwd(false);
      setMobileCartOpen(false);
      toast('Basket cleared', 'warning');
    } else if (type === 'clear-sales') {
      updateSales(() => []);
      void logSecurityEvent('DATA_CLEARED', `Cleared all sales history (${sales.length} receipts removed)`, 'critical');
      toast('Sales history cleared', 'warning');
    } else if (type === 'factory-reset') {
      const freshCatalog = buildDefaultCatalog();
      updateProducts(() => freshCatalog);
      updateSales(() => []);
      updateHeld(() => []);
      setCart([]);
      setStockLog([]);
      saveStockLogToStorage([]);
      updateSettings({ ...DEFAULT_SETTINGS });
      setSettingsUnlocked(false);
      setTerminalLocked(false);
      setActiveTab('pos');
      void logSecurityEvent('FACTORY_RESET', 'Factory reset executed on POS device', 'critical');
      toast('App reset to factory defaults', 'warning');
    }
    setConfirmState(null);
  };

  const activeCategoryForSheet = activeTab === 'inventory' ? invCategory : posCategory;

  const handleAssistantAction = (action: AssistantAction) => {
    setAssistantOpen(false);
    switch (action.type) {
      case 'open-reorder':
        setActiveTab('inventory');
        setReorderOpen(true);
        break;
      case 'open-stock-filter':
        setInvCategory('All');
        setInvSearch('');
        setInvStockFilter(action.filter);
        setActiveTab('inventory');
        break;
      case 'open-sc-review':
        setActiveTab('inventory');
        setScReviewOpen(true);
        break;
      case 'open-batch-restock':
        setActiveTab('inventory');
        setBatchStockModal({ open: true, mode: 'delta' });
        break;
      case 'open-csv-import':
        setActiveTab('inventory');
        setCsvImportOpen(true);
        break;
      case 'open-stock-log':
        setActiveTab('inventory');
        setStockLogOpen(true);
        break;
      case 'open-receipt': {
        const target = sales.find((s) => s.receiptNo === action.receiptNo);
        if (target) {
          setReceiptReading(null);
          setReceiptSale(target);
        } else {
          setActiveTab('sales');
        }
        break;
      }
      case 'open-sales':
        setActiveTab('sales');
        break;
      case 'open-xread':
        setActiveTab('sales');
        handlePrintReading(false);
        break;
      case 'open-zread':
        setActiveTab('sales');
        handlePrintReading(true);
        break;
      case 'open-cash-drawer':
        setSalesCashDrawerSignal((n) => n + 1);
        setActiveTab('sales');
        break;
      case 'add-to-cart': {
        const targetProd = productMap.get(action.productId);
        if (targetProd) {
          addQtyToCart(targetProd, action.qty || 1);
          setActiveTab('pos');
          toast(`Added ${action.qty || 1}× ${targetProd.name} to basket`, 'success');
        }
        break;
      }
      case 'find-product-stock':
        setInvCategory('All');
        setInvStockFilter('ALL');
        setInvSearch(action.query);
        setActiveTab('inventory');
        break;
      case 'open-held':
        setActiveTab('pos');
        setHeldModalOpen(true);
        break;
      case 'open-settings':
        openSettingsTab();
        break;
      case 'open-scanner':
        setActiveTab('pos');
        setScannerState({ open: true, mode: 'pos' });
        break;
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      <TopBar
        storeName={settings.storeName}
        activeTab={activeTab}
        lowStockCount={lowStockCount}
        hasPin={pinIsSet(settings)}
        onSelectTab={handleSelectTab}
        onOpenSettings={openSettingsTab}
        onOpenAssistant={() => setAssistantOpen(true)}
        onLockTerminal={handleLockTerminal}
      />

      {activeTab === 'pos' && (
        <PosView
          products={products}
          cart={cart}
          totals={cartTotals}
          priceMode={priceMode}
          selectedCategory={posCategory}
          searchQuery={posSearch}
          lowStockThreshold={Number(settings.lowStockThreshold) || 10}
          expiryWarnDays={Number(settings.expiryWarnDays) || 30}
          heldCount={heldOrders.length}
          isSeniorPwd={isSeniorPwd}
          mobileCartOpen={mobileCartOpen}
          fastMoverIds={fastMoverIds}
          onSetSearchQuery={setPosSearch}
          onSearchEnter={handleSearchEnter}
          onSetPriceMode={handleSetPriceMode}
          onSelectCategory={setPosCategory}
          onOpenCategorySheet={() => setCategorySheetOpen(true)}
          onOpenScanner={() => setScannerState({ open: true, mode: 'pos' })}
          onProductClick={handleProductClick}
          onChangeCartQty={handleChangeCartQty}
          onSetCartQty={handleSetCartQty}
          onRemoveCartLine={(pid) => setCart((prev) => prev.filter((l) => l.productId !== pid))}
          onSetLinePriceType={handleSetLinePriceType}
          onUnlockWholesaleLine={handleUnlockWholesaleLine}
          onToggleSeniorPwd={setIsSeniorPwd}
          onHoldCart={() => setHoldModalOpen(true)}
          onOpenHeldModal={() => setHeldModalOpen(true)}
          onClearCart={() =>
            setConfirmState({
              open: true,
              type: 'clear-cart',
              title: 'Clear Basket?',
              message: `Remove all ${cart.length} item(s) from the current order?`,
              confirmLabel: 'Clear Basket',
              danger: true,
            })
          }
          onOpenCheckout={() => setCheckoutOpen(true)}
          onOpenMobileCart={() => setMobileCartOpen(true)}
          onCloseMobileCart={() => setMobileCartOpen(false)}
        />
      )}

      {activeTab === 'inventory' && (
        <InventoryView
          products={products}
          sales={sales}
          settings={settings}
          selectedCategory={invCategory}
          activeStockFilter={invStockFilter}
          onChangeStockFilter={setInvStockFilter}
          lowStockThreshold={Number(settings.lowStockThreshold) || 10}
          expiryWarnDays={Number(settings.expiryWarnDays) || 30}
          stockLogCount={stockLog.length}
          searchQuery={invSearch}
          onSetSearchQuery={setInvSearch}
          onSelectCategory={setInvCategory}
          onOpenCategorySheet={() => setCategorySheetOpen(true)}
          onOpenScanner={() => setScannerState({ open: true, mode: 'inventory' })}
          onOpenScReview={() => setScReviewOpen(true)}
          onOpenReorder={() => setReorderOpen(true)}
          onOpenBatchStock={(mode = 'delta') => setBatchStockModal({ open: true, mode })}
          onOpenCsvImport={() => setCsvImportOpen(true)}
          onOpenStockLog={() => setStockLogOpen(true)}
          onOpenProductModal={(pid) =>
            setProductModal({ open: true, editingId: pid || null, initialBarcode: '' })
          }
          onOpenStockAdjust={(pid) => {
            const p = productMap.get(pid) || null;
            setStockAdjustProduct(p);
          }}
          onPullExpiredBatch={handlePullExpiredBatch}
          onAskDeleteProduct={(pid) => {
            const p = productMap.get(pid);
            if (!p) return;
            setConfirmState({
              open: true,
              type: 'delete-product',
              productId: pid,
              title: 'Delete Product?',
              message: `Remove "${p.name}" from inventory? Past sales receipts remain intact.`,
              confirmLabel: 'Delete Product',
              danger: true,
            });
          }}
          onToast={toast}
        />
      )}

      {activeTab === 'sales' && (
        <SalesView
          sales={sales}
          products={products}
          openCashDrawerSignal={salesCashDrawerSignal}
          onReprintReceipt={(s) => {
            setReceiptReading(null);
            setReceiptSale(s);
          }}
          onVoidSale={(receiptNo) => {
            const target = sales.find((s) => s.receiptNo === receiptNo) || null;
            setVoidTargetSale(target);
          }}
          onPrintReading={handlePrintReading}
          onToast={toast}
        />
      )}

      {activeTab === 'settings' && (!pinIsSet(settings) || settingsUnlocked) && (
        <SettingsView
          settings={settings}
          products={products}
          sales={sales}
          heldOrders={heldOrders}
          stockLog={stockLog}
          configHistory={configHistory}
          securityLog={securityLog}
          deviceKeyReady={deviceKeyReady}
          onSaveSettings={updateSettings}
          onCreateConfigCheckpoint={handleCreateConfigCheckpoint}
          onRollbackConfig={handleRollbackConfig}
          onLockSettings={() => {
            setSettingsUnlocked(false);
            setActiveTab('pos');
            void logSecurityEvent('SETTINGS_LOCK', 'Manager locked Store Settings manually', 'info');
            toast('Settings locked', 'success');
          }}
          onLockTerminal={handleLockTerminal}
          onPreviewTestReceipt={handlePreviewTestReceipt}
          onLogSecurityEvent={logSecurityEvent}
          onApplyRestore={handleApplyRestore}
          onAskClearSales={() =>
            setConfirmState({
              open: true,
              type: 'clear-sales',
              title: 'Clear All Sales History?',
              message: `This will permanently delete ${sales.length} receipt(s) from this device. Inventory items are kept.`,
              confirmLabel: 'Clear Sales History',
              danger: true,
              requirePin: true,
            })
          }
          onAskFactoryReset={() =>
            setConfirmState({
              open: true,
              type: 'factory-reset',
              title: 'Factory Reset OmniMart POS?',
              message: 'This erases all custom products, sales, held orders, and settings, restoring the default starter catalog.',
              confirmLabel: 'Reset Everything',
              danger: true,
              requirePin: true,
            })
          }
          syncStatus={syncStatus}
          syncBusy={syncBusy}
          syncError={syncError}
          isOnline={isOnline}
          onSyncNow={(mode) => handleSyncWithSupabase(mode, false)}
          onRefreshSyncStatus={refreshSyncStatus}
          onToast={toast}
        />
      )}

      {/* Modals */}
      <CategorySheetModal
        open={categorySheetOpen}
        products={products}
        selectedCategory={activeCategoryForSheet}
        lowStockThreshold={Number(settings.lowStockThreshold) || 10}
        onSelectCategory={(cat) => {
          if (activeTab === 'inventory') setInvCategory(cat);
          else setPosCategory(cat);
        }}
        onClose={() => setCategorySheetOpen(false)}
      />

      <ProductModal
        open={productModal.open}
        editingProduct={editingProduct}
        initialBarcode={productModal.initialBarcode}
        allProducts={products}
        onOpenScanner={() => setScannerState({ open: true, mode: 'product-form' })}
        onSave={handleSaveProduct}
        onClose={() => setProductModal({ open: false, editingId: null, initialBarcode: '' })}
        onToast={toast}
      />

      <StockAdjustModal
        product={stockAdjustProduct}
        onClose={() => setStockAdjustProduct(null)}
        onApply={handleApplyStockAdjust}
      />

      <BatchStockModal
        open={batchStockModal.open}
        products={products}
        initialMode={batchStockModal.mode}
        initialReason={batchStockModal.reason}
        prefill={batchStockModal.prefill}
        onClose={() => setBatchStockModal((b) => ({ ...b, open: false }))}
        onApplyBatch={handleApplyBatchStock}
      />

      <CsvStockImportModal
        open={csvImportOpen}
        products={products}
        onClose={() => setCsvImportOpen(false)}
        onApplyImport={handleApplyCsvImport}
      />

      <StockLogModal
        open={stockLogOpen}
        stockLog={stockLog}
        onClose={() => setStockLogOpen(false)}
        onToast={toast}
      />

      <ScReviewModal
        open={scReviewOpen}
        products={products}
        onSave={handleSaveScReview}
        onClose={() => setScReviewOpen(false)}
      />

      <ReorderModal
        open={reorderOpen}
        products={products}
        sales={sales}
        settings={settings}
        onUpdateDays={(lead, safety) =>
          updateSettings({ ...settings, reorderLeadDays: lead, reorderSafetyDays: safety })
        }
        onOpenBatchReorder={(prefill) => {
          setReorderOpen(false);
          setBatchStockModal({ open: true, mode: 'delta', prefill });
        }}
        onQuickRestock={(pid) => {
          const prod = productMap.get(pid) || null;
          setReorderOpen(false);
          setStockAdjustProduct(prod);
        }}
        onClose={() => setReorderOpen(false)}
        onToast={toast}
      />

      <CheckoutModal
        open={checkoutOpen}
        totals={cartTotals}
        itemCount={cart.length}
        onClose={() => setCheckoutOpen(false)}
        onCompleteSale={handleCompleteSale}
      />

      <ReceiptModal
        open={!!(receiptSale || receiptReading)}
        sale={receiptSale}
        reading={receiptReading}
        settings={receiptReading?.settingsOverride || settings}
        onClose={() => {
          setReceiptSale(null);
          setReceiptReading(null);
        }}
        onToast={toast}
      />

      <BarcodeScannerModal
        open={scannerState.open}
        mode={scannerState.mode}
        products={products}
        cart={cart}
        cartTotal={cartTotals.grandTotal}
        beepEnabled={!!settings.beep}
        vibrateEnabled={!!settings.vibrate}
        onClose={() => setScannerState((s) => ({ ...s, open: false }))}
        onScanProduct={(prod) => {
          if (scannerState.mode === 'inventory') {
            setInvSearch(prod.barcode || prod.name);
            setScannerState((s) => ({ ...s, open: false }));
            toast(`Found ${prod.name}`, 'success');
          } else {
            addQtyToCart(prod, 1);
          }
        }}
        onUnknownBarcode={(barcode, mode) => {
          setScannerState((s) => ({ ...s, open: false }));
          if (mode === 'inventory' || mode === 'pos') {
            setActiveTab('inventory');
            setProductModal({ open: true, editingId: null, initialBarcode: barcode });
          }
        }}
        onPopulateFormBarcode={(barcode) => {
          setScannerState((s) => ({ ...s, open: false }));
          setProductModal((pm) => ({ ...pm, initialBarcode: barcode }));
        }}
        onChangeCartQty={handleChangeCartQty}
        onProceedCheckout={() => {
          setScannerState((s) => ({ ...s, open: false }));
          if (cart.length > 0) setCheckoutOpen(true);
        }}
      />

      <WeightModal
        product={weightProduct}
        unitPrice={
          weightProduct
            ? round2(
                priceMode === 'wholesale' &&
                  weightProduct.wholesalePrice > 0 &&
                  weightProduct.wholesalePrice < weightProduct.retailPrice &&
                  !(Number(weightProduct.capital) > 0 && weightProduct.wholesalePrice < Number(weightProduct.capital))
                  ? weightProduct.wholesalePrice
                  : weightProduct.retailPrice,
              )
            : 0
        }
        onClose={() => setWeightProduct(null)}
        onConfirm={(pid, weightKg) => {
          const p = products.find((x) => x.id === pid);
          if (p) addQtyToCart(p, weightKg);
          setWeightProduct(null);
        }}
      />

      <HoldCartModal
        open={holdModalOpen}
        itemCount={cart.length}
        total={cartTotals.grandTotal}
        onClose={() => setHoldModalOpen(false)}
        onConfirmHold={handleConfirmHold}
      />

      <HeldOrdersModal
        open={heldModalOpen}
        heldOrders={heldOrders}
        onClose={() => setHeldModalOpen(false)}
        onRecall={handleRecallOrder}
        onDeleteHeld={(id) => {
          updateHeld((prev) => prev.filter((h) => h.id !== id));
          toast('Parked order deleted', 'warning');
        }}
      />

      <PinModal
        open={pinModal.open}
        mode={pinModal.mode}
        settings={settings}
        onClose={() => setPinModal((p) => ({ ...p, open: false }))}
        onPinFail={(lockedOutNow, ctx) => {
          void logSecurityEvent(
            lockedOutNow ? 'PIN_LOCKOUT' : 'PIN_FAIL',
            `${lockedOutNow ? 'Exponential lockout triggered' : 'Failed PIN attempt'} during ${ctx || 'Settings unlock'}`,
            lockedOutNow ? 'critical' : 'warning',
          );
        }}
        onSuccess={(updated, meta) => {
          if (updated) updateSettings(updated);
          if (pinModal.mode === 'setup') {
            void logSecurityEvent('PIN_SET', 'Created initial PBKDF2-SHA512 (310k) Manager PIN', 'info');
          } else {
            if (meta?.upgradedAlgo) {
              void logSecurityEvent('PIN_UPGRADED', 'Legacy PIN transparently upgraded to PBKDF2-SHA512 (310k)', 'info');
            }
            void logSecurityEvent(
              meta?.viaPasskey ? 'PASSKEY_UNLOCK' : 'SETTINGS_UNLOCK',
              meta?.viaPasskey ? 'Settings unlocked via FIDO2 Passkey' : 'Settings unlocked via Manager PIN',
              'info',
            );
          }
          setPinModal((p) => ({ ...p, open: false }));
          setSettingsUnlocked(true);
          setActiveTab('settings');
        }}
      />

      <PinModal
        open={terminalLocked}
        mode="unlock"
        persistent
        title="POS Terminal Locked"
        subtitle="Screen locked. Verify with Manager PIN or registered Passkey to continue."
        settings={settings}
        onClose={() => {}}
        onPinFail={(lockedOutNow, ctx) => {
          void logSecurityEvent(
            lockedOutNow ? 'PIN_LOCKOUT' : 'PIN_FAIL',
            `${lockedOutNow ? 'Lockout triggered' : 'Failed PIN attempt'} at ${ctx || 'Terminal lockscreen'}`,
            lockedOutNow ? 'critical' : 'warning',
          );
        }}
        onSuccess={(updated, meta) => {
          if (updated) updateSettings(updated);
          if (meta?.upgradedAlgo) {
            void logSecurityEvent('PIN_UPGRADED', 'Legacy PIN transparently upgraded to PBKDF2-SHA512 (310k)', 'info');
          }
          void logSecurityEvent(
            meta?.viaPasskey ? 'PASSKEY_UNLOCK' : 'POS_UNLOCK',
            meta?.viaPasskey ? 'Terminal unlocked via FIDO2 Passkey' : 'Terminal unlocked via Manager PIN',
            'info',
          );
          setTerminalLocked(false);
        }}
      />

      <VoidSaleModal
        sale={voidTargetSale}
        settings={settings}
        onClose={() => setVoidTargetSale(null)}
        onPinFail={(lockedOutNow, ctx) => {
          void logSecurityEvent(
            lockedOutNow ? 'PIN_LOCKOUT' : 'PIN_FAIL',
            `${lockedOutNow ? 'Lockout triggered' : 'Failed PIN attempt'} on ${ctx || 'Sale void'}`,
            lockedOutNow ? 'critical' : 'warning',
          );
        }}
        onConfirmVoid={handleConfirmVoid}
      />

      <ConfirmModal
        open={!!confirmState?.open}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger}
        requirePin={confirmState?.requirePin}
        settings={settings}
        onClose={() => setConfirmState(null)}
        onPinFail={(lockedOutNow, ctx) => {
          void logSecurityEvent(
            lockedOutNow ? 'PIN_LOCKOUT' : 'PIN_FAIL',
            `${lockedOutNow ? 'Lockout triggered' : 'Failed PIN attempt'} on ${ctx || 'Protected action'}`,
            lockedOutNow ? 'critical' : 'warning',
          );
        }}
        onConfirm={handleConfirmAction}
      />

      <AssistantWidget
        open={assistantOpen}
        products={products}
        sales={sales}
        heldOrders={heldOrders}
        settings={settings}
        cart={cart}
        stockLog={stockLog}
        securityLog={securityLog}
        onExecuteAction={handleAssistantAction}
        onClose={() => setAssistantOpen(false)}
      />

      <ToastContainer toasts={toasts} scannerOpen={scannerState.open} />
    </div>
  );
}
