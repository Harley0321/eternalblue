import type { Product } from '../types/pos';
import { PosMath } from './posMath';

export function normalizeCategoryName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function findMatchingCategory(candidate: string, existing: readonly string[]): string | null {
  const clean = normalizeCategoryName(candidate).toLowerCase();
  if (!clean) return null;
  for (const item of existing) {
    if (normalizeCategoryName(item).toLowerCase() === clean) {
      return item;
    }
  }
  return null;
}

export function mergeProductCategories(
  customCategories: readonly string[],
  products: readonly Pick<Product, 'category'>[],
  baseCategories: readonly string[] = PosMath.BASE_CATEGORIES
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (raw: string) => {
    const clean = normalizeCategoryName(raw);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(clean);
  };

  for (const base of baseCategories) {
    pushUnique(base);
  }

  const extras: string[] = [];
  for (const cat of customCategories) {
    const clean = normalizeCategoryName(cat);
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      extras.push(clean);
    }
  }
  for (const p of products) {
    const clean = normalizeCategoryName(p.category);
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      extras.push(clean);
    }
  }

  extras.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return [...result, ...extras];
}

export interface RegisterCategoryResult {
  ok: boolean;
  category: string;
  added: boolean;
  nextCustom: string[];
  error?: string;
}

export function registerCustomCategory(
  rawName: string,
  customCategories: readonly string[],
  products: readonly Pick<Product, 'category'>[] = [],
  baseCategories: readonly string[] = PosMath.BASE_CATEGORIES
): RegisterCategoryResult {
  const clean = normalizeCategoryName(rawName);
  if (!clean) {
    return {
      ok: false,
      category: '',
      added: false,
      nextCustom: [...customCategories],
      error: 'Enter a category name',
    };
  }

  const allExisting = mergeProductCategories(customCategories, products, baseCategories);
  const existingMatch = findMatchingCategory(clean, allExisting);
  if (existingMatch) {
    return {
      ok: true,
      category: existingMatch,
      added: false,
      nextCustom: [...customCategories],
    };
  }

  return {
    ok: true,
    category: clean,
    added: true,
    nextCustom: [...customCategories, clean],
  };
}
