import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEVICE_IDENTITY_STORAGE_KEY,
  analyzeBackupDeviceOrigin,
  formatTerminalShortCode,
  loadOrCreateDeviceIdentity,
  type StorageLike,
} from '../src/domain/deviceIdentity';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  clearPrefix(prefix: string): void {
    for (const k of Array.from(this.map.keys())) {
      if (k.startsWith(prefix)) this.map.delete(k);
    }
  }
}

test('loadOrCreateDeviceIdentity isolates identities across separate devices and persists per device', () => {
  const tabletA = new MemoryStorage();
  const tabletB = new MemoryStorage();

  const idA1 = loadOrCreateDeviceIdentity(tabletA);
  const idA2 = loadOrCreateDeviceIdentity(tabletA);
  const idB = loadOrCreateDeviceIdentity(tabletB);

  assert.equal(idA1.deviceId, idA2.deviceId);
  assert.equal(idA1.shortCode, idA2.shortCode);
  assert.notEqual(idA1.deviceId, idB.deviceId);
  assert.match(idA1.shortCode, /^TERM-[A-Z0-9]{6}$/);
  assert.match(idB.shortCode, /^TERM-[A-Z0-9]{6}$/);
  assert.ok(tabletA.getItem(DEVICE_IDENTITY_STORAGE_KEY));
});

test('clearing ebpos_v1 store prefix preserves device identity on that terminal', () => {
  const deviceStorage = new MemoryStorage();
  const initial = loadOrCreateDeviceIdentity(deviceStorage);
  deviceStorage.setItem('ebpos_v1:products', '[{"id":"p1"}]');
  deviceStorage.clearPrefix('ebpos_v1:');

  assert.equal(deviceStorage.getItem('ebpos_v1:products'), null);
  const afterReset = loadOrCreateDeviceIdentity(deviceStorage);
  assert.equal(afterReset.deviceId, initial.deviceId);
  assert.equal(afterReset.shortCode, initial.shortCode);
});

test('analyzeBackupDeviceOrigin detects cross-device backups and passes same-device or legacy backups', () => {
  const tabletA = new MemoryStorage();
  const tabletB = new MemoryStorage();
  const idA = loadOrCreateDeviceIdentity(tabletA);
  const idB = loadOrCreateDeviceIdentity(tabletB);

  const sameDevice = analyzeBackupDeviceOrigin(
    { sourceDeviceId: idA.deviceId, sourceDeviceLabel: idA.shortCode },
    idA.deviceId
  );
  assert.equal(sameDevice.isCrossDevice, false);
  assert.equal(sameDevice.sourceDeviceLabel, idA.shortCode);

  const crossDevice = analyzeBackupDeviceOrigin(
    { sourceDeviceId: idB.deviceId, sourceDeviceLabel: idB.shortCode },
    idA.deviceId
  );
  assert.equal(crossDevice.isCrossDevice, true);
  assert.equal(crossDevice.sourceDeviceId, idB.deviceId);
  assert.equal(crossDevice.sourceDeviceLabel, idB.shortCode);

  const legacy = analyzeBackupDeviceOrigin({}, idA.deviceId);
  assert.equal(legacy.isCrossDevice, false);
  assert.equal(legacy.sourceDeviceId, null);
});

test('formatTerminalShortCode formats deterministic 6-char terminal code', () => {
  assert.equal(formatTerminalShortCode('550e8400-e29b-41d4-a716-4466554400ab'), 'TERM-4400AB');
});
