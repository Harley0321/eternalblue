import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMerchantQrPhString,
  crc16CcittFalse,
  parseEmvCoQr,
  patchEmvCoQrAmount,
  resolveCheckoutQrState,
} from './paymentQr';

test('CRC-16/CCITT-FALSE matches known EMVCo test vector', () => {
  // Standard ASCII check vector "123456789" -> 0x29B1
  assert.equal(crc16CcittFalse('123456789'), '29B1');
});

test('buildMerchantQrPhString creates valid verifiable static EMVCo QR Ph payload', () => {
  const payload = buildMerchantQrPhString({
    merchantName: 'ETERNALBLUE MART',
    merchantCity: 'PANGASINAN',
    merchantAccount: '09171234567',
  });
  const parsed = parseEmvCoQr(payload);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.crcValid, true);
    assert.equal(parsed.merchantName, 'ETERNALBLUE MART');
    assert.equal(parsed.merchantCity, 'PANGASINAN');
    assert.equal(parsed.currencyNumeric, '608');
    assert.equal(parsed.countryCode, 'PH');
    assert.equal(parsed.amount, null);
    assert.equal(parsed.isDynamic, false);
    assert.equal(parsed.channelLabel, 'QR Ph');
  }
});

test('patchEmvCoQrAmount injects exact amount into Tag 54, flips Tag 01 to 12, and updates CRC-16', () => {
  const staticQr = buildMerchantQrPhString({
    merchantName: 'SARI SARI NI ALING NENA',
    merchantCity: 'MANILA',
    merchantAccount: 'GCASH-09179998888',
  });

  const patched = patchEmvCoQrAmount(staticQr, 263.5);
  assert.equal(patched.ok, true);
  if (patched.ok) {
    assert.equal(patched.formattedAmount, '263.50');
    const verified = parseEmvCoQr(patched.payload);
    assert.equal(verified.ok, true);
    if (verified.ok) {
      assert.equal(verified.crcValid, true);
      assert.equal(verified.isDynamic, true);
      assert.equal(verified.amount, 263.5);
      assert.equal(verified.merchantName, 'SARI SARI NI ALING NENA');
      assert.equal(verified.channelLabel, 'GCash / QR Ph');
    }
  }
});

test('patchEmvCoQrAmount replaces pre-existing Tag 54 amount and reverts Tag 01 when zero', () => {
  const existingDyn = buildMerchantQrPhString({
    merchantName: 'TEST STORE',
    amount: 50,
  });

  const updated = patchEmvCoQrAmount(existingDyn, 1499.75);
  assert.equal(updated.ok, true);
  if (updated.ok) {
    const parsed = parseEmvCoQr(updated.payload);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.crcValid, true);
      assert.equal(parsed.amount, 1499.75);
      assert.equal(parsed.isDynamic, true);
    }

    const cleared = patchEmvCoQrAmount(updated.payload, 0);
    assert.equal(cleared.ok, true);
    if (cleared.ok) {
      const parsedCleared = parseEmvCoQr(cleared.payload);
      assert.equal(parsedCleared.ok, true);
      if (parsedCleared.ok) {
        assert.equal(parsedCleared.crcValid, true);
        assert.equal(parsedCleared.amount, null);
        assert.equal(parsedCleared.isDynamic, false);
      }
    }
  }
});

test('parseEmvCoQr rejects corrupted CRC and non-EMVCo strings safely', () => {
  const valid = buildMerchantQrPhString({ merchantName: 'STORE A' });
  const tampered = valid.slice(0, -1) + (valid.endsWith('0') ? '1' : '0');
  const res = parseEmvCoQr(tampered);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.crcValid, false);
  }

  const bad = parseEmvCoQr('https://example.com/not-emvco');
  assert.equal(bad.ok, false);
});

test('resolveCheckoutQrState prioritizes EMVCo dynamic -> uploaded image -> manual wallet -> unconfigured', () => {
  const emv = buildMerchantQrPhString({ merchantName: 'EMV MART' });
  const rEmv = resolveCheckoutQrState(
    {
      storeName: 'EternalBlue Mart',
      qrEmvPayload: emv,
      qrImageDataUrl: 'data:image/png;base64,AAA',
      qrAccountNumber: '09171112222',
    },
    185.25,
  );
  assert.equal(rEmv.mode, 'emvco');
  assert.equal(rEmv.isDynamicAmount, true);
  assert.ok(rEmv.qrPayload?.includes('5406185.25'));

  const rImg = resolveCheckoutQrState(
    {
      storeName: 'EternalBlue Mart',
      qrPayLabel: 'GCash',
      qrImageDataUrl: 'data:image/png;base64,AAA',
      qrAccountNumber: '09171112222',
    },
    185.25,
  );
  assert.equal(rImg.mode, 'image');
  assert.equal(rImg.qrImageDataUrl, 'data:image/png;base64,AAA');

  const rManual = resolveCheckoutQrState(
    {
      storeName: 'EternalBlue Mart',
      qrPayLabel: 'Maya',
      qrAccountNumber: '09171112222',
    },
    99,
  );
  assert.equal(rManual.mode, 'manual');
  assert.equal(rManual.accountNumber, '09171112222');

  const rNone = resolveCheckoutQrState({ storeName: 'EternalBlue Mart' }, 99);
  assert.equal(rNone.mode, 'unconfigured');
});
