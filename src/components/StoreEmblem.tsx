import React from 'react';
import { resolveStoreIconOption } from '../utils/storeBrand';

interface StoreEmblemProps {
  storeName: string;
  storeIcon?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const EMBLEM_SIZES = {
  sm: { box: 'w-7 h-7 sm:w-8 sm:h-8 rounded-xl', icon: 'w-3.5 h-3.5 sm:w-4 sm:h-4' },
  md: { box: 'w-9 h-9 rounded-xl', icon: 'w-4.5 h-4.5' },
  lg: { box: 'w-11 h-11 rounded-2xl', icon: 'w-5 h-5' },
} as const;

export const StoreEmblem: React.FC<StoreEmblemProps> = ({
  storeName,
  storeIcon,
  size = 'sm',
  className = '',
}) => {
  const option = resolveStoreIconOption(storeIcon);
  const Icon = option.icon;
  const dims = EMBLEM_SIZES[size];

  return (
    <span
      aria-hidden="true"
      data-store-icon={option.id}
      title={storeName}
      className={`${dims.box} bg-gradient-to-br from-emerald-300 via-emerald-400 to-emerald-600 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.45)] ring-1 ring-emerald-200/60 inline-flex items-center justify-center shrink-0 ${className}`}
    >
      <Icon className={`${dims.icon} stroke-[2.4]`} />
    </span>
  );
};
