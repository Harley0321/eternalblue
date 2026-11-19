import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldAutoApplyAppUpdate,
  shouldCheckForSwUpdate,
  stripLegacySyncFields,
  SW_UPDATE_MIN_GAP_MS,
} from './pwaUpdateRules';
import { STORAGE_KEYS, validateBackupPayload } from './posMath';
import { PRESERVED_DATA_KEYS } from '../version';

test('PWA auto-update throttle avoids duplicate checks within cooldown window', () => {
  assert.equal(shouldCheckForSwUpdate(0, 100_000), true);
  assert.equal(shouldCheckForSwUpdate(100_000, 105_000), false);
  assert.equal(shouldCheckForSwUpdate(100_000, 100_000 + SW_UPDATE_MIN_GAP_MS - 1), false);
  assert.equal(shouldCheckForSwUpdate(100_000, 100_000 + SW_UPDATE_MIN_GAP_MS), true);
});

test('Auto-apply reload gate waits cleanly when cashier has active cart or open modal', () => {
  assert.equal(
    shouldAutoApplyAppUpdate({ updateReady: false, cartCount: 0, hasBlockingUi: false }),
    false,
  );
  assert.equal(
    shouldAutoApplyAppUpdate({ updateReady: true, cartCount: 2, hasBlockingUi: false }),
    false,
  );
  assert.equal(
    shouldAutoApplyAppUpdate({ updateReady: true, cartCount: 0, hasBlockingUi: true }),
    false,
  );
  assert.equal(
    shouldAutoApplyAppUpdate({ updateReady: true, cartCount: 0, hasBlockingUi: false }),
    true,
  );
});

test('Legacy sync fields are stripped from settings and imported backups while preserving store data keys', () => {
  const dirtySettings = {
    storeName: 'Mobile Counter 2',
    lowStockThreshold: 12,
    syncEnabled: true,
    syncStoreId: 'SHARED-STORE-99',
    syncStoreIdCustomized: true,
    lastSyncedAt: '2026-10-01T00:00:00Z',
  };

  const { sanitized, strippedCount } = stripLegacySyncFields(dirtySettings);
  assert.equal(strippedCount, 4);
  assert.equal(sanitized.storeName, 'Mobile Counter 2');
  assert.equal(sanitized.lowStockThreshold, 12);
  assert.equal('syncEnabled' in sanitized, false);
  assert.equal('syncStoreId' in sanitized, false);
  assert.equal('syncStoreIdCustomized' in sanitized, false);
  assert.equal('lastSyncedAt' in sanitized, false);

  const backupCheck = validateBackupPayload({
    app: 'omnimart-ph-pos',
    products: [{ id: 'P1', name: 'Test Product', retailPrice: 20, stock: 5 }],
    sales: [],
    heldOrders: [],
    settings: dirtySettings,
  });
  assert.equal(backupCheck.ok, true);
  if (backupCheck.ok) {
    assert.equal(backupCheck.data.settings?.storeName, 'Mobile Counter 2');
    assert.equal('syncEnabled' in (backupCheck.data.settings || {}), false);
    assert.equal('syncStoreId' in (backupCheck.data.settings || {}), false);
  }

  // Ensure original localStorage keys remain intact across app updates
  for (const key of PRESERVED_DATA_KEYS) {
    assert.equal(Object.values(STORAGE_KEYS).includes(key), true);
  }
});
