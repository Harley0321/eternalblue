import type { SecurityLogEntry } from '../types/pos';

const WEAK_PINS = new Set(['0000', '1111', '1234', '4321', '123456', '000000', '111111']);

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return new Uint8Array(derived);
}

const DEFAULT_PBKDF2_ITER = 600_000;
const MAX_PBKDF2_ITER = 1_000_000;

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const SecurityManager = {
  DEFAULT_PBKDF2_ITER,

  isPinWeak(pin: string): boolean {
    return WEAK_PINS.has(pin.trim());
  },

  async hashPin(pin: string): Promise<[string, string]> {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const hash = await pbkdf2(pin, salt, DEFAULT_PBKDF2_ITER);
    return [toBase64(hash), toBase64(salt)];
  },

  async verifyPin(
    pin: string,
    storedHash?: string | null,
    storedSalt?: string | null,
    iterations: number = DEFAULT_PBKDF2_ITER
  ): Promise<boolean> {
    if (!storedHash || !storedSalt) return false;
    try {
      const salt = fromBase64(storedSalt);
      const expected = fromBase64(storedHash);
      const iter = iterations > 0 ? iterations : DEFAULT_PBKDF2_ITER;
      if (!Number.isSafeInteger(iter) || iter > MAX_PBKDF2_ITER) return false;
      const actual = await pbkdf2(pin, salt, iter);
      return constantTimeEqual(expected, actual);
    } catch {
      return false;
    }
  },

  sha256Hex,

  async appendSecurityEvent(
    existing: SecurityLogEntry[],
    event: string,
    severity: string,
    summary: string
  ): Promise<SecurityLogEntry[]> {
    const last = existing[0];
    const seq = (last?.seq ?? 0) + 1;
    const prevHash = last?.entryHash ?? 'GENESIS';
    const ts = new Date().toISOString();
    const entryHash = await sha256Hex(`${seq}|${ts}|${event}|${severity}|${summary}|${prevHash}`);
    const entry: SecurityLogEntry = {
      id: `SEC-${seq}-${Date.now()}`,
      seq,
      timestamp: ts,
      event,
      severity,
      summary,
      prevHash,
      entryHash,
    };
    return [entry, ...existing].slice(0, 100);
  },
};
