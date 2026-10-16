import React from 'react';

/**
 * Base skeleton shimmer box with customizable classes
 */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-shimmer rounded-lg ${className}`} />
);

/**
 * Skeleton placeholder for TransactionCard on History page
 */
export const TransactionCardSkeleton: React.FC = () => (
  <div className="obsidian-card rounded-2xl p-5 border border-outline-variant/60 relative overflow-hidden select-none">
    <div className="flex justify-between items-center mb-4 gap-3">
      <div className="flex items-center gap-3.5 min-w-0">
        <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
        <div className="flex flex-col gap-2 min-w-0">
          <Skeleton className="h-4 w-28 sm:w-36 rounded-md" />
          <Skeleton className="h-3 w-16 sm:w-20 rounded-md opacity-60" />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <Skeleton className="h-5 w-20 sm:w-24 rounded-md" />
        <Skeleton className="h-3 w-12 rounded-md opacity-50" />
      </div>
    </div>

    <div className="divider-dashed my-3 opacity-30"></div>

    <div className="flex justify-between items-center pt-0.5">
      <div className="flex items-center gap-1.5">
        <Skeleton className="w-4 h-4 rounded-full" />
        <Skeleton className="h-3 w-16 rounded-md" />
      </div>
      <Skeleton className="h-3 w-20 rounded-md opacity-60" />
    </div>
  </div>
);

/**
 * Skeleton placeholder for RecentTransactions list on Home page
 */
export const RecentTransactionsSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="relative z-10 divide-y divide-[rgba(247,244,235,0.03)] select-none">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex items-center gap-3.5 py-3.5">
        <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <Skeleton className="h-4 w-28 sm:w-36 rounded-md" />
          <Skeleton className="h-3 w-16 sm:w-20 rounded-md opacity-60" />
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <Skeleton className="h-4 w-16 sm:w-20 rounded-md" />
        </div>
      </div>
    ))}
  </div>
);

/**
 * Skeleton placeholder for WalletBalanceCard on Home page
 */
export const WalletBalanceSkeleton: React.FC = () => (
  <div className="relative p-5 sm:p-6 md:p-8 flex flex-col items-center justify-center min-h-[150px] sm:min-h-[160px] md:min-h-[190px] z-10 bg-[#0c1b14] rounded-[24px] sm:rounded-[28px] border border-[#142d20] shadow-[0_8px_32px_rgba(0,0,0,0.5)] select-none">
    {/* Mint pill badge */}
    <Skeleton className="h-7 w-32 sm:w-36 rounded-full mb-3.5 sm:mb-4 opacity-80" />
    
    {/* Big balance placeholder */}
    <div className="flex items-center justify-center my-1 sm:my-2">
      <Skeleton className="h-10 sm:h-12 md:h-14 w-44 sm:w-56 md:w-64 rounded-2xl" />
    </div>
    
    {/* Fiat subtitle */}
    <Skeleton className="h-3.5 sm:h-4 w-20 sm:w-24 rounded-md mt-1.5 opacity-60" />
  </div>
);

/**
 * Skeleton placeholder for LightningAddressCard on Home page
 */
export const LightningAddressSkeleton: React.FC = () => (
  <div className="bg-[#0c1b14] border border-[#142d20] rounded-2xl p-3.5 sm:p-4 shadow-sm select-none">
    <div className="flex items-center justify-between gap-2.5 sm:gap-3">
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
        <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex-shrink-0" />
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <Skeleton className="h-2.5 w-24 rounded-sm opacity-60" />
          <Skeleton className="h-4 w-36 sm:w-44 rounded-md" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Skeleton className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl" />
        <Skeleton className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl" />
      </div>
    </div>
  </div>
);
