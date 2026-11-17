import {
  Beef,
  Cookie,
  CupSoda,
  Droplets,
  LayoutGrid,
  Milk,
  Package,
  Sparkles,
  Tag,
  Wheat,
  type LucideIcon,
} from 'lucide-react';

export function getCategoryIcon(category: string): LucideIcon {
  if (category === 'All') return LayoutGrid;
  if (/frozen|meat|pork|chicken|beef/i.test(category)) return Beef;
  if (/rice|staple|grain/i.test(category)) return Wheat;
  if (/canned|noodle|pantry/i.test(category)) return Package;
  if (/beverage|drink|soda|coffee/i.test(category)) return CupSoda;
  if (/dairy|bakery|bread|milk/i.test(category)) return Milk;
  if (/condiment|cook|sauce|oil/i.test(category)) return Droplets;
  if (/snack|biscuit|candy/i.test(category)) return Cookie;
  if (/personal|home|clean|soap/i.test(category)) return Sparkles;
  return Tag;
}
