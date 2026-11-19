import QRCode from 'qrcode';
import { PosMath } from './posMath';
import type { StoreSettings } from '../types/pos';

export interface EmvTag {
  id: string;
  value: string;
}

export interface ResolvedQr {
  mode: 'EMVCO' | 'MANUAL' | 'UNCONFIGURED';
  channelLabel: string;
  merchantName: string;
  accountNumber: string;
  amount: number;
  qrPayload?: string | null;
  isDynamicAmount: boolean;
}

export const PaymentQr = {
  crc16CcittFalse(input: string): string {
    let crc = 0xffff;
    for (let i = 0; i < input.length; i++) {
      crc ^= (input.charCodeAt(i) & 0xff) << 8;
      for (let b = 0; b < 8; b++) {
        crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  },

  parseEmvTlv(raw: string): EmvTag[] | null {
    const clean = raw.trim();
    if (clean.length < 12) return null;
    const tags: EmvTag[] = [];
    let cursor = 0;
    while (cursor < clean.length) {
      if (cursor + 4 > clean.length) return null;
      const id = clean.slice(cursor, cursor + 2);
      const lenStr = clean.slice(cursor + 2, cursor + 4);
      if (!/^\d{2}$/.test(lenStr)) return null;
      const len = parseInt(lenStr, 10);
      const start = cursor + 4;
      const end = start + len;
      if (end > clean.length) return null;
      tags.push({ id, value: clean.slice(start, end) });
      cursor = end;
    }
    return tags;
  },

  patchEmvAmount(rawPayload: string, amountPeso: number): string | null {
    const clean = rawPayload.trim();
    if (!clean.startsWith('000201')) return null;
    const tags = PaymentQr.parseEmvTlv(clean);
    if (!tags || tags.length === 0) return null;
    const crcTag = tags[tags.length - 1];
    if (!crcTag || crcTag.id !== '63' || crcTag.value.length !== 4) return null;
    const bodyWithoutCrc = clean.slice(0, -4);
    if (PaymentQr.crc16CcittFalse(bodyWithoutCrc).toLowerCase() !== crcTag.value.toLowerCase()) {
      return null;
    }

    const amt = PosMath.round2(Math.max(0, amountPeso));
    const formattedAmt = amt > 0 ? amt.toFixed(2) : null;

    const nextTags = tags.filter((t) => t.id !== '54' && t.id !== '63' && t.id !== '01');
    const initTag: EmvTag = { id: '01', value: formattedAmt ? '12' : '11' };
    const idx00 = nextTags.findIndex((t) => t.id === '00');
    nextTags.splice(idx00 >= 0 ? idx00 + 1 : 0, 0, initTag);
    if (!nextTags.some((t) => t.id === '53')) nextTags.push({ id: '53', value: '608' });
    if (!nextTags.some((t) => t.id === '58')) nextTags.push({ id: '58', value: 'PH' });

    if (formattedAmt) {
      const amtTag: EmvTag = { id: '54', value: formattedAmt };
      const idx = nextTags.findIndex((t) => {
        const n = parseInt(t.id, 10);
        return (Number.isFinite(n) ? n : 99) > 54;
      });
      if (idx >= 0) nextTags.splice(idx, 0, amtTag);
      else nextTags.push(amtTag);
    }

    const serialized =
      nextTags
        .map((t) => `${t.id}${String(t.value.length).padStart(2, '0')}${t.value}`)
        .join('') + '6304';
    return serialized + PaymentQr.crc16CcittFalse(serialized);
  },

  resolveCheckoutQr(settings: StoreSettings, amountPeso: number): ResolvedQr {
    const amt = PosMath.round2(Math.max(0, amountPeso));
    const emv = (settings.qrEmvPayload ?? '').trim();
    const acct = (settings.qrAccountNumber ?? '').trim();
    const label = settings.qrPayLabel?.trim() || 'QR Ph / GCash';
    const merchant = settings.qrMerchantName?.trim() || settings.storeName;

    if (emv) {
      const patched = PaymentQr.patchEmvAmount(emv, amt);
      return {
        mode: 'EMVCO',
        channelLabel: label,
        merchantName: merchant,
        accountNumber: acct,
        amount: amt,
        qrPayload: patched ?? emv,
        isDynamicAmount: patched !== null && amt > 0,
      };
    }
    if (acct) {
      return {
        mode: 'MANUAL',
        channelLabel: label,
        merchantName: merchant,
        accountNumber: acct,
        amount: amt,
        isDynamicAmount: false,
      };
    }
    return {
      mode: 'UNCONFIGURED',
      channelLabel: label,
      merchantName: merchant,
      accountNumber: '',
      amount: amt,
      isDynamicAmount: false,
    };
  },

  async renderQrDataUrl(payload: string, sizePx = 320): Promise<string | null> {
    if (!payload.trim()) return null;
    try {
      return await QRCode.toDataURL(payload, {
        width: sizePx,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
    } catch {
      return null;
    }
  },
};
