import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CartLine,
  ConfigSnapshot,
  HeldOrder,
  PaymentMethod,
  PriceType,
  Product,
  SaleRecord,
  ScannerMode,
  StockLogEntry,
  StoreSettings,
  TabName,
} from './types';
import {
  applyBatchStockUpdates,
  buildDefaultCatalog,
  computeCartTotals,
  computeSalesStats,
  DAY_MS,
  DEFAULT_SETTINGS,
  diffConfigFields,
  extractGs1Gtin,
  findProductByBarcode,
  formatPeso,
  getLinePrice,
  inRange,
  linePricing,
  lineTotalPeso,
  nextReceiptNo,
  normBarcode,
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
  loadConfigHistoryFromStorage,
  loadHeldFromStorage,
  loadProductsFromStorage,
  loadSalesFromStorage,
  loadSettingsFromStorage,
  loadStockLogFromStorage,
  saveConfigHistoryToStorage,
  saveHeldToStorage,
  saveProductsToStorage,
  saveSalesToStorage,
  saveSettingsToStorage,
  saveStockLogToStorage,
} from './utils/storage';

import { TopBar } from './components/TopBar';
import { ToastContainer, type ToastItem } from './components/ToastContainer';
import { CategorySheetModal } from './components/CategorySheetModal';
import { PosView } from './components/PosView';
import { InventoryView } from './components/InventoryView';
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

  // Navigation & filter state
  const [activeTab, setActiveTab] = useState<TabName>('pos');
  const [posCategory, setPosCategory] = useState('All');
  const [invCategory, setInvCategory] = useState('All');
  const [posSearch, setPosSearch] = useState('');
  const [invSearch, setInvSearch] = useState('');

  // Active POS basket state
  const [cart, setCart] = useState<CartLine[]>([]);
  const [priceMode, setPriceMode] = useState<PriceType>('retail');
  const [isSeniorPwd, setIsSeniorPwd] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Settings lock session
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
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
    prefill?: BatchPrefillItem[];
  }>({ open: false, mode: 'delta' });
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [stockLogOpen, setStockLogOpen] = useState(false);
  const [scReviewOpen, setScReviewOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);

  const [voidTargetSale, setVoidTargetSale] = useState<SaleRecord | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
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

  // Derived cart totals
  const cartTotals = useMemo(
    () => computeCartTotals(cart, products, isSeniorPwd, settings),
    [cart, products, isSeniorPwd, settings],
  );

  const lowStockCount = useMemo(() => {
    const th = Number(settings.lowStockThreshold) || 10;
    return products.filter((p) => p.stock <= th).length;
  }, [products, settings.lowStockThreshold]);

  // Persistence wrappers
  const updateProducts = useCallback(
    (updater: (prev: Product[]) => Product[]) => {
      setProducts((prev) => {
        const next = updater(prev);
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

  // Settings 5-minute inactivity auto-lock
  const lastSettingsActivityRef = useRef(Date.now());
  useEffect(() => {
    if (activeTab !== 'settings' || !settingsUnlocked || !pinIsSet(settings)) return;
    lastSettingsActivityRef.current = Date.now();
    const bump = () => {
      lastSettingsActivityRef.current = Date.now();
    };
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    const id = setInterval(() => {
      if (Date.now() - lastSettingsActivityRef.current > 5 * 60 * 1000) {
        setSettingsUnlocked(false);
        setActiveTab('pos');
        toast('Settings locked after 5 minutes of inactivity', 'warning');
      }
    }, 15000);
    return () => {
      clearInterval(id);
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
    };
  }, [activeTab, settingsUnlocked, settings, toast]);

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
            products,
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
    [priceMode, products, toast],
  );

  const handleProductClick = useCallback(
    (productId: string) => {
      const prod = products.find((p) => p.id === productId);
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
    [addQtyToCart, products, toast],
  );

  const handleChangeCartQty = useCallback(
    (productId: string, delta: number) => {
      const prod = products.find((p) => p.id === productId);
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
    [products, toast],
  );

  const handleSetCartQty = useCallback(
    (productId: string, rawValue: string) => {
      const parsed = parseFloat(rawValue);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setCart((prev) => prev.filter((l) => l.productId !== productId));
        return;
      }
      const prod = products.find((p) => p.id === productId);
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
    [products, toast],
  );

  const handleSetPriceMode = useCallback(
    (mode: PriceType) => {
      setPriceMode(mode);
      setCart((prev) =>
        prev.map((line) => {
          if (mode === 'retail') return { ...line, priceType: 'retail' };
          const blk = wholesaleBlock(line, products);
          return blk === null ? { ...line, priceType: 'wholesale' } : line;
        }),
      );
    },
    [products],
  );

  const handleSetLinePriceType = useCallback(
    (productId: string, type: PriceType) => {
      const line = cart.find((l) => l.productId === productId);
      if (!line) return;
      if (type === 'wholesale') {
        const blk = wholesaleBlock(line, products);
        if (blk === 'none') {
          toast('No wholesale discount configured for this item', 'warning');
          return;
        }
        if (blk === 'cost') {
          toast('Wholesale price is below capital cost (blocked)', 'warning');
          return;
        }
        if (blk === 'qty') {
          const minQ = linePricing(line, products).minQty;
          toast(`Need at least ${minQ} ${line.unit} for wholesale price`, 'warning');
          return;
        }
      }
      setCart((prev) =>
        prev.map((l) => (l.productId === productId ? { ...l, priceType: type } : l)),
      );
    },
    [cart, products, toast],
  );

  const handleSearchEnter = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      const byBc = findProductByBarcode(q, products);
      if (byBc) {
        handleProductClick(byBc.id);
        setPosSearch('');
        return;
      }
      const lower = q.toLowerCase();
      const matches = products.filter(
        (p) => p.name.toLowerCase().includes(lower) || normBarcode(p.barcode) === normBarcode(q),
      );
      if (matches.length === 1) {
        handleProductClick(matches[0].id);
        setPosSearch('');
      }
    },
    [handleProductClick, products],
  );

  // Global hardware wedge barcode scanner (fast keystroke burst + Enter)
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
      if (e.key === 'Escape') {
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
  }, [activeTab, cart.length, products, addQtyToCart, toast]);

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
      const prod = products.find((p) => p.id === line.productId);
      const unitPrice = getLinePrice(line, products);
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
    };
    updateHeld((prev) => [entry, ...prev]);
    setCart([]);
    setIsSeniorPwd(false);
    setHoldModalOpen(false);
    setMobileCartOpen(false);
    toast(`Order parked${label ? ` (${label})` : ''}`, 'success');
  };

  const handleRecallOrder = (id: string) => {
    const order = heldOrders.find((h) => h.id === id);
    if (!order) return;
    setCart(order.items);
    updateHeld((prev) => prev.filter((h) => h.id !== id));
    setHeldModalOpen(false);
    setActiveTab('pos');
    toast(`Recalled ${order.label || order.id}`, 'success');
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
    if (editId) {
      updateProducts((prev) => prev.map((p) => (p.id === editId ? { ...p, ...data } : p)));
      toast(`Updated ${data.name}`, 'success');
    } else {
      const id = 'SKU-' + Date.now().toString(36).toUpperCase();
      updateProducts((prev) => [{ id, ...data }, ...prev]);
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

    // Restore stock for each item
    updateProducts((prev) =>
      prev.map((p) => {
        const line = target.items.find((it) => it.productId === p.id || it.name === p.name);
        if (!line) return p;
        return { ...p, stock: Number((p.stock + line.qty).toFixed(3)) };
      }),
    );

    updateSales((prev) =>
      prev.map((s) =>
        s.receiptNo === receiptNo
          ? { ...s, voided: true, voidedAt: new Date().toISOString(), voidReason: reason }
          : s,
      ),
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
        // Never overwrite current device Manager PIN during restore
        const mergedSettings: StoreSettings = {
          ...DEFAULT_SETTINGS,
          ...payload.settings,
          adminPin: settings.adminPin,
          adminPinHash: settings.adminPinHash,
          adminPinSalt: settings.adminPinSalt,
          adminPinIter: settings.adminPinIter,
          adminPinWeak: settings.adminPinWeak,
        };
        updateSettings(mergedSettings);
      }
      toast('Backup restored (device PIN preserved)', 'success');
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

    toast(`Merged +${addedProds} products and +${addedSales} receipts safely`, 'success');
  };

  const handleConfirmAction = (upgradedSettings?: StoreSettings) => {
    if (upgradedSettings) updateSettings(upgradedSettings);
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
      setActiveTab('pos');
      toast('App reset to factory defaults', 'warning');
    }
    setConfirmState(null);
  };

  const activeCategoryForSheet = activeTab === 'inventory' ? invCategory : posCategory;

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      <TopBar
        storeName={settings.storeName}
        activeTab={activeTab}
        lowStockCount={lowStockCount}
        onSelectTab={handleSelectTab}
        onOpenSettings={openSettingsTab}
        onOpenAssistant={() => setAssistantOpen(true)}
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
            const p = products.find((x) => x.id === pid) || null;
            setStockAdjustProduct(p);
          }}
          onAskDeleteProduct={(pid) => {
            const p = products.find((x) => x.id === pid);
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

      {activeTab === 'settings' && (
        <SettingsView
          settings={settings}
          products={products}
          sales={sales}
          heldOrders={heldOrders}
          stockLog={stockLog}
          configHistory={configHistory}
          onSaveSettings={updateSettings}
          onCreateConfigCheckpoint={handleCreateConfigCheckpoint}
          onRollbackConfig={handleRollbackConfig}
          onLockSettings={() => {
            setSettingsUnlocked(false);
            setActiveTab('pos');
            toast('Settings locked', 'success');
          }}
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
          const prod = products.find((p) => p.id === pid) || null;
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
        settings={settings}
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
        onSuccess={(updated) => {
          if (updated) updateSettings(updated);
          setPinModal((p) => ({ ...p, open: false }));
          setSettingsUnlocked(true);
          setActiveTab('settings');
        }}
      />

      <VoidSaleModal
        sale={voidTargetSale}
        settings={settings}
        onClose={() => setVoidTargetSale(null)}
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
        onConfirm={handleConfirmAction}
      />

      <AssistantWidget
        open={assistantOpen}
        products={products}
        sales={sales}
        heldOrders={heldOrders}
        settings={settings}
        onClose={() => setAssistantOpen(false)}
      />

      <ToastContainer toasts={toasts} scannerOpen={scannerState.open} />
    </div>
  );
}
