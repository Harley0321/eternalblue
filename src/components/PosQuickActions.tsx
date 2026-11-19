import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpLeft,
  ArrowUpRight,
  Banknote,
  Camera,
  History,
  Pause,
  Percent,
  Printer,
  RotateCcw,
  ScanBarcode,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { PriceType, SaleRecord } from '../types';
import {
  formatPeso,
  resolveNearestQuickActionsDock,
  type QuickActionsDock,
} from '../utils/posMath';

interface PosQuickActionsProps {
  dock: QuickActionsDock;
  boundsRef: React.RefObject<HTMLDivElement | null>;
  priceMode: PriceType;
  isSeniorPwd: boolean;
  lastVoidableSale: SaleRecord | null;
  cartCount: number;
  heldCount: number;
  hidden?: boolean;
  onChangeDock: (nextDock: QuickActionsDock) => void;
  onQuickScan: () => void;
  onRapidScan: () => void;
  onTogglePriceMode: () => void;
  onToggleSeniorPwd: () => void;
  onReprintLastSale: () => void;
  onVoidLastSale: () => void;
  onHoldCart: () => void;
  onOpenHeldModal: () => void;
  onClearCart: () => void;
  onOpenCheckout: () => void;
}

const DOCK_OPTIONS: Array<{
  id: QuickActionsDock;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'top-left', label: 'Top Left', Icon: ArrowUpLeft },
  { id: 'top-right', label: 'Top Right', Icon: ArrowUpRight },
  { id: 'bottom-left', label: 'Bottom Left', Icon: ArrowDownLeft },
  { id: 'bottom-right', label: 'Bottom Right', Icon: ArrowDownRight },
];

function dockContainerClass(dock: QuickActionsDock): string {
  switch (dock) {
    case 'top-left':
      return 'left-2 top-2 items-start';
    case 'top-right':
      return 'right-2 top-2 items-end';
    case 'bottom-right':
      return 'right-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-3 items-end';
    case 'bottom-left':
    default:
      return 'left-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-3 items-start';
  }
}

export const PosQuickActions: React.FC<PosQuickActionsProps> = ({
  dock,
  boundsRef,
  priceMode,
  isSeniorPwd,
  lastVoidableSale,
  cartCount,
  heldCount,
  hidden = false,
  onChangeDock,
  onQuickScan,
  onRapidScan,
  onTogglePriceMode,
  onToggleSeniorPwd,
  onReprintLastSale,
  onVoidLastSale,
  onHoldCart,
  onOpenHeldModal,
  onClearCart,
  onOpenCheckout,
}) => {
  const [open, setOpen] = useState(false);
  const [dragState, setDragState] = useState<{
    dx: number;
    dy: number;
    previewDock: QuickActionsDock;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (hidden && open) {
      setOpen(false);
    }
  }, [hidden, open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDownOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDownOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (hidden) return null;

  const isTop = dock.startsWith('top-');
  const isRight = dock.endsWith('-right');
  const nextModeLabel = priceMode === 'retail' ? 'Switch to Wholesale' : 'Switch to Retail';
  const currentModeLabel = priceMode === 'retail' ? 'Retail' : 'Wholesale';

  const getBoundsRect = () =>
    boundsRef.current?.getBoundingClientRect() || {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    dragCleanupRef.current?.();

    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!active) {
        if (Math.hypot(dx, dy) < 6) return;
        active = true;
        setOpen(false);
        try {
          triggerRef.current?.setPointerCapture(pointerId);
        } catch {
          // ignore capture issues in synthetic tests
        }
      }

      const previewDock = resolveNearestQuickActionsDock(
        ev.clientX,
        ev.clientY,
        getBoundsRect(),
      );
      setDragState({ dx, dy, previewDock });
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      dragCleanupRef.current = null;
    };

    const finish = (ev: PointerEvent, commit: boolean) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      try {
        if (triggerRef.current?.hasPointerCapture(pointerId)) {
          triggerRef.current.releasePointerCapture(pointerId);
        }
      } catch {
        // ignore capture issues
      }

      if (active) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 60);

        if (commit) {
          const nextDock = resolveNearestQuickActionsDock(
            ev.clientX,
            ev.clientY,
            getBoundsRect(),
          );
          onChangeDock(nextDock);
        }
      }
      setDragState(null);
    };

    const onUp = (ev: PointerEvent) => finish(ev, true);
    const onCancel = (ev: PointerEvent) => finish(ev, false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    dragCleanupRef.current = cleanup;
  };

  const menuEl = open && (
    <div
      id="pos-quick-actions-menu"
      role="menu"
      aria-label="POS Quick Actions"
      data-testid="pos-quick-actions-menu"
      className={`${isTop ? 'mt-1.5' : 'mb-1.5'} w-60 max-w-[calc(100vw-1.5rem)] bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden ${
        isTop
          ? isRight
            ? 'origin-top-right'
            : 'origin-top-left'
          : isRight
            ? 'origin-bottom-right'
            : 'origin-bottom-left'
      }`}
    >
      <div className="px-2.5 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
        <span className="text-[11px] font-extrabold text-slate-900">Quick Actions</span>
        <span className="text-[10px] font-mono-num font-semibold text-slate-500">
          {cartCount > 0 ? `${cartCount} in cart` : 'Fast POS'}
        </span>
      </div>

      {/* Primary Quick Scan + Rapid Multi-Scan */}
      <div className="divide-y divide-slate-100">
        <button
          type="button"
          role="menuitem"
          data-testid="qa-quick-scan"
          onClick={() => {
            setOpen(false);
            onQuickScan();
          }}
          className="w-full px-2.5 py-1.5 min-h-[34px] text-left flex items-center gap-2 hover:bg-emerald-50/70 active:bg-emerald-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-emerald-50"
        >
          <span className="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <Camera className="w-3.5 h-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold text-slate-900 whitespace-nowrap truncate leading-tight">
              Quick Scan
            </span>
            <span className="block text-[10px] text-slate-500 truncate leading-tight">
              Single camera scan · F8
            </span>
          </span>
        </button>

        {/* Compact 2x2 Utility Functions */}
        <div className="grid grid-cols-2 divide-x divide-slate-100 bg-slate-50/40">
          <button
            type="button"
            role="menuitem"
            data-testid="qa-rapid-scan"
            onClick={() => {
              setOpen(false);
              onRapidScan();
            }}
            className="px-2.5 py-1.5 min-h-[36px] text-left flex items-center gap-1.5 hover:bg-emerald-50/80 active:bg-emerald-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-emerald-50 border-b border-slate-100"
          >
            <ScanBarcode className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span className="min-w-0">
              <span className="block text-[11px] font-bold text-slate-900 whitespace-nowrap leading-tight">
                Rapid Scan
              </span>
              <span className="block text-[9px] text-emerald-700 font-semibold whitespace-nowrap leading-tight">
                Multi-item ON
              </span>
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            aria-pressed={isSeniorPwd}
            data-testid="qa-sc-pwd"
            onClick={() => {
              setOpen(false);
              onToggleSeniorPwd();
            }}
            className={`px-2.5 py-1.5 min-h-[36px] text-left flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none border-b border-slate-100 ${
              isSeniorPwd
                ? 'bg-amber-50 hover:bg-amber-100/80'
                : 'hover:bg-amber-50/60 active:bg-amber-50'
            }`}
          >
            <Percent
              className={`w-3.5 h-3.5 shrink-0 ${isSeniorPwd ? 'text-amber-700' : 'text-slate-600'}`}
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-bold text-slate-900 whitespace-nowrap leading-tight">
                SC / PWD 5%
              </span>
              <span
                className={`block text-[9px] font-bold whitespace-nowrap leading-tight ${
                  isSeniorPwd ? 'text-amber-700' : 'text-slate-500'
                }`}
              >
                {isSeniorPwd ? 'Active · ON' : 'Tap to apply'}
              </span>
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-testid="qa-reprint-last"
            disabled={!lastVoidableSale}
            onClick={() => {
              if (!lastVoidableSale) return;
              setOpen(false);
              onReprintLastSale();
            }}
            className="px-2.5 py-1.5 min-h-[36px] text-left flex items-center gap-1.5 hover:bg-slate-100/80 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-slate-100"
          >
            <Printer className="w-3.5 h-3.5 text-slate-700 shrink-0" />
            <span className="min-w-0">
              <span className="block text-[11px] font-bold text-slate-900 whitespace-nowrap leading-tight">
                Last Receipt
              </span>
              <span className="block text-[9px] font-mono-num text-slate-500 truncate leading-tight">
                {lastVoidableSale ? lastVoidableSale.receiptNo : 'None yet'}
              </span>
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-testid="qa-clear-cart"
            disabled={cartCount === 0}
            onClick={() => {
              if (cartCount === 0) return;
              setOpen(false);
              onClearCart();
            }}
            className="px-2.5 py-1.5 min-h-[36px] text-left flex items-center gap-1.5 hover:bg-rose-50/70 active:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-rose-50"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span className="min-w-0">
              <span className="block text-[11px] font-bold text-slate-900 whitespace-nowrap leading-tight">
                Clear Cart
              </span>
              <span className="block text-[9px] font-mono-num text-slate-500 whitespace-nowrap leading-tight">
                {cartCount > 0 ? `${cartCount} line(s)` : 'Empty'}
              </span>
            </span>
          </button>
        </div>

        <button
          type="button"
          role="menuitem"
          data-testid="qa-price-mode"
          onClick={() => {
            setOpen(false);
            onTogglePriceMode();
          }}
          className="w-full px-2.5 py-1.5 min-h-[34px] text-left flex items-center gap-2 hover:bg-indigo-50/70 active:bg-indigo-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-indigo-50"
        >
          <span className="w-6 h-6 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold text-slate-900 whitespace-nowrap truncate leading-tight">
              {nextModeLabel}
            </span>
            <span className="block text-[10px] text-slate-500 truncate leading-tight">
              {currentModeLabel} active · F9
            </span>
          </span>
        </button>

        {/* Hold + Recall 2-column compact row */}
        <div className="grid grid-cols-2 divide-x divide-slate-100">
          <button
            type="button"
            role="menuitem"
            data-testid="qa-hold-order"
            disabled={cartCount === 0}
            onClick={() => {
              if (cartCount === 0) return;
              setOpen(false);
              onHoldCart();
            }}
            className="px-2.5 py-1.5 min-h-[34px] text-left flex items-center gap-1.5 hover:bg-amber-50/70 active:bg-amber-50 disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-amber-50"
          >
            <Pause className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span className="min-w-0">
              <span className="block text-[11px] font-bold text-slate-900 whitespace-nowrap leading-tight">
                Hold
              </span>
              <span className="block text-[9px] font-mono-num text-slate-500 whitespace-nowrap leading-tight">
                {cartCount > 0 ? 'Park · F4' : 'Empty'}
              </span>
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-testid="qa-recall-held"
            onClick={() => {
              setOpen(false);
              onOpenHeldModal();
            }}
            className="px-2.5 py-1.5 min-h-[34px] text-left flex items-center gap-1.5 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-slate-50"
          >
            <History className="w-3.5 h-3.5 text-slate-700 shrink-0" />
            <span className="min-w-0">
              <span className="block text-[11px] font-bold text-slate-900 whitespace-nowrap leading-tight">
                Recall
              </span>
              <span className="block text-[9px] font-mono-num text-slate-500 whitespace-nowrap leading-tight">
                {heldCount > 0 ? `${heldCount} waiting` : 'None parked'}
              </span>
            </span>
          </button>
        </div>

        <button
          type="button"
          role="menuitem"
          data-testid="qa-void-last-sale"
          disabled={!lastVoidableSale}
          onClick={() => {
            if (!lastVoidableSale) return;
            setOpen(false);
            onVoidLastSale();
          }}
          className="w-full px-2.5 py-1.5 min-h-[34px] text-left flex items-center gap-2 hover:bg-rose-50/70 active:bg-rose-50 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-rose-50"
        >
          <span className="w-6 h-6 rounded-md bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
            <RotateCcw className="w-3.5 h-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold text-slate-900 whitespace-nowrap truncate leading-tight">
              Void Last Sale
            </span>
            <span className="block text-[10px] font-mono-num text-slate-500 truncate leading-tight">
              {lastVoidableSale
                ? `${lastVoidableSale.receiptNo} · ${formatPeso(lastVoidableSale.grandTotal)}`
                : 'No recent sale'}
            </span>
          </span>
        </button>

        {cartCount > 0 && (
          <button
            type="button"
            role="menuitem"
            data-testid="qa-checkout"
            onClick={() => {
              setOpen(false);
              onOpenCheckout();
            }}
            className="w-full px-2.5 py-1.5 min-h-[36px] text-left flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
          >
            <Banknote className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] font-extrabold whitespace-nowrap flex-1">
              Checkout &amp; Pay
            </span>
            <span className="text-[10px] font-mono-num font-bold opacity-90">F2</span>
          </button>
        )}
      </div>

      {/* Corner Position Switcher */}
      <div className="px-2.5 py-1.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-slate-600 whitespace-nowrap">
          Move
        </span>
        <div
          className="inline-flex items-center gap-0.5 bg-white border border-slate-200 rounded-md p-0.5"
          role="group"
          aria-label="Move Quick Actions corner"
        >
          {DOCK_OPTIONS.map(({ id, label, Icon }) => {
            const active = dock === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChangeDock(id)}
                aria-label={`Move Quick Actions to ${label}`}
                aria-pressed={active}
                data-testid={`qa-dock-${id}`}
                title={`Dock ${label}`}
                className={`w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-emerald-400'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3 h-3" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const triggerEl = (
    <button
      ref={triggerRef}
      type="button"
      onPointerDown={handlePointerDown}
      onClick={() => {
        if (suppressClickRef.current) return;
        setOpen((v) => !v);
      }}
      aria-expanded={open}
      aria-haspopup="menu"
      aria-controls={open ? 'pos-quick-actions-menu' : undefined}
      aria-label="Quick Actions"
      data-testid="pos-quick-actions-btn"
      data-dock={dock}
      title="Quick Actions (tap to open, drag to move corner)"
      style={
        dragState
          ? { transform: `translate3d(${dragState.dx}px, ${dragState.dy}px, 0)` }
          : undefined
      }
      className={`touch-none w-8 h-8 rounded-lg border shadow-md flex items-center justify-center shrink-0 select-none ${
        dragState ? 'cursor-grabbing scale-[1.05]' : 'cursor-pointer transition active:scale-[0.96]'
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
        open
          ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
          : 'bg-slate-900 hover:bg-slate-800 border-slate-700/80 text-white'
      }`}
    >
      {open ? (
        <X className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      )}
    </button>
  );

  return (
    <>
      {dragState && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20"
        >
          {DOCK_OPTIONS.map(({ id }) => (
            <div
              key={id}
              className={`absolute w-8 h-8 rounded-lg border-2 border-dashed transition-colors ${
                dockContainerClass(id)
              } ${
                dragState.previewDock === id
                  ? 'border-emerald-500 bg-emerald-500/15'
                  : 'border-slate-300/70 bg-white/40'
              }`}
            />
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        data-testid="pos-quick-actions"
        data-dock={dock}
        className={`absolute ${dockContainerClass(dock)} z-[25] flex flex-col`}
      >
        {isTop ? (
          <>
            {triggerEl}
            {menuEl}
          </>
        ) : (
          <>
            {menuEl}
            {triggerEl}
          </>
        )}
      </div>
    </>
  );
};
