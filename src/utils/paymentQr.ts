import type { StoreSettings } from '../types';
import { round2 } from './posMath';

export interface EmvTlvTag {
  id: string;
  length: number;
  value: string;
}

export interface ParsedEmvCoQr {
  ok: true;
  tags: EmvTlvTag[];
  merchantName: string;
  merchantCity: string;
  currencyNumeric: string;
  countryCode: string;
  amount: number | null;
  channelLabel: string;
  isDynamic: boolean;
  crcValid: boolean;
}

export interface ParsedEmvCoQrError {
  ok: false;
  error: string;
}

export type ParseEmvCoResult = ParsedEmvCoQr | ParsedEmvCoQrError;

/**
 * Standard EMVCo QR Code CRC-16/CCITT-FALSE checksum:
 * Polynomial 0x1021, initial value 0xFFFF, no final XOR.
 */
export function crc16CcittFalse(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= (input.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function parseEmvTlv(raw: string): { ok: true; tags: EmvTlvTag[] } | { ok: false; error: string } {
  const clean = String(raw || '').trim();
  if (clean.length < 12) {
    return { ok: false, error: 'Payload is too short to be an EMVCo / QR Ph code.' };
  }

  const tags: EmvTlvTag[] = [];
  let cursor = 0;

  while (cursor < clean.length) {
    if (cursor + 4 > clean.length) {
      return { ok: false, error: `Truncated TLV header at offset ${cursor}.` };
    }
    const id = clean.slice(cursor, cursor + 2);
    const lenStr = clean.slice(cursor + 2, cursor + 4);
    if (!/^\d{2}$/.test(lenStr)) {
      return { ok: false, error: `Invalid TLV length "${lenStr}" for tag ${id}.` };
    }
    const length = Number(lenStr);
    const valStart = cursor + 4;
    const valEnd = valStart + length;
    if (valEnd > clean.length) {
      return { ok: false, error: `Tag ${id} length (${length}) exceeds payload end.` };
    }
    tags.push({
      id,
      length,
      value: clean.slice(valStart, valEnd),
    });
    cursor = valEnd;
  }

  return { ok: true, tags };
}

export function serializeEmvTlv(tags: EmvTlvTag[]): string {
  return tags
    .map((t) => `${t.id}${String(t.value.length).padStart(2, '0')}${t.value}`)
    .join('');
}

function detectPhChannel(tags: EmvTlvTag[]): string {
  const acctText = tags
    .filter((t) => {
      const n = Number(t.id);
      return n >= 26 && n <= 51;
    })
    .map((t) => t.value.toLowerCase())
    .join(' ');

  if (acctText.includes('gcash') || acctText.includes('gxch')) return 'GCash / QR Ph';
  if (acctText.includes('maya') || acctText.includes('paymaya')) return 'Maya / QR Ph';
  if (acctText.includes('gotyme')) return 'GoTyme / QR Ph';
  if (acctText.includes('bpi')) return 'BPI / QR Ph';
  if (acctText.includes('bdo')) return 'BDO / QR Ph';
  if (acctText.includes('qrph') || acctText.includes('ph.p2m') || acctText.includes('instapay') || acctText.includes('bancnet')) {
    return 'QR Ph';
  }
  return 'QR Ph / EMV';
}

export function parseEmvCoQr(raw: string): ParseEmvCoResult {
  const clean = String(raw || '').trim();
  if (!clean.startsWith('000201')) {
    return {
      ok: false,
      error: 'Not an EMVCo QR Ph payload (must start with 000201).',
    };
  }

  const parsed = parseEmvTlv(clean);
  if (!parsed.ok) return parsed;

  const { tags } = parsed;
  const crcTag = tags[tags.length - 1];
  if (!crcTag || crcTag.id !== '63' || crcTag.value.length !== 4) {
    return { ok: false, error: 'Missing valid EMVCo Tag 63 (CRC checksum).' };
  }

  const bodyWithoutCrc = clean.slice(0, clean.length - 4);
  const expectedCrc = crc16CcittFalse(bodyWithoutCrc);
  const crcValid = crcTag.value.toUpperCase() === expectedCrc;

  const getTag = (id: string) => tags.find((t) => t.id === id)?.value || '';
  const amtRaw = getTag('54');
  const amtNum = amtRaw ? Number(amtRaw) : NaN;

  return {
    ok: true,
    tags,
    merchantName: getTag('59') || 'Store Merchant',
    merchantCity: getTag('60') || 'Philippines',
    currencyNumeric: getTag('53') || '608',
    countryCode: getTag('58') || 'PH',
    amount: Number.isFinite(amtNum) && amtNum > 0 ? round2(amtNum) : null,
    channelLabel: detectPhChannel(tags),
    isDynamic: getTag('01') === '12',
    crcValid,
  };
}

/**
 * Takes a valid static or dynamic EMVCo / QR Ph merchant string and encodes the exact
 * checkout peso amount (Tag 54 + Tag 01 = '12' dynamic + recalculated Tag 63 CRC-16).
 */
export function patchEmvCoQrAmount(
  rawPayload: string,
  amountPeso: number,
): { ok: true; payload: string; formattedAmount: string | null } | { ok: false; error: string } {
  const parsed = parseEmvCoQr(rawPayload);
  if (!parsed.ok) return parsed;
  if (!parsed.crcValid) {
    return { ok: false, error: 'Stored QR Ph checksum is invalid. Please re-paste or re-scan the merchant QR.' };
  }

  const cleanAmt = round2(Math.max(0, Number(amountPeso) || 0));
  const formattedAmount = cleanAmt > 0 ? cleanAmt.toFixed(2) : null;

  const nextTags = parsed.tags
    .filter((t) => t.id !== '54' && t.id !== '63' && t.id !== '01')
    .map((t) => ({ ...t }));

  // Ensure Tag 01 initiation method sits right after Tag 00
  const initTag: EmvTlvTag = {
    id: '01',
    length: 2,
    value: formattedAmount ? '12' : '11',
  };
  const idx00 = nextTags.findIndex((t) => t.id === '00');
  nextTags.splice(idx00 >= 0 ? idx00 + 1 : 0, 0, initTag);

  // Ensure Tag 53 Currency = 608 (PHP) and Tag 58 Country = PH exist if absent
  if (!nextTags.some((t) => t.id === '53')) {
    nextTags.push({ id: '53', length: 3, value: '608' });
  }
  if (!nextTags.some((t) => t.id === '58')) {
    nextTags.push({ id: '58', length: 2, value: 'PH' });
  }

  // Insert Tag 54 in standard numeric tag order (right before Tag 58)
  if (formattedAmount) {
    const amtTag: EmvTlvTag = {
      id: '54',
      length: formattedAmount.length,
      value: formattedAmount,
    };
    const insertIdx = nextTags.findIndex((t) => Number(t.id) > 54);
    if (insertIdx >= 0) {
      nextTags.splice(insertIdx, 0, amtTag);
    } else {
      nextTags.push(amtTag);
    }
  }

  const bodyPlusCrcPrefix = serializeEmvTlv(nextTags) + '6304';
  const crc = crc16CcittFalse(bodyPlusCrcPrefix);
  return {
    ok: true,
    payload: bodyPlusCrcPrefix + crc,
    formattedAmount,
  };
}

export type CheckoutQrMode = 'emvco' | 'image' | 'manual' | 'unconfigured';

export interface ResolvedCheckoutQr {
  mode: CheckoutQrMode;
  channelLabel: string;
  merchantName: string;
  accountNumber: string;
  amount: number;
  qrPayload: string | null;
  qrImageDataUrl: string | null;
  isDynamicAmount: boolean;
  error?: string;
}

export function resolveCheckoutQrState(
  settings: Pick<
    StoreSettings,
    'storeName' | 'qrPayLabel' | 'qrMerchantName' | 'qrAccountNumber' | 'qrEmvPayload' | 'qrImageDataUrl'
  >,
  amountPeso: number,
): ResolvedCheckoutQr {
  const cleanAmt = round2(Math.max(0, Number(amountPeso) || 0));
  const rawEmv = String(settings.qrEmvPayload || '').trim();
  const rawImg = String(settings.qrImageDataUrl || '').trim();
  const acct = String(settings.qrAccountNumber || '').trim();
  const label = String(settings.qrPayLabel || '').trim() || 'QR Ph / GCash';
  const fallbackName = String(settings.qrMerchantName || settings.storeName || '').trim() || 'Store Merchant';

  if (rawEmv) {
    const parsed = parseEmvCoQr(rawEmv);
    if (parsed.ok && parsed.crcValid) {
      const patched = patchEmvCoQrAmount(rawEmv, cleanAmt);
      if (patched.ok) {
        return {
          mode: 'emvco',
          channelLabel: String(settings.qrPayLabel || '').trim() || parsed.channelLabel,
          merchantName: String(settings.qrMerchantName || '').trim() || parsed.merchantName || fallbackName,
          accountNumber: acct,
          amount: cleanAmt,
          qrPayload: patched.payload,
          qrImageDataUrl: null,
          isDynamicAmount: cleanAmt > 0,
        };
      }
    }
    // Non-EMVCo arbitrary QR payload (e.g., store PayLink URL or static non-EMVCo string)
    if (!rawEmv.startsWith('000201')) {
      return {
        mode: 'emvco',
        channelLabel: label,
        merchantName: fallbackName,
        accountNumber: acct,
        amount: cleanAmt,
        qrPayload: rawEmv,
        qrImageDataUrl: null,
        isDynamicAmount: false,
      };
    }
    if (!rawImg && !acct) {
      return {
        mode: 'unconfigured',
        channelLabel: label,
        merchantName: fallbackName,
        accountNumber: acct,
        amount: cleanAmt,
        qrPayload: null,
        qrImageDataUrl: null,
        isDynamicAmount: false,
        error: parsed.ok ? 'Invalid QR Ph checksum' : parsed.error,
      };
    }
  }

  if (rawImg) {
    return {
      mode: 'image',
      channelLabel: label,
      merchantName: fallbackName,
      accountNumber: acct,
      amount: cleanAmt,
      qrPayload: null,
      qrImageDataUrl: rawImg,
      isDynamicAmount: false,
    };
  }

  if (acct) {
    return {
      mode: 'manual',
      channelLabel: label,
      merchantName: fallbackName,
      accountNumber: acct,
      amount: cleanAmt,
      qrPayload: null,
      qrImageDataUrl: null,
      isDynamicAmount: false,
    };
  }

  return {
    mode: 'unconfigured',
    channelLabel: label,
    merchantName: fallbackName,
    accountNumber: '',
    amount: cleanAmt,
    qrPayload: null,
    qrImageDataUrl: null,
    isDynamicAmount: false,
  };
}

/**
 * Generates a compliant EMVCo QR Ph payload string (for merchant setup testing or demos).
 */
export function buildMerchantQrPhString(opts: {
  merchantName: string;
  merchantCity?: string;
  merchantAccount?: string;
  amount?: number;
}): string {
  const name = (opts.merchantName || 'STORE MERCHANT').trim().slice(0, 25);
  const city = (opts.merchantCity || 'MANGATAREM').trim().slice(0, 15);
  const acctVal = (opts.merchantAccount || '09170000000').trim().slice(0, 32);

  const subTags: EmvTlvTag[] = [
    { id: '00', length: 9, value: 'ph.p2m.01' },
    { id: '01', length: acctVal.length, value: acctVal },
  ];
  const tag27Val = serializeEmvTlv(subTags);

  const root: EmvTlvTag[] = [
    { id: '00', length: 2, value: '01' },
    { id: '01', length: 2, value: opts.amount && opts.amount > 0 ? '12' : '11' },
    { id: '27', length: tag27Val.length, value: tag27Val },
    { id: '52', length: 4, value: '5411' },
    { id: '53', length: 3, value: '608' },
  ];

  if (opts.amount && opts.amount > 0) {
    const amtStr = round2(opts.amount).toFixed(2);
    root.push({ id: '54', length: amtStr.length, value: amtStr });
  }

  root.push(
    { id: '58', length: 2, value: 'PH' },
    { id: '59', length: name.length, value: name },
    { id: '60', length: city.length, value: city },
  );

  const bodyPlusCrcPrefix = serializeEmvTlv(root) + '6304';
  return bodyPlusCrcPrefix + crc16CcittFalse(bodyPlusCrcPrefix);
}
