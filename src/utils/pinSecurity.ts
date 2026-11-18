import type { StoreSettings } from '../types';
import { safeJsonParse, STORAGE_KEYS } from './posMath';

export const PIN_ALGO_LATEST = 'PBKDF2-SHA512' as const;
export const PIN_ITER_LATEST = 310000;
export const PIN_ITER_LEGACY = 150000;
export const PIN_ITER = PIN_ITER_LATEST;

export const PIN_SETTING_KEYS = [
  'adminPin',
  'adminPinHash',
  'adminPinSalt',
  'adminPinIter',
  'adminPinAlgo',
  'adminPinWeak',
  'passkeyCredId',
  'passkeyPubKeySpki',
  'passkeyLabel',
  'passkeyRegisteredAt',
] as const;

export type PinAlgo = 'PBKDF2-SHA256' | 'PBKDF2-SHA512';

const getCrypto = (): Crypto | undefined => globalThis.crypto;

export const bytesToB64 = (u8: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(u8).toString('base64');
  }
  let t = '';
  for (let i = 0; i < u8.length; i++) {
    t += String.fromCharCode(u8[i]);
  }
  return btoa(t);
};

export const b64ToBytes = (b: string): Uint8Array => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b, 'base64'));
  }
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
};

export function pinCryptoOk(): boolean {
  const c = getCrypto();
  return !!(c && c.subtle && typeof c.getRandomValues === 'function');
}

export async function derivePinHash(
  pin: string,
  saltB64: string,
  iter: number,
  algo: PinAlgo = PIN_ALGO_LATEST,
): Promise<string> {
  const c = getCrypto();
  if (!c?.subtle) {
    throw new Error('WebCrypto SubtleCrypto unavailable');
  }
  const key = await c.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(pin)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const saltBytes = b64ToBytes(saltB64);
  const hashName = algo === 'PBKDF2-SHA512' ? 'SHA-512' : 'SHA-256';
  const bitLen = algo === 'PBKDF2-SHA512' ? 512 : 256;
  const bits = await c.subtle.deriveBits(
    { name: 'PBKDF2', hash: hashName, salt: saltBytes.buffer as ArrayBuffer, iterations: iter },
    key,
    bitLen,
  );
  return bytesToB64(new Uint8Array(bits));
}

export function safeEqual(a: string, b: string): boolean {
  a = String(a);
  b = String(b);
  let d = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return d === 0;
}

export function isWeakPin(pin: string): boolean {
  if (!/^\d{4,8}$/.test(pin)) return true;
  if (/^(\d)\1+$/.test(pin)) return true;
  const asc = '01234567890123456789';
  const desc = '98765432109876543210';
  if (asc.includes(pin) || desc.includes(pin)) return true;
  if (/^(19|20)\d{2}$/.test(pin)) return true;
  return [
    '1212',
    '2580',
    '1004',
    '2000',
    '2001',
    '1122',
    '6969',
    '121212',
    '112233',
    '258025',
    '0852',
    '1379',
  ].includes(pin);
}

export function pinIsSet(settings: StoreSettings): boolean {
  return !!(settings.adminPinHash || settings.adminPin);
}

export function pinNeedsChange(settings: StoreSettings): boolean {
  return !!(
    settings.adminPinWeak ||
    (!settings.adminPinHash && settings.adminPin && isWeakPin(String(settings.adminPin)))
  );
}

export function getPinSecurityMeta(settings: StoreSettings): {
  hasPin: boolean;
  algo: 'NONE' | 'PLAINTEXT' | 'PBKDF2-SHA256' | 'PBKDF2-SHA512';
  iterations: number;
  isLatestAlgo: boolean;
  isWeak: boolean;
} {
  if (!pinIsSet(settings)) {
    return { hasPin: false, algo: 'NONE', iterations: 0, isLatestAlgo: false, isWeak: false };
  }
  if (!settings.adminPinHash && settings.adminPin) {
    return {
      hasPin: true,
      algo: 'PLAINTEXT',
      iterations: 0,
      isLatestAlgo: false,
      isWeak: pinNeedsChange(settings),
    };
  }
  const algo: PinAlgo = settings.adminPinAlgo === 'PBKDF2-SHA512' ? 'PBKDF2-SHA512' : 'PBKDF2-SHA256';
  const iterations = Number(settings.adminPinIter) || PIN_ITER_LEGACY;
  return {
    hasPin: true,
    algo,
    iterations,
    isLatestAlgo: algo === PIN_ALGO_LATEST && iterations >= PIN_ITER_LATEST,
    isWeak: pinNeedsChange(settings),
  };
}

interface PinLockState {
  fails: number;
  until: number;
}

export function pinLockRead(): PinLockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PINLOCK);
    if (!raw) return { fails: 0, until: 0 };
    const parsed = safeJsonParse<PinLockState | null>(raw);
    return parsed || { fails: 0, until: 0 };
  } catch {
    return { fails: 0, until: 0 };
  }
}

export function pinLockWrite(o: PinLockState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PINLOCK, JSON.stringify(o));
  } catch {
    // ignore storage failures cleanly
  }
}

export function pinLockedFor(): number {
  const l = pinLockRead();
  return Math.max(0, Math.ceil(((Number(l.until) || 0) - Date.now()) / 1000));
}

export function pinRegisterFail(): PinLockState {
  const l = pinLockRead();
  l.fails = (Number(l.fails) || 0) + 1;
  if (l.fails % 5 === 0) {
    l.until = Date.now() + Math.min(15 * 60, 30 * Math.pow(2, l.fails / 5 - 1)) * 1000;
  }
  pinLockWrite(l);
  return l;
}

export function pinRegisterOk(): void {
  pinLockWrite({ fails: 0, until: 0 });
}

export function fmtWait(sec: number): string {
  return sec >= 60 ? `${Math.ceil(sec / 60)} min` : `${sec} sec`;
}

export async function storePinInSettings(
  settings: StoreSettings,
  pin: string,
  weakFlag: boolean,
): Promise<StoreSettings> {
  const next: StoreSettings = { ...settings };
  const c = getCrypto();
  if (c?.subtle && typeof c.getRandomValues === 'function') {
    const salt = bytesToB64(c.getRandomValues(new Uint8Array(16)));
    next.adminPinHash = await derivePinHash(pin, salt, PIN_ITER_LATEST, PIN_ALGO_LATEST);
    next.adminPinSalt = salt;
    next.adminPinIter = PIN_ITER_LATEST;
    next.adminPinAlgo = PIN_ALGO_LATEST;
    delete next.adminPin;
  } else {
    next.adminPin = String(pin);
  }
  if (weakFlag) {
    next.adminPinWeak = true;
  } else {
    delete next.adminPinWeak;
  }
  return next;
}

export async function verifyPinWithSettings(
  entered: string,
  settings: StoreSettings,
): Promise<{
  ok: boolean;
  error?: string;
  upgradedSettings?: StoreSettings;
  upgradedAlgo?: boolean;
  lockedOutNow?: boolean;
  remainingTries?: number;
}> {
  const wait = pinLockedFor();
  if (wait > 0) {
    return {
      ok: false,
      error: `Too many wrong PINs. Try again in ${fmtWait(wait)}`,
      lockedOutNow: true,
    };
  }

  const clean = String(entered || '');
  let ok = false;
  let upgradedSettings: StoreSettings | undefined;
  let upgradedAlgo = false;

  if (settings.adminPinHash && pinCryptoOk()) {
    const algo: PinAlgo =
      settings.adminPinAlgo === 'PBKDF2-SHA512' ? 'PBKDF2-SHA512' : 'PBKDF2-SHA256';
    const iter = Number(settings.adminPinIter) || PIN_ITER_LEGACY;
    try {
      const h = await derivePinHash(clean, String(settings.adminPinSalt || ''), iter, algo);
      ok = safeEqual(h, String(settings.adminPinHash));
      if (ok && (algo !== PIN_ALGO_LATEST || iter < PIN_ITER_LATEST)) {
        upgradedSettings = await storePinInSettings(settings, clean, isWeakPin(clean));
        upgradedAlgo = true;
      }
    } catch {
      ok = false;
    }
  } else if (settings.adminPin) {
    ok = safeEqual(clean, String(settings.adminPin));
    if (ok && pinCryptoOk()) {
      upgradedSettings = await storePinInSettings(settings, clean, isWeakPin(clean));
      upgradedAlgo = true;
    }
  }

  if (ok) {
    pinRegisterOk();
    return { ok: true, upgradedSettings, upgradedAlgo };
  }

  const l = pinRegisterFail();
  const w2 = pinLockedFor();
  const remaining = 5 - (l.fails % 5 || 5);
  return {
    ok: false,
    lockedOutNow: w2 > 0,
    remainingTries: remaining,
    error:
      w2 > 0
        ? `Too many wrong PINs. Locked for ${fmtWait(w2)}`
        : `Incorrect Manager PIN (${remaining} tries left before lock)`,
  };
}
