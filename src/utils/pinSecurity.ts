import type { StoreSettings } from '../types';
import { STORAGE_KEYS } from './posMath';

export const PIN_ITER = 150000;
export const PIN_SETTING_KEYS = ['adminPin', 'adminPinHash', 'adminPinSalt', 'adminPinIter', 'adminPinWeak'] as const;

const b64 = (u8: Uint8Array): string => {
  let t = '';
  u8.forEach((b) => {
    t += String.fromCharCode(b);
  });
  return btoa(t);
};

const unb64 = (b: string): Uint8Array => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

export function pinCryptoOk(): boolean {
  return !!(typeof window !== 'undefined' && window.crypto && window.crypto.subtle && window.crypto.getRandomValues);
}

export async function derivePinHash(pin: string, saltB64: string, iter: number): Promise<string> {
  const key = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = unb64(saltB64);
  const bits = await window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes.buffer as ArrayBuffer, iterations: iter },
    key,
    256,
  );
  return b64(new Uint8Array(bits));
}

export function safeEqual(a: string, b: string): boolean {
  a = String(a);
  b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
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
  return ['1212', '2580', '1004', '2000', '2001', '1122', '6969', '121212', '112233'].includes(pin);
}

export function pinIsSet(settings: StoreSettings): boolean {
  return !!(settings.adminPinHash || settings.adminPin);
}

export function pinNeedsChange(settings: StoreSettings): boolean {
  return !!(settings.adminPinWeak || (!settings.adminPinHash && settings.adminPin && isWeakPin(String(settings.adminPin))));
}

interface PinLockState {
  fails: number;
  until: number;
}

export function pinLockRead(): PinLockState {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.PINLOCK) || 'null') || { fails: 0, until: 0 };
  } catch {
    return { fails: 0, until: 0 };
  }
}

export function pinLockWrite(o: PinLockState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PINLOCK, JSON.stringify(o));
  } catch {
    // ignore
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
  const next = { ...settings };
  if (pinCryptoOk()) {
    const salt = b64(window.crypto.getRandomValues(new Uint8Array(16)));
    next.adminPinHash = await derivePinHash(pin, salt, PIN_ITER);
    next.adminPinSalt = salt;
    next.adminPinIter = PIN_ITER;
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
): Promise<{ ok: boolean; error?: string; upgradedSettings?: StoreSettings }> {
  const wait = pinLockedFor();
  if (wait > 0) {
    return { ok: false, error: `Too many wrong PINs. Try again in ${fmtWait(wait)}` };
  }

  const clean = String(entered || '');
  let ok = false;
  let upgradedSettings: StoreSettings | undefined;

  if (settings.adminPinHash && pinCryptoOk()) {
    try {
      const h = await derivePinHash(clean, String(settings.adminPinSalt || ''), Number(settings.adminPinIter) || PIN_ITER);
      ok = safeEqual(h, String(settings.adminPinHash));
    } catch {
      ok = false;
    }
  } else if (settings.adminPin) {
    ok = safeEqual(clean, String(settings.adminPin));
    if (ok && pinCryptoOk()) {
      upgradedSettings = await storePinInSettings(settings, clean, isWeakPin(clean));
    }
  }

  if (ok) {
    pinRegisterOk();
    return { ok: true, upgradedSettings };
  }

  const l = pinRegisterFail();
  const w2 = pinLockedFor();
  return {
    ok: false,
    error:
      w2 > 0
        ? `Too many wrong PINs. Locked for ${fmtWait(w2)}`
        : `Incorrect Manager PIN (${5 - (l.fails % 5 || 5)} tries left before lock)`,
  };
}
