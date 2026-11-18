import React from 'react';
import { resolveProductIcon } from '../utils/productIcons';

export interface ProductIconBadgeProps {
  product: {
    name?: string;
    category?: string;
    icon?: string;
    iconColor?: string;
  };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  muted?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<'xs' | 'sm' | 'md' | 'lg', { box: string; icon: string }> = {
  xs: { box: 'w-7 h-7 rounded-lg', icon: 'w-3.5 h-3.5' },
  sm: { box: 'w-8 h-8 rounded-xl', icon: 'w-4 h-4' },
  md: { box: 'w-9 h-9 rounded-xl', icon: 'w-4.5 h-4.5' },
  lg: { box: 'w-11 h-11 rounded-2xl', icon: 'w-5 h-5' },
};

export const ProductIconBadge: React.FC<ProductIconBadgeProps> = ({
  product,
  size = 'sm',
  muted = false,
  className = '',
}) => {
  const { meta, tint } = resolveProductIcon(product);
  const Icon = meta.icon;
  const dims = SIZE_CLASSES[size];

  return (
    <span
      aria-hidden="true"
      data-product-icon={meta.id}
      className={`${dims.box} ${
        muted ? 'bg-slate-100 text-slate-400 border-slate-200' : `${tint.bgClass} ${tint.textClass} ${tint.borderClass}`
      } border inline-flex items-center justify-center shrink-0 transition-colors ${className}`}
    >
      <Icon className={`${dims.icon} stroke-[2.25]`} />
    </span>
  );
};
