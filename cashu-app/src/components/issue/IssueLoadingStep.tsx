import React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface IssueLoadingStepProps {
  debugLogs: string[];
  error: string;
  onBack?: () => void;
}

export const IssueLoadingStep: React.FC<IssueLoadingStepProps> = ({ debugLogs, error, onBack }) => {
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
            {error ? 'Processing Failed' : 'Preparing Note'}
          </h2>
          <p className="text-body-md font-body-md text-on-surface-variant">
            {error ? 'There was an issue communicating with the mints.' : 'Communicating with mints to set up your physical note...'}
          </p>
        </div>

        {error ? (
          <div className="relative z-10 text-error text-sm text-center bg-error/10 p-4 rounded-xl border border-error/20 w-full mt-2 font-medium">
            {error}
          </div>
        ) : (
          <div className="relative z-10 bg-surface-container-lowest p-4 rounded-xl text-[11px] font-mono text-on-surface-variant w-full max-h-48 min-h-32 overflow-y-auto border border-outline-variant/30 shadow-inner flex flex-col gap-1">
            {debugLogs.length === 0 ? (
              <div className="opacity-50 flex items-center justify-center h-full">Initializing connection...</div>
            ) : (
              debugLogs.map((l, i) => (
                <div key={i} className="animate-fade-in break-words">
                  <span className="text-primary/50 mr-2">▶</span>{l}
                </div>
              ))
            )}
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
