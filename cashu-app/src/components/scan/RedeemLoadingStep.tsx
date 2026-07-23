import React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface RedeemLoadingStepProps {
  error: string | null;
  onBack?: () => void;
}

export const RedeemLoadingStep: React.FC<RedeemLoadingStepProps> = ({ error, onBack }) => {
  return (
    <main className="flex-grow w-full max-w-[480px] md:max-w-[600px] mx-auto px-container-padding py-6 flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm bg-surface-container-high p-8 rounded-3xl border border-outline-variant/20 shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 texture-overlay opacity-30 pointer-events-none"></div>
        
        {error ? (
          <div className="w-20 h-20 rounded-full bg-error/10 border border-error/20 flex items-center justify-center relative z-10">
            <AlertCircle className="w-10 h-10 text-error" />
          </div>
        ) : (
          <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center relative z-10">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
        )}

        <div className="relative z-10 flex flex-col items-center gap-2 text-center">
          <h2 className="text-headline-sm font-headline-sm text-on-surface">
            {error ? 'Redemption Failed' : 'Processing Redemption'}
          </h2>
          <p className="text-body-md font-body-md text-on-surface-variant">
            {error ? 'There was an issue processing your redemption request.' : 'Communicating with mints to redeem your funds...'}
          </p>
        </div>

        {error && (
          <div className="relative z-10 text-error text-sm text-center bg-error/10 p-4 rounded-xl border border-error/20 w-full mt-2 font-medium">
            {error}
          </div>
        )}

        {error && onBack && (
          <button
            onClick={onBack}
            className="relative z-10 mt-4 w-full py-3.5 rounded-full bg-surface-container-highest text-on-surface font-bold text-[15px] hover:bg-surface-bright transition-colors border border-outline-variant/20"
          >
            Go Back
          </button>
        )}
      </div>
    </main>
  );
};
