import assert from 'node:assert/strict';
import test from 'node:test';
import { findDuplicateBarcodeProduct } from '../src/domain/barcodeLookup';
import type { Product } from '../src/types/pos';

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 'p-1',
    barcode: '4809010001016',
    name: 'Dagupan Boneless Bangus',
    category: 'Frozen Meat',
    unit: 'pack',
    capital: 135,
    retailPrice: 165,
    wholesalePrice: 155,
    wholesaleMinQty: 5,
    stock: 10,
  },
  {
    id: 'p-2',
    barcode: '4809010002013',
    name: 'Pangasinan Sinandomeng Rice',
    category: 'Rice & Staples',
    unit: 'pack',
    capital: 235,
    retailPrice: 275,
    wholesalePrice: 260,
    wholesaleMinQty: 4,
    stock: 20,
  },
];

test('findDuplicateBarcodeProduct detects matching barcodes and ignores current product when editing', () => {
  const dup = findDuplicateBarcodeProduct(SAMPLE_PRODUCTS, ' 4809010001016 ');
  assert.equal(dup?.id, 'p-1');

  const selfEdit = findDuplicateBarcodeProduct(SAMPLE_PRODUCTS, '4809010001016', 'p-1');
  assert.equal(selfEdit, null);

  const unique = findDuplicateBarcodeProduct(SAMPLE_PRODUCTS, '4809010009999');
  assert.equal(unique, null);

  const blank = findDuplicateBarcodeProduct(SAMPLE_PRODUCTS, '   ');
  assert.equal(blank, null);
});
