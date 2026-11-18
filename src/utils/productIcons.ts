import {
  Apple,
  BatteryCharging,
  Beef,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Droplets,
  Drumstick,
  Egg,
  Fish,
  Flame,
  GlassWater,
  Milk,
  Package,
  Pill,
  Soup,
  SprayCan,
  Tag,
  Wheat,
  type LucideIcon,
} from 'lucide-react';

export type ProductIconId =
  | 'beef'
  | 'drumstick'
  | 'fish'
  | 'wheat'
  | 'coffee'
  | 'cup-soda'
  | 'glass-water'
  | 'milk'
  | 'croissant'
  | 'soup'
  | 'cookie'
  | 'egg'
  | 'apple'
  | 'droplets'
  | 'spray-can'
  | 'pill'
  | 'flame'
  | 'battery'
  | 'package'
  | 'tag';

export type ProductTintId =
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'indigo'
  | 'orange'
  | 'teal'
  | 'slate';

export interface ProductIconMeta {
  id: ProductIconId;
  label: string;
  icon: LucideIcon;
  defaultTint: ProductTintId;
}

export const PRODUCT_ICON_REGISTRY: Record<ProductIconId, ProductIconMeta> = {
  beef: { id: 'beef', label: 'Meat', icon: Beef, defaultTint: 'rose' },
  drumstick: { id: 'drumstick', label: 'Poultry', icon: Drumstick, defaultTint: 'orange' },
  fish: { id: 'fish', label: 'Seafood', icon: Fish, defaultTint: 'sky' },
  wheat: { id: 'wheat', label: 'Rice / Grain', icon: Wheat, defaultTint: 'amber' },
  coffee: { id: 'coffee', label: 'Coffee / Malt', icon: Coffee, defaultTint: 'amber' },
  'cup-soda': { id: 'cup-soda', label: 'Softdrink', icon: CupSoda, defaultTint: 'rose' },
  'glass-water': { id: 'glass-water', label: 'Water', icon: GlassWater, defaultTint: 'sky' },
  milk: { id: 'milk', label: 'Dairy / Milk', icon: Milk, defaultTint: 'sky' },
  croissant: { id: 'croissant', label: 'Bakery / Bread', icon: Croissant, defaultTint: 'amber' },
  soup: { id: 'soup', label: 'Noodles', icon: Soup, defaultTint: 'orange' },
  cookie: { id: 'cookie', label: 'Snacks', icon: Cookie, defaultTint: 'indigo' },
  egg: { id: 'egg', label: 'Eggs', icon: Egg, defaultTint: 'amber' },
  apple: { id: 'apple', label: 'Fresh Produce', icon: Apple, defaultTint: 'emerald' },
  droplets: { id: 'droplets', label: 'Oil / Sauce', icon: Droplets, defaultTint: 'amber' },
  'spray-can': { id: 'spray-can', label: 'Care / Clean', icon: SprayCan, defaultTint: 'teal' },
  pill: { id: 'pill', label: 'Health / Meds', icon: Pill, defaultTint: 'emerald' },
  flame: { id: 'flame', label: 'Gas / Utility', icon: Flame, defaultTint: 'orange' },
  battery: { id: 'battery', label: 'Load / Battery', icon: BatteryCharging, defaultTint: 'indigo' },
  package: { id: 'package', label: 'Canned / Pack', icon: Package, defaultTint: 'slate' },
  tag: { id: 'tag', label: 'General', icon: Tag, defaultTint: 'slate' },
};

export const PRODUCT_ICON_OPTIONS: ProductIconMeta[] = Object.values(PRODUCT_ICON_REGISTRY);

export interface ProductTintStyle {
  id: ProductTintId;
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  swatchClass: string;
}

export const PRODUCT_TINT_STYLES: Record<ProductTintId, ProductTintStyle> = {
  emerald: {
    id: 'emerald',
    label: 'Emerald',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200/80',
    swatchClass: 'bg-emerald-500',
  },
  amber: {
    id: 'amber',
    label: 'Amber',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-200/80',
    swatchClass: 'bg-amber-500',
  },
  rose: {
    id: 'rose',
    label: 'Rose',
    bgClass: 'bg-rose-50',
    textClass: 'text-rose-700',
    borderClass: 'border-rose-200/80',
    swatchClass: 'bg-rose-500',
  },
  sky: {
    id: 'sky',
    label: 'Sky',
    bgClass: 'bg-sky-50',
    textClass: 'text-sky-700',
    borderClass: 'border-sky-200/80',
    swatchClass: 'bg-sky-500',
  },
  indigo: {
    id: 'indigo',
    label: 'Indigo',
    bgClass: 'bg-indigo-50',
    textClass: 'text-indigo-700',
    borderClass: 'border-indigo-200/80',
    swatchClass: 'bg-indigo-500',
  },
  orange: {
    id: 'orange',
    label: 'Orange',
    bgClass: 'bg-orange-50',
    textClass: 'text-orange-700',
    borderClass: 'border-orange-200/80',
    swatchClass: 'bg-orange-500',
  },
  teal: {
    id: 'teal',
    label: 'Teal',
    bgClass: 'bg-teal-50',
    textClass: 'text-teal-700',
    borderClass: 'border-teal-200/80',
    swatchClass: 'bg-teal-500',
  },
  slate: {
    id: 'slate',
    label: 'Slate',
    bgClass: 'bg-slate-100',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-200/90',
    swatchClass: 'bg-slate-600',
  },
};

export const PRODUCT_TINT_OPTIONS: ProductTintStyle[] = [
  PRODUCT_TINT_STYLES.emerald,
  PRODUCT_TINT_STYLES.amber,
  PRODUCT_TINT_STYLES.rose,
  PRODUCT_TINT_STYLES.sky,
  PRODUCT_TINT_STYLES.indigo,
  PRODUCT_TINT_STYLES.orange,
  PRODUCT_TINT_STYLES.teal,
  PRODUCT_TINT_STYLES.slate,
];

const NAME_ICON_RULES: [RegExp, ProductIconId][] = [
  [/\b(tuna|sardines?|bangus|tilapia|galunggong|salmon|fish|seafood|shrimp|squid|pusit|hipon)\b/i, 'fish'],
  [/\b(chicken|manok|duck|turkey|wings|drumstick)\b/i, 'drumstick'],
  [/\b(pork|baboy|beef|baka|hotdog|cheesedog|tocino|longganisa|corned|luncheon|ham|bacon|sausage|meat|kasim|liempo|sisig)\b/i, 'beef'],
  [/\b(egg|itlog)\b/i, 'egg'],
  [/\b(rice|bigas|sinandomeng|jasmin|dinorado|flour|harina|oats?|oatmeal|cereal|cornstarch|grain)\b/i, 'wheat'],
  [/\b(coffee|kape|nescafe|kopiko|great taste|milo|energen|cocoa|choco|tea|tsaa|espresso)\b/i, 'coffee'],
  [/\b(water|mineral|wilkins|summit|absolute|nature'?s spring|distilled)\b/i, 'glass-water'],
  [/\b(cola|coke|sprite|pepsi|royal|soda|softdrink|juice|zest|tang|iced tea|gatorade|cobra|beer|wine|gin)\b/i, 'cup-soda'],
  [/\b(milk|gatas|bear brand|alaska|birch tree|evap|condensed|cheese|queso|butter|cream|yogurt)\b/i, 'milk'],
  [/\b(bread|pandesal|gardenia|loaf|bun|cake|mamon|croissant|ensaymada|pastry|pie)\b/i, 'croissant'],
  [/\b(noodle|noodles|canton|pancit|ramen|cup noodles|pasta|spaghetti|macaroni|bihon|sotanghon|mami)\b/i, 'soup'],
  [/\b(chips|crisps|piattos|nova|vcut|chippy|cracker|skyflakes|fita|biscuit|cookie|candy|chocolate|wafer|snack)\b/i, 'cookie'],
  [/\b(apple|banana|saging|mango|orange|fruit|vegetable|gulay|onion|sibuyas|garlic|bawang|tomato|potato|kamote|calamansi)\b/i, 'apple'],
  [/\b(oil|cooking oil|soy sauce|toyo|vinegar|suka|patis|sauce|ketchup|mayo|condiment|magic sarap|seasoning)\b/i, 'droplets'],
  [/\b(soap|sabon|safeguard|detergent|surf|ariel|tide|shampoo|palmolive|sunsilk|toothpaste|colgate|tissue|alcohol|bleach|fabcon|downy|lotion|deodorant)\b/i, 'spray-can'],
  [/\b(medicine|vitamin|paracetamol|biogesic|neozep|medicol|pill|capsule|bandage|first aid|tablet)\b/i, 'pill'],
  [/\b(lpg|gasul|lighter|candle|kandila|match|posporo|charcoal|uling)\b/i, 'flame'],
  [/\b(battery|batteries|energizer|eveready|load|prepaid|sim|cable|charger)\b/i, 'battery'],
];

export function autoDetectProductIconId(name = '', category = ''): ProductIconId {
  for (const [pattern, iconId] of NAME_ICON_RULES) {
    if (pattern.test(name)) return iconId;
  }

  if (/frozen|meat|pork|chicken|beef/i.test(category)) return 'beef';
  if (/seafood|fish/i.test(category)) return 'fish';
  if (/rice|staple|grain/i.test(category)) return 'wheat';
  if (/noodle|pasta/i.test(category)) return 'soup';
  if (/canned|pantry/i.test(category)) return 'package';
  if (/coffee|tea/i.test(category)) return 'coffee';
  if (/beverage|drink|soda/i.test(category)) return 'cup-soda';
  if (/dairy|milk/i.test(category)) return 'milk';
  if (/bakery|bread/i.test(category)) return 'croissant';
  if (/condiment|cook|sauce|oil/i.test(category)) return 'droplets';
  if (/snack|biscuit|candy/i.test(category)) return 'cookie';
  if (/produce|fruit|veg/i.test(category)) return 'apple';
  if (/personal|home|clean|soap|hygiene/i.test(category)) return 'spray-can';
  if (/health|med|pharma/i.test(category)) return 'pill';

  return 'package';
}

export interface ResolvedProductIcon {
  iconId: ProductIconId;
  tintId: ProductTintId;
  meta: ProductIconMeta;
  tint: ProductTintStyle;
  isCustomIcon: boolean;
  isCustomTint: boolean;
}

export function resolveProductIcon(product: {
  name?: string;
  category?: string;
  icon?: string;
  iconColor?: string;
}): ResolvedProductIcon {
  const autoIcon = autoDetectProductIconId(product.name || '', product.category || '');
  const requestedIcon = product.icon && product.icon !== 'auto' ? product.icon : undefined;
  const isCustomIcon = Boolean(requestedIcon && requestedIcon in PRODUCT_ICON_REGISTRY);
  const iconId: ProductIconId = isCustomIcon ? (requestedIcon as ProductIconId) : autoIcon;
  const meta = PRODUCT_ICON_REGISTRY[iconId] || PRODUCT_ICON_REGISTRY.package;

  const requestedTint = product.iconColor && product.iconColor !== 'auto' ? product.iconColor : undefined;
  const isCustomTint = Boolean(requestedTint && requestedTint in PRODUCT_TINT_STYLES);
  const tintId: ProductTintId = isCustomTint ? (requestedTint as ProductTintId) : meta.defaultTint;
  const tint = PRODUCT_TINT_STYLES[tintId] || PRODUCT_TINT_STYLES.slate;

  return {
    iconId,
    tintId,
    meta,
    tint,
    isCustomIcon,
    isCustomTint,
  };
}
