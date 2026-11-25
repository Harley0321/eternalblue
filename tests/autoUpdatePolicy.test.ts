import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AutoUpdateActivityState,
  canAutoApplyUpdateNow,
  canRunBackgroundUpdateCheck,
  computeIdleGraceDelayMs,
  evaluatePwaAutoApply,
  isElementInteractiveInput,
  shouldAutoStartApkUpdate,
  shouldCheckUpdatesOnEvent,
} from '../src/domain/autoUpdatePolicy.ts';
import { GitHubUpdateChecker, ReleaseInfo } from '../src/domain/githubUpdateChecker.ts';

function makeIdleActivity(overrides: Partial<AutoUpdateActivityState> = {}): AutoUpdateActivityState {
  return {
    autoUpdateEnabled: true,
    isOnline: true,
    isTabVisible: true,
    activeTab: 'POS',
    cartLength: 0,
    seniorPwdActive: false,
    posSearchActive: false,
    assistantOpen: false,
    pendingRestoreOpen: false,
    checkoutOpen: false,
    receiptOpen: false,
    productModalOpen: false,
    stockAdjustOpen: false,
    batchModalOpen: false,
    stockLogModalOpen: false,
    heldOrdersModalOpen: false,
    holdCartModalOpen: false,
    voidSaleOpen: false,
    scannerOpen: false,
    terminalLocked: false,
    pinModalOpen: false,
    hasFocusedInput: false,
    ...overrides,
  };
}

function makeReleaseInfo(overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    repoSlug: 'Harley0321/eternalblue',
    status: 'UPDATE_AVAILABLE',
    tagName: 'v2.4.0',
    versionCode: 3,
    htmlUrl: 'https://github.com/Harley0321/eternalblue/releases/latest',
    apkDownloadUrl: 'https://github.com/Harley0321/eternalblue/releases/download/v2.4.0/app-release.apk',
    apkFileName: 'app-release.apk',
    manifestUrl: 'https://github.com/Harley0321/eternalblue/releases/latest/download/update-manifest.json',
    message: 'Update v2.4.0 is available.',
    isNewer: true,
    ...overrides,
  };
}

test('canAutoApplyUpdateNow allows only idle visible POS register screen', () => {
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity()), true);
});

test('canAutoApplyUpdateNow blocks during any active use, non-POS tabs, typing, search, or modals', () => {
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ autoUpdateEnabled: false })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ isOnline: false })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ isTabVisible: false })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ activeTab: 'INVENTORY' })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ activeTab: 'OPERATIONS' })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ activeTab: 'SETTINGS' })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ cartLength: 1 })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ seniorPwdActive: true })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ posSearchActive: true })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ assistantOpen: true })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ pendingRestoreOpen: true })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ hasFocusedInput: true })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ checkoutOpen: true })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ receiptOpen: true })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ productModalOpen: true })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ scannerOpen: true })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ terminalLocked: true })), false);
  assert.equal(canAutoApplyUpdateNow(makeIdleActivity({ pinModalOpen: true })), false);
});

test('canRunBackgroundUpdateCheck skips while ringing items, scanning, typing, hidden, or in backoff', () => {
  assert.equal(
    canRunBackgroundUpdateCheck({
      activity: makeIdleActivity(),
      checking: false,
      lastCheckedAtMs: 0,
      nowMs: 100_000,
    }),
    true
  );

  assert.equal(
    canRunBackgroundUpdateCheck({
      activity: makeIdleActivity({ cartLength: 2 }),
      checking: false,
      lastCheckedAtMs: 0,
      nowMs: 100_000,
    }),
    false
  );

  assert.equal(
    canRunBackgroundUpdateCheck({
      activity: makeIdleActivity({ scannerOpen: true }),
      checking: false,
      lastCheckedAtMs: 0,
      nowMs: 100_000,
    }),
    false
  );

  assert.equal(
    canRunBackgroundUpdateCheck({
      activity: makeIdleActivity({ hasFocusedInput: true }),
      checking: false,
      lastCheckedAtMs: 0,
      nowMs: 100_000,
    }),
    false
  );

  assert.equal(
    canRunBackgroundUpdateCheck({
      activity: makeIdleActivity({ isTabVisible: false }),
      checking: false,
      lastCheckedAtMs: 0,
      nowMs: 100_000,
    }),
    false
  );

  assert.equal(
    canRunBackgroundUpdateCheck({
      activity: makeIdleActivity(),
      checking: false,
      lastCheckedAtMs: 100_000,
      nextAllowedAtMs: 500_000,
      nowMs: 300_000,
      minIntervalMs: 10_000,
    }),
    false
  );
});

test('shouldCheckUpdatesOnEvent respects cooldown, checking lock, online, and setting', () => {
  assert.equal(
    shouldCheckUpdatesOnEvent({
      autoUpdateEnabled: true,
      isOnline: true,
      checking: false,
      lastCheckedAtMs: 0,
      nowMs: 1000,
    }),
    true
  );

  assert.equal(
    shouldCheckUpdatesOnEvent({
      autoUpdateEnabled: true,
      isOnline: true,
      checking: false,
      lastCheckedAtMs: 10_000,
      nowMs: 60_000,
      minIntervalMs: 120_000,
    }),
    false
  );

  assert.equal(
    shouldCheckUpdatesOnEvent({
      autoUpdateEnabled: true,
      isOnline: true,
      checking: false,
      lastCheckedAtMs: 10_000,
      nowMs: 140_000,
      minIntervalMs: 120_000,
    }),
    true
  );
});

test('shouldAutoStartApkUpdate requires trusted repo, apkUrl, manifestUrl, idle POS, and one-shot per tag', () => {
  const attempted = new Set<string>();
  const info = makeReleaseInfo({ tagName: 'v2.4.0' });

  assert.equal(
    shouldAutoStartApkUpdate({
      isAndroidHost: true,
      activity: makeIdleActivity(),
      updateInfo: info,
      attemptedTags: attempted,
      downloading: false,
    }),
    true
  );

  // Missing manifestUrl must NOT start broken download or burn tag
  assert.equal(
    shouldAutoStartApkUpdate({
      isAndroidHost: true,
      activity: makeIdleActivity(),
      updateInfo: makeReleaseInfo({ manifestUrl: null }),
      attemptedTags: new Set(),
      downloading: false,
    }),
    false
  );

  // Untrusted fork repo must NOT auto-start native installer
  assert.equal(
    shouldAutoStartApkUpdate({
      isAndroidHost: true,
      activity: makeIdleActivity(),
      updateInfo: makeReleaseInfo({ repoSlug: 'other/fork' }),
      attemptedTags: new Set(),
      downloading: false,
    }),
    false
  );

  attempted.add('v2.4.0');
  assert.equal(
    shouldAutoStartApkUpdate({
      isAndroidHost: true,
      activity: makeIdleActivity(),
      updateInfo: info,
      attemptedTags: attempted,
      downloading: false,
    }),
    false
  );
});

test('evaluatePwaAutoApply auto-applies only when pending, enabled, online, and idle', () => {
  assert.equal(
    evaluatePwaAutoApply({
      hasPendingSwUpdate: false,
      autoUpdateEnabled: true,
      isOnline: true,
      isBusyInPos: false,
    }),
    'NONE'
  );

  assert.equal(
    evaluatePwaAutoApply({
      hasPendingSwUpdate: true,
      autoUpdateEnabled: true,
      isOnline: true,
      isBusyInPos: false,
    }),
    'AUTO_APPLY'
  );

  assert.equal(
    evaluatePwaAutoApply({
      hasPendingSwUpdate: true,
      autoUpdateEnabled: true,
      isOnline: true,
      isBusyInPos: true,
    }),
    'PROMPT_USER'
  );
});

test('computeIdleGraceDelayMs and isElementInteractiveInput enforce quiet idle window without interrupting input', () => {
  assert.equal(computeIdleGraceDelayMs(0, 10_000, 4000, 500), 500);
  assert.equal(computeIdleGraceDelayMs(9_000, 10_000, 4000, 500), 3000);
  assert.equal(computeIdleGraceDelayMs(5_000, 10_000, 4000, 500), 600);

  assert.equal(isElementInteractiveInput({ tagName: 'INPUT' }), true);
  assert.equal(isElementInteractiveInput({ tagName: 'textarea' }), true);
  assert.equal(isElementInteractiveInput({ tagName: 'SELECT' }), true);
  assert.equal(isElementInteractiveInput({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isElementInteractiveInput({ tagName: 'BODY' }), false);
  assert.equal(isElementInteractiveInput(null), false);
});

test('GitHubUpdateChecker compares semantic versions and normalizes repo slugs', () => {
  assert.equal(GitHubUpdateChecker.normalizeRepoSlug('https://github.com/Harley0321/eternalblue.git'), 'Harley0321/eternalblue');
  assert.equal(GitHubUpdateChecker.isVersionNewer('v2.4.0', '2.3.17'), true);
  assert.equal(GitHubUpdateChecker.isVersionNewer('v2.10.0', 'v2.9.0'), true);
  assert.equal(GitHubUpdateChecker.isVersionNewer('v2.3.17', '2.3.17'), false);
  assert.equal(GitHubUpdateChecker.isVersionNewer('v2.3.16', '2.3.17'), false);
});
