import type { DeviceIdentityInfo, PosBackupPayload } from '../types/pos';

export const DEVICE_IDENTITY_STORAGE_KEY = 'eternalblue_device_identity:v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BackupOriginAnalysis {
  isCrossDevice: boolean;
  sourceDeviceId: string | null;
  sourceDeviceLabel: string | null;
}

function generateDeviceUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // fallback below
  }
  const rand = Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  const ts = Date.now().toString(16).padStart(12, '0');
  return `dev-${ts.slice(-8)}-${rand.slice(0, 4)}-4000-8000-${ts}${rand}`.slice(0, 36);
}

export function formatTerminalShortCode(deviceId: string): string {
  const clean = deviceId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = clean.slice(-6).padStart(6, '0');
  return `TERM-${suffix}`;
}

export function loadOrCreateDeviceIdentity(storage?: StorageLike | null): DeviceIdentityInfo {
  const store: StorageLike | null =
    storage !== undefined
      ? storage
      : typeof localStorage !== 'undefined'
      ? localStorage
      : null;

  if (store) {
    try {
      const raw = store.getItem(DEVICE_IDENTITY_STORAGE_KEY);
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw) as Partial<DeviceIdentityInfo>;
        if (typeof parsed.deviceId === 'string' && parsed.deviceId.trim().length >= 8) {
          const cleanId = parsed.deviceId.trim();
          return {
            deviceId: cleanId,
            shortCode:
              typeof parsed.shortCode === 'string' && parsed.shortCode.trim()
                ? parsed.shortCode.trim()
                : formatTerminalShortCode(cleanId),
            installedAt:
              typeof parsed.installedAt === 'string' && parsed.installedAt.trim()
                ? parsed.installedAt.trim()
                : new Date().toISOString(),
          };
        }
      }
    } catch {
      // regenerate cleanly if unreadable
    }
  }

  const deviceId = generateDeviceUuid();
  const created: DeviceIdentityInfo = {
    deviceId,
    shortCode: formatTerminalShortCode(deviceId),
    installedAt: new Date().toISOString(),
  };

  if (store) {
    try {
      store.setItem(DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(created));
    } catch {
      // storage restricted
    }
  }

  return created;
}

export function analyzeBackupDeviceOrigin(
  backup: Partial<PosBackupPayload> | null | undefined,
  currentDeviceId: string
): BackupOriginAnalysis {
  const srcId = typeof backup?.sourceDeviceId === 'string' ? backup.sourceDeviceId.trim() : '';
  const srcLabel = typeof backup?.sourceDeviceLabel === 'string' ? backup.sourceDeviceLabel.trim() : '';

  if (!srcId) {
    return {
      isCrossDevice: false,
      sourceDeviceId: null,
      sourceDeviceLabel: srcLabel || null,
    };
  }

  const normalizedCurrent = currentDeviceId.trim();
  const isCrossDevice = normalizedCurrent.length > 0 && srcId !== normalizedCurrent;

  return {
    isCrossDevice,
    sourceDeviceId: srcId,
    sourceDeviceLabel: srcLabel || formatTerminalShortCode(srcId),
  };
}
