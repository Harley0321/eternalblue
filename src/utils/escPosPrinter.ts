import type { SaleRecord, StoreSettings } from '../types';
import { formatPeso, formatQty } from './posMath';

// Standard BLE GATT service & characteristic UUIDs used by 58mm/80mm ESC/POS thermal printers
const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

export interface BluetoothPrinterSession {
  deviceName: string;
  connected: boolean;
}

type BleDeviceLike = {
  name?: string;
  gatt?: {
    connected: boolean;
    connect: () => Promise<BleServerLike>;
    disconnect: () => void;
  };
};

type BleServerLike = {
  getPrimaryServices: () => Promise<BleServiceLike[]>;
};

type BleServiceLike = {
  getCharacteristics: () => Promise<BleCharacteristicLike[]>;
};

type BleCharacteristicLike = {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValueWithResponse?: (value: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
  writeValue?: (value: BufferSource) => Promise<void>;
};

let activeDevice: BleDeviceLike | null = null;
let activeChar: BleCharacteristicLike | null = null;

export function isWebBluetoothSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as unknown as { bluetooth?: { requestDevice?: unknown } }).bluetooth?.requestDevice === 'function'
  );
}

export function getBluetoothPrinterSession(): BluetoothPrinterSession {
  return {
    deviceName: activeDevice?.name || 'Bluetooth Printer',
    connected: Boolean(activeDevice?.gatt?.connected && activeChar),
  };
}

export async function connectBluetoothPrinter(): Promise<BluetoothPrinterSession> {
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth is not supported in this browser (use Chrome / Edge on Android, Windows, or macOS).');
  }
  const navBt = (navigator as unknown as {
    bluetooth: { requestDevice: (opts: unknown) => Promise<BleDeviceLike> };
  }).bluetooth;

  const device = await navBt.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICE_UUIDS,
  });

  if (!device.gatt) {
    throw new Error('Selected Bluetooth device does not expose GATT printing services.');
  }

  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();

  let chosenChar: BleCharacteristicLike | null = null;
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    for (const ch of chars) {
      if (ch.properties?.writeWithoutResponse || ch.properties?.write) {
        chosenChar = ch;
        break;
      }
    }
    if (chosenChar) break;
  }

  if (!chosenChar) {
    device.gatt.disconnect();
    throw new Error('Connected, but no writable ESC/POS print characteristic was found on this device.');
  }

  activeDevice = device;
  activeChar = chosenChar;
  return getBluetoothPrinterSession();
}

export function disconnectBluetoothPrinter(): void {
  try {
    activeDevice?.gatt?.disconnect();
  } catch {
    // ignore
  }
  activeDevice = null;
  activeChar = null;
}

export async function sendBytesToBluetoothPrinter(bytes: Uint8Array): Promise<void> {
  if (!activeDevice?.gatt?.connected || !activeChar) {
    throw new Error('No Bluetooth thermal printer connected.');
  }
  // Chunk to 180 bytes for broad BLE MTU compatibility across portable 58mm/80mm printers
  const CHUNK = 180;
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const slice = bytes.slice(offset, offset + CHUNK);
    if (activeChar.writeValueWithoutResponse) {
      await activeChar.writeValueWithoutResponse(slice);
    } else if (activeChar.writeValueWithResponse) {
      await activeChar.writeValueWithResponse(slice);
    } else if (activeChar.writeValue) {
      await activeChar.writeValue(slice);
    } else {
      throw new Error('Printer characteristic does not support write operations.');
    }
  }
}

// ============================================================================
// Pure ESC/POS Byte Encoders (Testable without hardware)
// ============================================================================

function asciiLine(text: string): string {
  return String(text || '')
    .replace(/₱/g, 'P')
    .replace(/[^\x20-\x7e]/g, ' ');
}

function padPair(left: string, right: string, cols: number): string {
  const l = asciiLine(left);
  const r = asciiLine(right);
  const spaces = Math.max(1, cols - l.length - r.length);
  return (l + ' '.repeat(spaces) + r).slice(0, cols);
}

function textToBytes(lines: string[]): number[] {
  const out: number[] = [];
  const joined = lines.join('\n') + '\n';
  for (let i = 0; i < joined.length; i++) {
    out.push(joined.charCodeAt(i) & 0x7f);
  }
  return out;
}

export function buildEscPosCashDrawerKick(): Uint8Array {
  // ESC p 0 25 250 — standard RJ11 cash drawer pulse via thermal printer
  return new Uint8Array([0x1b, 0x40, 0x1b, 0x70, 0x00, 0x19, 0xfa]);
}

export function buildEscPosReceiptBytes(
  params: {
    sale?: SaleRecord | null;
    reading?: { title: string; subtitle: string; lines: { label: string; value: string }[] } | null;
    settings: StoreSettings;
    width?: '58mm' | '80mm';
    kickDrawer?: boolean;
  },
): Uint8Array {
  const cols = params.width === '58mm' ? 32 : 48;
  const sep = '-'.repeat(cols);
  const bytes: number[] = [
    0x1b, 0x40, // ESC @ init
    0x1b, 0x61, 0x01, // center align
    0x1b, 0x45, 0x01, // bold on
    ...textToBytes([asciiLine(params.settings.storeName.toUpperCase())]),
    0x1b, 0x45, 0x00, // bold off
    ...textToBytes(
      [
        params.settings.storeTagline ? asciiLine(params.settings.storeTagline) : '',
        asciiLine(params.settings.storeAddress),
        asciiLine(params.settings.storeTin),
        params.settings.storePhone ? `Tel: ${asciiLine(params.settings.storePhone)}` : '',
      ].filter(Boolean),
    ),
    0x1b, 0x61, 0x00, // left align
    ...textToBytes([sep]),
  ];

  if (params.sale) {
    const s = params.sale;
    const body: string[] = [
      padPair('Receipt:', s.receiptNo, cols),
      padPair('Date:', s.dateFormatted, cols),
    ];
    if (s.cashierName) body.push(padPair('Cashier:', s.cashierName, cols));
    if (s.customerName) body.push(padPair('Suki:', s.customerName, cols));
    if (s.voided) body.push(`*** VOIDED (${asciiLine(s.voidReason || 'Cancelled')}) ***`);
    body.push(sep);

    for (const it of s.items) {
      body.push(asciiLine(it.name).slice(0, cols));
      body.push(
        padPair(
          ` ${formatQty(it.qty, it.unit)} x ${formatPeso(it.unitPrice)}`,
          formatPeso(it.lineTotal),
          cols,
        ),
      );
    }
    body.push(sep);
    body.push(padPair('Retail Subtotal', formatPeso(s.retailSubtotal), cols));
    if (s.wholesaleSavings > 0) {
      body.push(padPair('Wholesale Savings', `-${formatPeso(s.wholesaleSavings)}`, cols));
    }
    if (s.seniorDiscount > 0) {
      body.push(padPair('SC/PWD 5% Disc', `-${formatPeso(s.seniorDiscount)}`, cols));
    }
    if (s.pointsDiscount && s.pointsDiscount > 0) {
      body.push(padPair('Suki Points Disc', `-${formatPeso(s.pointsDiscount)}`, cols));
    }
    body.push(padPair('TOTAL DUE', formatPeso(s.grandTotal), cols));
    body.push(padPair(`Paid (${s.paymentMethod})`, formatPeso(s.tendered), cols));
    if (s.change > 0) body.push(padPair('Change', formatPeso(s.change), cols));
    if (s.utangDueDate) body.push(padPair('Utang Due Date', s.utangDueDate, cols));
    if (s.refNo) body.push(padPair('Ref #', s.refNo, cols));
    body.push(sep);

    bytes.push(...textToBytes(body));
    bytes.push(0x1b, 0x61, 0x01); // center
    bytes.push(...textToBytes([asciiLine(params.settings.receiptFooter || 'Thank you!')]));
  } else if (params.reading) {
    const r = params.reading;
    const body: string[] = [asciiLine(r.title), asciiLine(r.subtitle), sep];
    for (const l of r.lines) {
      body.push(padPair(l.label, l.value, cols));
    }
    body.push(sep);
    bytes.push(...textToBytes(body));
  }

  bytes.push(0x1b, 0x64, 0x04); // feed 4 lines
  bytes.push(0x1d, 0x56, 0x42, 0x00); // GS V B 0 partial cut
  if (params.kickDrawer) {
    bytes.push(0x1b, 0x70, 0x00, 0x19, 0xfa);
  }
  return new Uint8Array(bytes);
}

export function buildEscPosTestSlip(settings: StoreSettings, width: '58mm' | '80mm' = '80mm'): Uint8Array {
  return buildEscPosReceiptBytes({
    settings,
    width,
    reading: {
      title: 'ESC/POS BLUETOOTH TEST',
      subtitle: `${width} Thermal Printer Ready`,
      lines: [
        { label: 'Store', value: settings.storeName },
        { label: 'Paper Width', value: width },
        { label: 'Currency', value: 'PHP (P)' },
        { label: 'Status', value: 'OK' },
      ],
    },
  });
}
