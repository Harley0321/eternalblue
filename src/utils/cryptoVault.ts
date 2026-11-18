import type {
  EncryptedVaultEnvelope,
  HeldOrder,
  Product,
  SaleRecord,
  SecurityEventType,
  SecurityLogEntry,
  SecuritySeverity,
  StoreSettings,
} from '../types';
import { b64ToBytes, bytesToB64 } from './pinSecurity';
import { safeJsonParse, validateBackupPayload } from './posMath';

const getCrypto = (): Crypto | undefined => globalThis.crypto;

export const VAULT_FORMAT = 'omnimart-aes256gcm-v2' as const;
export const VAULT_KDF = 'PBKDF2-SHA512+HKDF-SHA256' as const;
export const VAULT_KDF_ITER = 310000;

const KEYSTORE_DB = 'omnimart_security_keystore_v1';
const KEYSTORE_STORE = 'keys';
const DEVICE_HMAC_KEY_ID = 'ledger_hmac_v1';

/* -------------------------------------------------------------------------- */
/* 1. Non-Extractable Device Keystore (IndexedDB CryptoKey, extractable=false)*/
/* -------------------------------------------------------------------------- */

export function isDeviceKeystoreSupported(): boolean {
  return !!(
    typeof indexedDB !== 'undefined' &&
    getCrypto()?.subtle &&
    typeof getCrypto()?.getRandomValues === 'function'
  );
}

function openKeystoreDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEYSTORE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEYSTORE_STORE)) {
        db.createObjectStore(KEYSTORE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB keystore open failed'));
  });
}

function idbGetKey(db: IDBDatabase, id: string): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEYSTORE_STORE, 'readonly');
    const req = tx.objectStore(KEYSTORE_STORE).get(id);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPutKey(db: IDBDatabase, id: string, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEYSTORE_STORE, 'readwrite');
    tx.objectStore(KEYSTORE_STORE).put(key, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let cachedHmacKey: CryptoKey | null = null;

export async function hasDeviceHmacKey(): Promise<boolean> {
  if (cachedHmacKey) return true;
  if (!isDeviceKeystoreSupported()) return false;
  try {
    const db = await openKeystoreDb();
    try {
      const existing = await idbGetKey(db, DEVICE_HMAC_KEY_ID);
      if (existing) {
        cachedHmacKey = existing;
        return true;
      }
      return false;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

/**
 * Retrieves or generates a non-extractable HMAC-SHA256 CryptoKey stored in IndexedDB.
 * Even XSS script code cannot export raw key bytes because extractable = false.
 */
export async function ensureDeviceHmacKey(): Promise<CryptoKey | null> {
  if (cachedHmacKey) return cachedHmacKey;
  if (!isDeviceKeystoreSupported()) return null;
  const c = getCrypto();
  if (!c?.subtle) return null;

  try {
    const db = await openKeystoreDb();
    try {
      const existing = await idbGetKey(db, DEVICE_HMAC_KEY_ID);
      if (existing) {
        cachedHmacKey = existing;
        return existing;
      }
      const created = await c.subtle.generateKey(
        { name: 'HMAC', hash: 'SHA-256' },
        false, // Non-extractable hardware/browser keystore isolation
        ['sign', 'verify'],
      );
      await idbPutKey(db, DEVICE_HMAC_KEY_ID, created);
      cachedHmacKey = created;
      return created;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function signWithDeviceKey(message: string): Promise<string | undefined> {
  const c = getCrypto();
  if (!c?.subtle) return undefined;
  const key = await ensureDeviceHmacKey();
  if (!key) return undefined;
  try {
    const sig = await c.subtle.sign('HMAC', key, new TextEncoder().encode(message));
    return bytesToB64(new Uint8Array(sig));
  } catch {
    return undefined;
  }
}

export async function verifyWithDeviceKey(message: string, sigB64: string): Promise<boolean | null> {
  const c = getCrypto();
  if (!c?.subtle) return null;
  const hasKey = await hasDeviceHmacKey();
  if (!hasKey || !cachedHmacKey) return null;
  try {
    const sigBytes = b64ToBytes(sigB64);
    return await c.subtle.verify(
      'HMAC',
      cachedHmacKey,
      sigBytes.buffer as ArrayBuffer,
      new TextEncoder().encode(message),
    );
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Authenticated AES-256-GCM Encrypted Backup Vault (PBKDF2-SHA512 + HKDF) */
/* -------------------------------------------------------------------------- */

export interface PassphraseStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too Short' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  ok: boolean;
  hint: string;
}

export function evaluatePassphraseStrength(passphrase: string): PassphraseStrength {
  const p = String(passphrase || '');
  if (p.length < 8) {
    return {
      score: 0,
      label: 'Too Short',
      ok: false,
      hint: 'Use at least 8 characters (12+ recommended with letters, numbers, and symbols).',
    };
  }
  let classes = 0;
  if (/[a-z]/.test(p)) classes++;
  if (/[A-Z]/.test(p)) classes++;
  if (/\d/.test(p)) classes++;
  if (/[^A-Za-z0-9]/.test(p)) classes++;

  const hasCommon = /^(password|12345678|qwerty|omnimart|admin123)[\d!@#$]*$/i.test(p);
  if (hasCommon || (classes === 1 && p.length < 12)) {
    return {
      score: 1,
      label: 'Weak',
      ok: false,
      hint: 'Avoid common words or single-character types. Mix uppercase, numbers, or symbols.',
    };
  }

  let pts = 1;
  if (p.length >= 10) pts++;
  if (p.length >= 14) pts++;
  if (classes >= 3) pts++;
  if (classes >= 4 && p.length >= 12) pts++;

  const clamped = Math.min(4, pts) as 0 | 1 | 2 | 3 | 4;
  if (clamped <= 2) {
    return {
      score: 2,
      label: 'Fair',
      ok: true,
      hint: 'Good enough; adding length or symbols raises vault defense.',
    };
  }
  if (clamped === 3) {
    return {
      score: 3,
      label: 'Strong',
      ok: true,
      hint: 'Strong passphrase backed by 310,000 PBKDF2-SHA512 rounds + AES-256-GCM.',
    };
  }
  return {
    score: 4,
    label: 'Very Strong',
    ok: true,
    hint: 'Maximum passphrase resilience with HKDF-SHA256 + AES-256-GCM AEAD.',
  };
}

export function isEncryptedVaultEnvelope(data: unknown): data is EncryptedVaultEnvelope {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const o = data as Record<string, unknown>;
  return (
    o.app === 'omnimart-ph-pos' &&
    o.format === VAULT_FORMAT &&
    typeof o.salt === 'string' &&
    typeof o.hkdfSalt === 'string' &&
    typeof o.iv === 'string' &&
    typeof o.ciphertext === 'string'
  );
}

async function deriveVaultAesKey(
  passphrase: string,
  pbkdfSalt: Uint8Array,
  hkdfSalt: Uint8Array,
  iterations: number,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const c = getCrypto();
  if (!c?.subtle) {
    throw new Error('WebCrypto is required for AES-256-GCM vault operations');
  }
  const baseKey = await c.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const ikmBits = await c.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-512',
      salt: pbkdfSalt.buffer as ArrayBuffer,
      iterations,
    },
    baseKey,
    256,
  );
  const hkdfKey = await c.subtle.importKey('raw', ikmBits, 'HKDF', false, ['deriveKey']);
  return c.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: hkdfSalt.buffer as ArrayBuffer,
      info: new TextEncoder().encode('omnimart-vault-v2-aes256gcm'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

function buildVaultAad(exportedAt: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(`omnimart-ph-pos:${VAULT_FORMAT}:${exportedAt}`);
  return bytes.buffer as ArrayBuffer;
}

export interface BackupPayloadObject {
  app: 'omnimart-ph-pos';
  version: number;
  exportedAt: string;
  products: Product[];
  sales: SaleRecord[];
  heldOrders: HeldOrder[];
  settings?: Record<string, unknown>;
}

export async function encryptBackupPayload(
  payload: BackupPayloadObject,
  passphrase: string,
  iterations: number = VAULT_KDF_ITER,
): Promise<EncryptedVaultEnvelope> {
  const c = getCrypto();
  if (!c?.subtle) {
    throw new Error('WebCrypto AES-256-GCM is unavailable in this environment.');
  }
  const salt = c.getRandomValues(new Uint8Array(16));
  const hkdfSalt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12)); // 96-bit NIST-recommended GCM IV
  const safeIter = Math.max(100000, Math.floor(iterations));

  const aesKey = await deriveVaultAesKey(passphrase, salt, hkdfSalt, safeIter, ['encrypt']);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await c.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer as ArrayBuffer,
      additionalData: buildVaultAad(payload.exportedAt),
      tagLength: 128,
    },
    aesKey,
    plaintext,
  );

  return {
    app: 'omnimart-ph-pos',
    format: VAULT_FORMAT,
    kdf: VAULT_KDF,
    iterations: safeIter,
    salt: bytesToB64(salt),
    hkdfSalt: bytesToB64(hkdfSalt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(encrypted)),
    exportedAt: payload.exportedAt,
    summary: {
      products: payload.products.length,
      sales: payload.sales.length,
      heldOrders: payload.heldOrders.length,
    },
  };
}

export async function decryptBackupPayload(
  envelope: EncryptedVaultEnvelope,
  passphrase: string,
): Promise<{
  products: Product[];
  sales: SaleRecord[];
  heldOrders: HeldOrder[];
  settings?: Partial<StoreSettings>;
  exportedAt?: string;
}> {
  const c = getCrypto();
  if (!c?.subtle) {
    throw new Error('WebCrypto AES-256-GCM is unavailable in this environment.');
  }
  if (!isEncryptedVaultEnvelope(envelope)) {
    throw new Error('File is not a valid OmniMart AES-256-GCM encrypted vault.');
  }
  const salt = b64ToBytes(envelope.salt);
  const hkdfSalt = b64ToBytes(envelope.hkdfSalt);
  const iv = b64ToBytes(envelope.iv);
  const ciphertext = b64ToBytes(envelope.ciphertext);
  const iter = Number(envelope.iterations) || VAULT_KDF_ITER;

  const aesKey = await deriveVaultAesKey(passphrase, salt, hkdfSalt, iter, ['decrypt']);
  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await c.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv.buffer as ArrayBuffer,
        additionalData: buildVaultAad(envelope.exportedAt),
        tagLength: 128,
      },
      aesKey,
      ciphertext.buffer as ArrayBuffer,
    );
  } catch {
    throw new Error('Decryption failed: incorrect passphrase or tampered vault file.');
  }

  const parsed = safeJsonParse<unknown>(new TextDecoder().decode(plainBuf));
  const check = validateBackupPayload(parsed);
  if (check.ok === false) {
    throw new Error(check.error);
  }
  return check.data;
}

/* -------------------------------------------------------------------------- */
/* 3. Tamper-Evident SHA-256 Hash-Chained Security Audit Ledger               */
/* -------------------------------------------------------------------------- */

export async function sha256Hex(text: string): Promise<string> {
  const c = getCrypto();
  if (!c?.subtle) {
    throw new Error('WebCrypto SHA-256 unavailable');
  }
  const digest = await c.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function canonicalSecurityRecord(entry: {
  id: string;
  seq: number;
  timestamp: string;
  event: SecurityEventType;
  severity: SecuritySeverity;
  summary: string;
  prevHash: string;
}): string {
  return JSON.stringify([
    entry.seq,
    entry.id,
    entry.timestamp,
    entry.event,
    entry.severity,
    entry.summary,
    entry.prevHash,
  ]);
}

export async function createSecurityLogEntry(
  existingNewestFirst: SecurityLogEntry[],
  input: {
    event: SecurityEventType;
    severity?: SecuritySeverity;
    summary: string;
    timestamp?: string;
    signWithHardware?: boolean;
  },
): Promise<SecurityLogEntry> {
  const latest = existingNewestFirst[0];
  const maxSeq = existingNewestFirst.reduce((m, e) => Math.max(m, e.seq || 0), 0);
  const seq = maxSeq + 1;
  const prevHash = latest ? latest.entryHash : 'GENESIS';
  const timestamp = input.timestamp || new Date().toISOString();
  const id = `SEC-${seq}-${Date.now().toString(36)}`;
  const severity: SecuritySeverity = input.severity || 'info';

  const body = {
    id,
    seq,
    timestamp,
    event: input.event,
    severity,
    summary: input.summary,
    prevHash,
  };
  const entryHash = await sha256Hex(canonicalSecurityRecord(body));
  const hmacSig = input.signWithHardware === false ? undefined : await signWithDeviceKey(entryHash);

  return {
    ...body,
    entryHash,
    ...(hmacSig ? { hmacSig } : {}),
  };
}

export interface SecurityChainReport {
  valid: boolean;
  verifiedCount: number;
  signedCount: number;
  brokenSeqs: number[];
  hmacMismatches: number[];
}

export async function verifySecurityChain(
  entries: SecurityLogEntry[],
): Promise<SecurityChainReport> {
  if (!entries || entries.length === 0) {
    return { valid: true, verifiedCount: 0, signedCount: 0, brokenSeqs: [], hmacMismatches: [] };
  }

  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  const brokenSeqs: number[] = [];
  const hmacMismatches: number[] = [];
  let signedCount = 0;

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const expectedHash = await sha256Hex(canonicalSecurityRecord(cur));
    const linkExpected =
      i === 0
        ? cur.seq === 1
          ? 'GENESIS'
          : cur.prevHash
        : sorted[i - 1].entryHash;

    if (cur.entryHash !== expectedHash || cur.prevHash !== linkExpected || (i > 0 && cur.seq !== sorted[i - 1].seq + 1)) {
      brokenSeqs.push(cur.seq);
    }

    if (cur.hmacSig) {
      signedCount++;
      const hmacOk = await verifyWithDeviceKey(cur.entryHash, cur.hmacSig);
      if (hmacOk === false) {
        hmacMismatches.push(cur.seq);
      }
    }
  }

  return {
    valid: brokenSeqs.length === 0 && hmacMismatches.length === 0,
    verifiedCount: sorted.length,
    signedCount,
    brokenSeqs,
    hmacMismatches,
  };
}

/* -------------------------------------------------------------------------- */
/* 4. Client-Side FIDO2 / WebAuthn Passkey & Biometric Verification           */
/* -------------------------------------------------------------------------- */

export function isPasskeySupported(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    navigator.credentials &&
    typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function'
  );
}

/**
 * Converts an ASN.1 DER-encoded ECDSA signature (r, s) returned by WebAuthn authenticators
 * into the fixed 64-byte IEEE P1363 (r || s) encoding expected by WebCrypto SubtleCrypto.
 */
export function derEcdsaToP1363(der: Uint8Array, coordinateSize = 32): Uint8Array {
  if (der.length < 8 || der[0] !== 0x30) {
    throw new Error('Invalid ECDSA DER signature');
  }
  let offset = 2;
  if (der[1] & 0x80) {
    offset = 2 + (der[1] & 0x7f);
  }
  if (der[offset] !== 0x02) throw new Error('Invalid DER R tag');
  const rLen = der[offset + 1];
  const rStart = offset + 2;
  const rRaw = der.slice(rStart, rStart + rLen);
  offset = rStart + rLen;

  if (der[offset] !== 0x02) throw new Error('Invalid DER S tag');
  const sLen = der[offset + 1];
  const sStart = offset + 2;
  const sRaw = der.slice(sStart, sStart + sLen);

  const out = new Uint8Array(coordinateSize * 2);
  const copyTrimmed = (src: Uint8Array, destOffset: number) => {
    let i = 0;
    while (i < src.length - 1 && src[i] === 0) i++;
    const significant = src.slice(i);
    if (significant.length > coordinateSize) {
      throw new Error('ECDSA coordinate exceeds P-256 size');
    }
    out.set(significant, destOffset + (coordinateSize - significant.length));
  };
  copyTrimmed(rRaw, 0);
  copyTrimmed(sRaw, coordinateSize);
  return out;
}

export async function verifyWebAuthnAssertionSignature(params: {
  spkiB64: string;
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  derSignature: Uint8Array;
  expectedChallenge: Uint8Array;
  expectedOrigin?: string;
}): Promise<boolean> {
  const c = getCrypto();
  if (!c?.subtle) return false;

  const clientText = new TextDecoder().decode(params.clientDataJSON);
  const clientData = safeJsonParse<{ type?: string; challenge?: string; origin?: string }>(clientText);
  if (clientData.type !== 'webauthn.get') return false;
  if (params.expectedOrigin && clientData.origin !== params.expectedOrigin) return false;

  // Verify base64url challenge
  const expectedB64Url = bytesToB64(params.expectedChallenge)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  if (clientData.challenge !== expectedB64Url) return false;

  // Verify AuthenticatorData flags: bit 0 (UP = User Present) must be set
  if (params.authenticatorData.length < 37) return false;
  const flags = params.authenticatorData[32];
  if ((flags & 0x01) === 0) return false;

  const spkiBytes = b64ToBytes(params.spkiB64);
  const pubKey = await c.subtle.importKey(
    'spki',
    spkiBytes.buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );

  const clientHash = new Uint8Array(
    await c.subtle.digest('SHA-256', params.clientDataJSON.buffer as ArrayBuffer),
  );
  const signedData = new Uint8Array(params.authenticatorData.length + clientHash.length);
  signedData.set(params.authenticatorData, 0);
  signedData.set(clientHash, params.authenticatorData.length);

  const rawSig = derEcdsaToP1363(params.derSignature, 32);
  return c.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pubKey,
    rawSig.buffer as ArrayBuffer,
    signedData.buffer as ArrayBuffer,
  );
}

export async function enrollLocalPasskey(storeName: string): Promise<{
  credId: string;
  pubKeySpki: string;
  label: string;
  registeredAt: string;
}> {
  if (!isPasskeySupported()) {
    throw new Error('Biometric / Passkey authentication requires HTTPS or localhost WebAuthn support.');
  }
  const c = getCrypto()!;
  const challenge = c.getRandomValues(new Uint8Array(32));
  const userId = c.getRandomValues(new Uint8Array(16));

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: storeName || 'OmniMart PH POS' },
      user: {
        id: userId,
        name: 'store-manager@omnimart.local',
        displayName: 'Store Manager',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256 P-256
      authenticatorSelection: {
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!cred) {
    throw new Error('Passkey registration was cancelled.');
  }

  const response = cred.response as AuthenticatorAttestationResponse & {
    getPublicKey?: () => ArrayBuffer | null;
    getPublicKeyAlgorithm?: () => number;
  };
  const spki = typeof response.getPublicKey === 'function' ? response.getPublicKey() : null;
  if (!spki) {
    throw new Error('Browser did not expose ES256 public key for local cryptographic verification.');
  }
  if (typeof response.getPublicKeyAlgorithm === 'function' && response.getPublicKeyAlgorithm() !== -7) {
    throw new Error('Only ES256 (P-256) hardware passkeys are supported for local verification.');
  }

  return {
    credId: bytesToB64(new Uint8Array(cred.rawId)),
    pubKeySpki: bytesToB64(new Uint8Array(spki)),
    label: 'Device Biometric / FIDO2 Passkey',
    registeredAt: new Date().toISOString(),
  };
}

export async function verifyLocalPasskey(
  credIdB64: string,
  pubKeySpkiB64: string,
): Promise<boolean> {
  if (!isPasskeySupported()) {
    throw new Error('WebAuthn Passkey is unavailable in this browser context.');
  }
  const c = getCrypto()!;
  const challenge = c.getRandomValues(new Uint8Array(32));
  const credId = b64ToBytes(credIdB64);

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: credId.buffer as ArrayBuffer, type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) return false;
  const resp = assertion.response as AuthenticatorAssertionResponse;
  return verifyWebAuthnAssertionSignature({
    spkiB64: pubKeySpkiB64,
    authenticatorData: new Uint8Array(resp.authenticatorData),
    clientDataJSON: new Uint8Array(resp.clientDataJSON),
    derSignature: new Uint8Array(resp.signature),
    expectedChallenge: challenge,
    expectedOrigin: window.location.origin,
  });
}
