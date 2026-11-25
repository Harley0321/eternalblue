import type { TabName } from '../types/pos';
import type { ReleaseInfo } from './githubUpdateChecker';

export interface AutoUpdateActivityState {
  autoUpdateEnabled: boolean;
  isOnline: boolean;
  isTabVisible: boolean;
  activeTab: TabName;
  cartLength: number;
  seniorPwdActive: boolean;
  posSearchActive: boolean;
  assistantOpen: boolean;
  pendingRestoreOpen: boolean;
  checkoutOpen: boolean;
  receiptOpen: boolean;
  productModalOpen: boolean;
  stockAdjustOpen: boolean;
  batchModalOpen: boolean;
  stockLogModalOpen: boolean;
  heldOrdersModalOpen: boolean;
  holdCartModalOpen: boolean;
  voidSaleOpen: boolean;
  scannerOpen: boolean;
  terminalLocked: boolean;
  pinModalOpen: boolean;
  hasFocusedInput?: boolean;
}

export const TRUSTED_GITHUB_REPO = 'harley0321/eternalblue';

export function isAnyModalOrBusyOverlayOpen(ctx: AutoUpdateActivityState): boolean {
  return Boolean(
    ctx.cartLength > 0 ||
      ctx.seniorPwdActive ||
      ctx.posSearchActive ||
      ctx.assistantOpen ||
      ctx.pendingRestoreOpen ||
      ctx.checkoutOpen ||
      ctx.receiptOpen ||
      ctx.productModalOpen ||
      ctx.stockAdjustOpen ||
      ctx.batchModalOpen ||
      ctx.stockLogModalOpen ||
      ctx.heldOrdersModalOpen ||
      ctx.holdCartModalOpen ||
      ctx.voidSaleOpen ||
      ctx.scannerOpen ||
      ctx.terminalLocked ||
      ctx.pinModalOpen ||
      ctx.hasFocusedInput
  );
}

export function canAutoApplyUpdateNow(ctx: AutoUpdateActivityState): boolean {
  if (!ctx.autoUpdateEnabled || !ctx.isOnline || !ctx.isTabVisible) return false;
  if (ctx.activeTab !== 'POS') return false;
  if (isAnyModalOrBusyOverlayOpen(ctx)) return false;
  return true;
}

export function canRunBackgroundUpdateCheck(opts: {
  activity: AutoUpdateActivityState;
  checking: boolean;
  lastCheckedAtMs: number;
  nextAllowedAtMs?: number;
  nowMs: number;
  minIntervalMs?: number;
}): boolean {
  const { activity } = opts;
  if (!activity.autoUpdateEnabled || !activity.isOnline || !activity.isTabVisible || opts.checking) {
    return false;
  }
  if (
    activity.cartLength > 0 ||
    activity.checkoutOpen ||
    activity.receiptOpen ||
    activity.productModalOpen ||
    activity.stockAdjustOpen ||
    activity.batchModalOpen ||
    activity.stockLogModalOpen ||
    activity.heldOrdersModalOpen ||
    activity.holdCartModalOpen ||
    activity.voidSaleOpen ||
    activity.scannerOpen ||
    activity.terminalLocked ||
    activity.pinModalOpen ||
    activity.pendingRestoreOpen ||
    activity.hasFocusedInput
  ) {
    return false;
  }
  if (opts.nextAllowedAtMs && opts.nowMs < opts.nextAllowedAtMs) {
    return false;
  }
  return shouldCheckUpdatesOnEvent({
    autoUpdateEnabled: activity.autoUpdateEnabled,
    isOnline: activity.isOnline,
    checking: opts.checking,
    lastCheckedAtMs: opts.lastCheckedAtMs,
    nowMs: opts.nowMs,
    minIntervalMs: opts.minIntervalMs,
  });
}

export function shouldCheckUpdatesOnEvent(opts: {
  autoUpdateEnabled: boolean;
  isOnline: boolean;
  checking: boolean;
  lastCheckedAtMs: number;
  nowMs: number;
  minIntervalMs?: number;
}): boolean {
  if (!opts.autoUpdateEnabled || !opts.isOnline || opts.checking) return false;
  const interval = opts.minIntervalMs ?? 120_000;
  if (opts.lastCheckedAtMs <= 0) return true;
  return opts.nowMs - opts.lastCheckedAtMs >= interval;
}

export function shouldAutoStartApkUpdate(opts: {
  isAndroidHost: boolean;
  activity: AutoUpdateActivityState;
  updateInfo: ReleaseInfo | null;
  attemptedTags: ReadonlySet<string>;
  downloading: boolean;
}): boolean {
  if (!opts.isAndroidHost || opts.downloading) return false;
  if (!canAutoApplyUpdateNow(opts.activity)) return false;
  const info = opts.updateInfo;
  if (!info || !info.isNewer) return false;
  if (info.repoSlug.trim().toLowerCase() !== TRUSTED_GITHUB_REPO) return false;
  if (!info.apkDownloadUrl?.trim() || !info.manifestUrl?.trim()) return false;
  const tag = info.tagName.trim();
  if (!tag) return false;
  return !opts.attemptedTags.has(tag);
}

export type PwaAutoApplyDecision = 'NONE' | 'AUTO_APPLY' | 'PROMPT_USER';

export function evaluatePwaAutoApply(opts: {
  hasPendingSwUpdate: boolean;
  autoUpdateEnabled: boolean;
  isOnline: boolean;
  isBusyInPos: boolean;
}): PwaAutoApplyDecision {
  if (!opts.hasPendingSwUpdate) return 'NONE';
  if (opts.autoUpdateEnabled && opts.isOnline && !opts.isBusyInPos) {
    return 'AUTO_APPLY';
  }
  return 'PROMPT_USER';
}

export function computeIdleGraceDelayMs(
  lastInteractionAtMs: number,
  nowMs: number,
  quietWindowMs = 4000,
  initialUnattendedMs = 500
): number {
  if (lastInteractionAtMs <= 0) return initialUnattendedMs;
  const elapsed = Math.max(0, nowMs - lastInteractionAtMs);
  return Math.max(600, quietWindowMs - elapsed);
}

export function isElementInteractiveInput(el: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
