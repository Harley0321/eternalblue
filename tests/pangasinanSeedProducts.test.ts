import assert from 'node:assert/strict';
import test from 'node:test';
import { createPangasinanSeedProducts } from '../src/data/pangasinanSeedProducts';
import { PosRepository } from '../src/data/posRepository';
import { PosMath } from '../src/domain/posMath';

function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(code[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const expected = (10 - (sum % 10)) % 10;
  return Number(code[12]) === expected;
}

test('createPangasinanSeedProducts returns 50 unique, valid Pangasinan PH products', () => {
  const products = createPangasinanSeedProducts('2026-11-25T00:00:00.000Z');
  assert.equal(products.length, 50);

  const ids = new Set(products.map((p) => p.id));
  const names = new Set(products.map((p) => p.name.toLowerCase()));
  const barcodes = new Set(products.map((p) => p.barcode));
  assert.equal(ids.size, 50);
  assert.equal(names.size, 50);
  assert.equal(barcodes.size, 50);

  for (const p of products) {
    assert.ok(isValidEan13(p.barcode), `Invalid EAN-13 for ${p.name}: ${p.barcode}`);
    assert.ok(p.barcode.startsWith('480'), `Expected PH GS1 480 prefix for ${p.name}`);
    assert.ok((p.capital ?? 0) > 0, `Missing capital for ${p.name}`);
    assert.ok(p.retailPrice > (p.capital ?? 0), `Retail must exceed capital for ${p.name}`);
    assert.ok(p.wholesalePrice >= (p.capital ?? 0), `Wholesale below capital for ${p.name}`);
    assert.ok(p.wholesalePrice <= p.retailPrice, `Wholesale exceeds retail for ${p.name}`);
    assert.ok(p.wholesaleMinQty >= 1, `Invalid wholesale min qty for ${p.name}`);
    assert.ok(p.stock > 0, `Stock must be positive for ${p.name}`);
  }

  const categories = new Set(products.map((p) => p.category));
  for (const cat of PosMath.BASE_CATEGORIES) {
    assert.ok(categories.has(cat), `Missing category ${cat}`);
  }

  const allNames = products.map((p) => p.name).join(' | ');
  for (const keyword of [
    'Dagupan Boneless Bangus',
    'Alaminos Longganisa',
    'Pangasinan Sinandomeng Rice',
    'Pangasinan Bagoong Isda',
    'Calasiao Puto',
    'Pangasinan Grilled Tupig',
    'Lingayen Sweet Bocayo',
  ]) {
    assert.ok(allNames.includes(keyword), `Expected Pangasinan specialty: ${keyword}`);
  }
});

test('PosRepository.loadProducts seeds 50 products on fresh storage and preserves explicit empty reset', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const map = new Map<string, string>();
  const memoryStorage = {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    configurable: true,
    writable: true,
  });

  try {
    const seeded = PosRepository.loadProducts();
    assert.equal(seeded.length, 50);
    assert.ok(memoryStorage.getItem('ebpos_v1:products'));

    PosRepository.resetAll();
    PosRepository.saveProducts([]);
    const afterReset = PosRepository.loadProducts();
    assert.equal(afterReset.length, 0);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }
});
