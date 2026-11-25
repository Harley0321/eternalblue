import assert from 'node:assert/strict';
import test from 'node:test';
import { PosRepository } from '../src/data/posRepository';
import { PosMath } from '../src/domain/posMath';
import {
  mergeProductCategories,
  normalizeCategoryName,
  registerCustomCategory,
} from '../src/domain/productCategories';

test('normalizeCategoryName trims and collapses extra whitespace', () => {
  assert.equal(normalizeCategoryName('  Hardware   &   Tools  '), 'Hardware & Tools');
  assert.equal(normalizeCategoryName('   '), '');
});

test('mergeProductCategories combines base, saved custom, and product categories without duplicates', () => {
  const merged = mergeProductCategories(
    ['Hardware & Tools', 'beverages', 'School Supplies'],
    [{ category: 'Pet Care' }, { category: 'Hardware & Tools' }]
  );

  assert.deepEqual(merged.slice(0, PosMath.BASE_CATEGORIES.length), PosMath.BASE_CATEGORIES);
  assert.deepEqual(merged.slice(PosMath.BASE_CATEGORIES.length), [
    'Hardware & Tools',
    'Pet Care',
    'School Supplies',
  ]);
});

test('registerCustomCategory validates blanks, avoids case-insensitive duplicates, and appends new categories', () => {
  const blank = registerCustomCategory('   ', []);
  assert.equal(blank.ok, false);
  assert.ok(blank.error);

  const existingBase = registerCustomCategory('  FROZEN MEAT ', []);
  assert.equal(existingBase.ok, true);
  assert.equal(existingBase.added, false);
  assert.equal(existingBase.category, 'Frozen Meat');
  assert.deepEqual(existingBase.nextCustom, []);

  const created = registerCustomCategory('  Auto   Parts ', ['Pet Care']);
  assert.equal(created.ok, true);
  assert.equal(created.added, true);
  assert.equal(created.category, 'Auto Parts');
  assert.deepEqual(created.nextCustom, ['Pet Care', 'Auto Parts']);

  const duplicateCustom = registerCustomCategory('auto parts', created.nextCustom);
  assert.equal(duplicateCustom.ok, true);
  assert.equal(duplicateCustom.added, false);
  assert.equal(duplicateCustom.category, 'Auto Parts');
});

test('PosRepository persists and resets custom categories', () => {
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
    assert.deepEqual(PosRepository.loadCustomCategories(), []);
    PosRepository.saveCustomCategories(['Hardware & Tools', 'Pet Care']);
    assert.deepEqual(PosRepository.loadCustomCategories(), ['Hardware & Tools', 'Pet Care']);
    PosRepository.resetAll();
    assert.deepEqual(PosRepository.loadCustomCategories(), []);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }
});
