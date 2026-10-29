import React from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { LnurlValidationResult } from '../../hooks/useLnurlValidation';

interface LnurlValidationStatusProps {
  input: string;
  validation: LnurlValidationResult;
}

/** Inline status pill showing live Lightning Address / LNURL validation. */
export const LnurlValidationStatus: React.FC<LnurlValidationStatusProps> = ({ input, validation }) => {
  if (validation.status === 'idle') return null;

  if (validation.status === 'checking') {
    return (
      <div className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg bg-surface-container-highest border border-outline-variant/20 text-on-surface-variant animate-fade-in">
        <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
        <span className="truncate">Checking {input}…</span>
      </div>
    );
  }

  if (validation.status === 'invalid') {
    return (
      <div className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error animate-fade-in">
        <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="break-words">{validation.error}</span>
      </div>
    );
  }

  const params = validation.params;
  const minSats = params ? Math.ceil(params.minSendable / 1000) : null;
  const maxSats = params ? Math.floor(params.maxSendable / 1000) : null;

  return (
    <div className="flex items-center justify-between gap-2 text-[12px] px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 animate-fade-in">
      <div className="flex items-center gap-2 min-w-0">
        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">
          Valid{validation.domain ? ` · ${validation.domain}` : ''}
        </span>
      </div>
      {minSats !== null && maxSats !== null && (
        <span className="font-mono text-emerald-400/80 flex-shrink-0">
          {minSats.toLocaleString()}–{maxSats.toLocaleString()} sats
        </span>
      )}
    </div>
  );
};
