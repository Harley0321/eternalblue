import type { CashierAccount, StoreSettings } from '../types';
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

/**
 * Returns an exact-length ArrayBuffer for any Uint8Array (even subarrays/Node Buffers
 * where byteOffset !== 0 or byteLength < buffer.byteLength).
 */
export function toExactArrayBuffer(u8: Uint8Array): ArrayBuffer {
  if (
    u8.byteOffset === 0 &&
    u8.byteLength === u8.buffer.byteLength &&
    u8.buffer instanceof ArrayBuffer
  ) {
    return u8.buffer;
  }
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

export const bytesToB64 = (u8: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  }
  let t = '';
  for (let i = 0; i < u8.length; i++) {
    t += String.fromCharCode(u8[i]);
  }
  return btoa(t);
};

export const b64ToBytes = (b: string): Uint8Array => {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).slice();
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
    { name: 'PBKDF2', hash: hashName, salt: toExactArrayBuffer(saltBytes), iterations: iter },
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

export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 15;

export function isValidPinOrPassword(pin: string): boolean {
  return /^\S{4,15}$/.test(String(pin || ''));
}

export function isWeakPin(pin: string): boolean {
  const clean = String(pin || '');
  if (!isValidPinOrPassword(clean)) return true;
  if (/^(.)\1+$/.test(clean)) return true;
  if (/^\d+$/.test(clean)) {
    const asc = '01234567890123456789';
    const desc = '98765432109876543210';
    if (asc.includes(clean) || desc.includes(clean)) return true;
    if (/^(19|20)\d{2}$/.test(clean)) return true;
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
    ].includes(clean);
  }
  const lower = clean.toLowerCase();
  if (/^(password|passw0rd|qwerty|admin|omnimart|letmein|welcome|iloveyou)\d*$/.test(lower)) {
    return true;
  }
  return clean.length < 6 && /^[a-z]+$/i.test(clean);
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

let memLockState: PinLockState = { fails: 0, until: 0 };
let memLockStorageRef: unknown = null;

function syncLockStorageRef(): void {
  const ls = typeof localStorage !== 'undefined' ? localStorage : null;
  if (ls !== memLockStorageRef) {
    memLockStorageRef = ls;
    memLockState = { fails: 0, until: 0 };
  }
}

export function pinLockRead(): PinLockState {
  syncLockStorageRef();
  let stored: PinLockState = { fails: 0, until: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PINLOCK);
    if (raw) {
      const parsed = safeJsonParse<Partial<PinLockState> | null>(raw);
      if (parsed && typeof parsed === 'object') {
        stored = {
          fails: Number.isFinite(Number(parsed.fails)) ? Math.max(0, Math.floor(Number(parsed.fails))) : 0,
          until: Number.isFinite(Number(parsed.until)) ? Math.max(0, Number(parsed.until)) : 0,
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  // Take stricter state between in-memory mirror and localStorage so clearing the key mid-session cannot reset lockouts
  const merged: PinLockState = {
    fails: Math.max(stored.fails, memLockState.fails),
    until: Math.max(stored.until, memLockState.until),
  };
  memLockState = { ...merged };
  return merged;
}

export function pinLockWrite(o: PinLockState, resetMemory = false): void {
  syncLockStorageRef();
  const clean: PinLockState = {
    fails: Number.isFinite(Number(o.fails)) ? Math.max(0, Math.floor(Number(o.fails))) : 0,
    until: Number.isFinite(Number(o.until)) ? Math.max(0, Number(o.until)) : 0,
  };
  memLockState = resetMemory
    ? { ...clean }
    : {
        fails: Math.max(clean.fails, memLockState.fails),
        until: Math.max(clean.until, memLockState.until),
      };
  try {
    localStorage.setItem(STORAGE_KEYS.PINLOCK, JSON.stringify(memLockState));
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
  pinLockWrite({ fails: 0, until: 0 }, true);
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

// ============================================================================
// Cashier Profile PIN Hashing (PBKDF2-SHA512) & Brute-Force Lockout
// ============================================================================

const CASHIER_LOCK_KEY = 'omnimart_cashier_lock_v1';
let memCashierLocks: Record<string, PinLockState> = {};
let memCashierStorageRef: unknown = null;

function readCashierLockMap(): Record<string, PinLockState> {
  const ls = typeof localStorage !== 'undefined' ? localStorage : null;
  if (ls !== memCashierStorageRef) {
    memCashierStorageRef = ls;
    memCashierLocks = {};
  }
  let stored: Record<string, PinLockState> = {};
  try {
    const raw = localStorage.getItem(CASHIER_LOCK_KEY);
    if (raw) {
      const parsed = safeJsonParse<Record<string, Partial<PinLockState>> | null>(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (v && typeof v === 'object') {
            stored[k] = {
              fails: Number.isFinite(Number(v.fails)) ? Math.max(0, Math.floor(Number(v.fails))) : 0,
              until: Number.isFinite(Number(v.until)) ? Math.max(0, Number(v.until)) : 0,
            };
          }
        }
      }
    }
  } catch {
    // ignore
  }
  const merged: Record<string, PinLockState> = { ...stored };
  for (const [k, mv] of Object.entries(memCashierLocks)) {
    const sv = merged[k] || { fails: 0, until: 0 };
    merged[k] = {
      fails: Math.max(sv.fails, mv.fails),
      until: Math.max(sv.until, mv.until),
    };
  }
  memCashierLocks = merged;
  return merged;
}

function writeCashierLock(cashierId: string, state: PinLockState, reset = false): void {
  const map = readCashierLockMap();
  const prev = map[cashierId] || { fails: 0, until: 0 };
  map[cashierId] = reset
    ? { ...state }
    : {
        fails: Math.max(prev.fails, state.fails),
        until: Math.max(prev.until, state.until),
      };
  memCashierLocks = map;
  try {
    localStorage.setItem(CASHIER_LOCK_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function cashierHasPin(cashier: Pick<CashierAccount, 'pin' | 'pinHash'> | null | undefined): boolean {
  return !!(cashier && (cashier.pinHash || cashier.pin));
}

export async function setCashierPinFields(
  cashier: CashierAccount,
  rawPin?: string,
): Promise<CashierAccount> {
  const next: CashierAccount = { ...cashier };
  const clean = String(rawPin || '').trim();
  if (!clean) {
    delete next.pin;
    delete next.pinHash;
    delete next.pinSalt;
    delete next.pinIter;
    delete next.pinAlgo;
    return next;
  }
  const c = getCrypto();
  if (c?.subtle && typeof c.getRandomValues === 'function') {
    const salt = bytesToB64(c.getRandomValues(new Uint8Array(16)));
    next.pinHash = await derivePinHash(clean, salt, PIN_ITER_LATEST, PIN_ALGO_LATEST);
    next.pinSalt = salt;
    next.pinIter = PIN_ITER_LATEST;
    next.pinAlgo = PIN_ALGO_LATEST;
    delete next.pin;
  } else {
    next.pin = clean;
  }
  return next;
}

export async function verifyCashierPin(
  entered: string,
  cashier: CashierAccount,
): Promise<{
  ok: boolean;
  error?: string;
  upgradedCashier?: CashierAccount;
  lockedOutNow?: boolean;
}> {
  if (!cashierHasPin(cashier)) {
    return { ok: true };
  }
  const lockMap = readCashierLockMap();
  const curLock = lockMap[cashier.id] || { fails: 0, until: 0 };
  const wait = Math.max(0, Math.ceil((curLock.until - Date.now()) / 1000));
  if (wait > 0) {
    return {
      ok: false,
      lockedOutNow: true,
      error: `Too many wrong cashier PINs for ${cashier.name}. Try again in ${fmtWait(wait)}`,
    };
  }

  const clean = String(entered || '').trim();
  let ok = false;
  let upgradedCashier: CashierAccount | undefined;

  if (cashier.pinHash && pinCryptoOk()) {
    const algo: PinAlgo = cashier.pinAlgo === 'PBKDF2-SHA512' ? 'PBKDF2-SHA512' : 'PBKDF2-SHA256';
    const iter = Number(cashier.pinIter) || PIN_ITER_LEGACY;
    try {
      const h = await derivePinHash(clean, String(cashier.pinSalt || ''), iter, algo);
      ok = safeEqual(h, String(cashier.pinHash));
      if (ok && (algo !== PIN_ALGO_LATEST || iter < PIN_ITER_LATEST)) {
        upgradedCashier = await setCashierPinFields(cashier, clean);
      }
    } catch {
      ok = false;
    }
  } else if (cashier.pin) {
    ok = safeEqual(clean, String(cashier.pin));
    if (ok && pinCryptoOk()) {
      upgradedCashier = await setCashierPinFields(cashier, clean);
    }
  }

  if (ok) {
    writeCashierLock(cashier.id, { fails: 0, until: 0 }, true);
    return { ok: true, upgradedCashier };
  }

  const nextFails = curLock.fails + 1;
  const nextUntil =
    nextFails % 5 === 0
      ? Date.now() + Math.min(15 * 60, 30 * Math.pow(2, nextFails / 5 - 1)) * 1000
      : curLock.until;
  writeCashierLock(cashier.id, { fails: nextFails, until: nextUntil });
  const w2 = Math.max(0, Math.ceil((nextUntil - Date.now()) / 1000));
  const rem = 5 - (nextFails % 5 || 5);
  return {
    ok: false,
    lockedOutNow: w2 > 0,
    error:
      w2 > 0
        ? `Too many wrong PINs for ${cashier.name}. Locked for ${fmtWait(w2)}`
        : `Incorrect cashier PIN for ${cashier.name} (${rem} tries left)`,
  };
}
