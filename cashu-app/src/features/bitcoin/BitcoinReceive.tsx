import { Bitcoin, Check, Copy, Loader2, Zap } from 'lucide-react';
import { SafeQRCode } from '../../components/shared/SafeQRCode';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { MintIcon } from '../../components/shared/MintIcon';
import { MintName } from '../../components/shared/MintName';
import { NumberPad } from '../../components/shared/NumberPad';
import { SlidingSegmentedControl } from '../../components/shared/SlidingSegmentedControl';

export type BitcoinReceiveMode = 'lightning' | 'onchain';

export interface BitcoinReceiveProps {
  success: boolean;
  invoice: string | null;
  address: string | null;
  mode: BitcoinReceiveMode;
  amount: string;
  amountSats: number;
  mintUrl: string;
  depositSats: number | null;
  feeEstimateSats: number | null;
  copied: boolean;
  copiedType: string | null;
  requesting: boolean;
  requestDisabled: boolean;
  minOnchainSats: number;
  maxOnchainSats: number;
  onDone: () => void;
  onCopy: (text: string, type?: string) => void;
  onInvoiceBack: () => void;
  onAddressBack: () => void;
  onTrackAddress: (address: string) => void;
  onModeChange: (mode: BitcoinReceiveMode) => void;
  onAmountChange: (amount: string) => void;
  onRequest: () => void;
}

export function BitcoinReceive({
  success, invoice, address, mode, amount, amountSats, mintUrl,
  depositSats, feeEstimateSats, copied, copiedType, requesting, requestDisabled,
  minOnchainSats, maxOnchainSats, onDone, onCopy, onInvoiceBack, onAddressBack,
  onTrackAddress, onModeChange, onAmountChange, onRequest,
}: BitcoinReceiveProps) {
  if (success) return (
    <div className="flex flex-col items-center gap-5">
      <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
        <Check size={32} className="text-emerald-400" />
      </div>
      <div className="text-center">
        <p className="text-label-caps font-label-caps text-on-surface-variant mb-1">RECEIVED</p>
        <p className="text-[28px] font-display-lg text-emerald-400">₿{amountSats.toLocaleString()}</p>
      </div>
      <button
        onClick={onDone}
        className="w-full py-3.5 sm:py-4 rounded-2xl bg-primary/15 text-primary font-bold text-[15px] hover:bg-primary/25 transition-colors border border-primary/20 cursor-pointer"
      >
        Done
      </button>
    </div>
  );

  if (invoice) return (
    /* Show invoice QR */
    <div className="flex flex-col items-center gap-5">
      <div className="relative">
        <div className="bg-white p-4 rounded-xl shadow-lg">
          <SafeQRCode value={invoice} size={200} fallbackText="Use the Copy Invoice button below" />
        </div>
        <div className="absolute inset-0 bg-primary/20 rounded-xl blur-xl -z-10 animate-pulse"></div>
      </div>

      <div className="w-full flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0"><MintIcon mintUrl={mintUrl} className="w-6 h-6 shrink-0 rounded-full" textClassName="text-primary text-[10px]" /><MintName mintUrl={mintUrl} className="text-sm text-on-surface truncate" /></div>
        <p className="text-xl text-primary shrink-0">₿{amountSats.toLocaleString()}</p>
      </div>
      <div className="w-full flex flex-col gap-2">
        <div
          onClick={() => onCopy(invoice)}
          className="w-full bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 shadow-inner cursor-pointer hover:border-primary/30 transition-colors"
        >
          <p className="text-[11px] font-mono text-on-surface-variant break-all line-clamp-3 select-all">{invoice}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onCopy(invoice)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary/15 text-primary font-bold text-[15px] hover:bg-primary/25 transition-colors border border-primary/20 cursor-pointer"
          >
            {copied ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> Copy Invoice</>}
          </button>
          <button
            onClick={onInvoiceBack}
            className="px-6 py-3 rounded-2xl bg-surface-container-highest text-on-surface-variant font-bold text-[15px] hover:bg-surface-bright transition-colors border border-outline-variant/20 cursor-pointer"
          >
            Back
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-on-surface-variant text-[13px]">
        <Loader2 className="animate-spin w-4 h-4" />
        <span>Waiting for payment...</span>
      </div>
    </div>
  );

  if (address) return (
    /* Show ASP Boarding QR */
    <div className="flex flex-col items-center gap-5">
      <div className="relative">
        <div className="bg-white p-4 rounded-xl shadow-lg">
          <SafeQRCode
            value={
              depositSats
                ? `bitcoin:${address}?amount=${(depositSats / 100_000_000).toFixed(8)}`
                : `bitcoin:${address}`
            }
            size={200}
            fallbackText="Use the Copy URI button below"
          />
        </div>
      </div>

      <div className="w-full flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0"><MintIcon mintUrl={mintUrl} className="w-6 h-6 shrink-0 rounded-full" textClassName="text-primary text-[10px]" /><MintName mintUrl={mintUrl} className="text-sm text-on-surface truncate" /></div>
        <p className="text-sm text-on-surface-variant shrink-0">Receive ₿{amountSats.toLocaleString()}</p>
      </div>

      <dl className="w-full text-sm text-on-surface-variant">
        <div className="flex items-center justify-between gap-4">
          <dt>Fees</dt>
          <dd>{feeEstimateSats === null ? '—' : `≈ ₿${feeEstimateSats.toLocaleString()}`}</dd>
        </div>
      </dl>

      {(() => {
        const bip21Uri = depositSats
          ? `bitcoin:${address}?amount=${(depositSats / 100_000_000).toFixed(8)}`
          : `bitcoin:${address}`;
        return (
          <div className="w-full flex flex-col gap-2.5">
            <div
              onClick={() => onCopy(bip21Uri, 'uri')}
              className="w-full bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/30 shadow-inner cursor-pointer hover:border-primary/40 transition-colors text-center group"
              title="Click to copy Payment URI"
            >
              <p className="text-[11px] font-mono text-on-surface-variant break-all group-hover:text-primary transition-colors">
                {bip21Uri}
              </p>
              <p className="text-[10px] text-primary/80 mt-1 font-medium">
                (BIP-21 URI &bull; Click to copy with amount)
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => onCopy(bip21Uri, 'uri')}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl bg-primary text-on-primary font-bold text-[13px] hover:opacity-95 transition-all shadow-md cursor-pointer"
              >
                {copiedType === 'uri' ? <><Check size={16} /> Copied URI!</> : <><Copy size={16} /> Copy URI (For Sparrow)</>}
              </button>
              <button
                type="button"
                onClick={() => onCopy(address, 'address')}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl bg-primary/15 text-primary font-bold text-[13px] hover:bg-primary/25 transition-colors border border-primary/20 cursor-pointer"
              >
                {copiedType === 'address' ? <><Check size={16} /> Copied Address!</> : <><Copy size={16} /> Copy Address Only</>}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onTrackAddress(address)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-surface-container-highest/80 hover:bg-surface-bright text-primary font-semibold text-[13px] transition-colors border border-outline-variant/20 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span>Track on Mempool</span>
              </button>
              <button
                type="button"
                onClick={onAddressBack}
                className="px-6 py-2.5 rounded-xl bg-surface-container-highest text-on-surface-variant font-bold text-[13px] hover:bg-surface-bright transition-colors border border-outline-variant/20 cursor-pointer"
              >
                Back
              </button>
            </div>

            <p className="text-[11px] text-center text-on-surface-variant/80 mt-0.5">
              💡 Tip: Pasting the <strong>Payment URI</strong> into Sparrow or Electrum automatically fills both the address and exact satoshi amount.
            </p>
          </div>
        );
      })()}

      <div className="flex items-center gap-2 text-on-surface-variant text-[13px] bg-surface-container-highest p-3 rounded-lg border border-outline-variant/10">
        <Loader2 className="animate-spin w-4 h-4 text-primary" />
        <span>Waiting for Bitcoin deposit...</span>
      </div>
    </div>
  );

  return (
    <div className="bitcoin-receive-form flex flex-col gap-3.5 sm:gap-4">
      {/* Mode Toggle */}
      <div className="bitcoin-receive-mode"><SlidingSegmentedControl<BitcoinReceiveMode>
        value={mode}
        onChange={onModeChange}
        options={[
          { id: 'lightning', label: 'Lightning', icon: <Zap size={15} /> },
          { id: 'onchain', label: 'On-Chain', icon: <Bitcoin size={20} /> },
        ]}
      /></div>

      <div className="bitcoin-receive-fields flex flex-col gap-2.5 sm:gap-3">
        <div key={mode} className="bitcoin-receive-inputs flex flex-col gap-2.5 sm:gap-3 animate-fade-in">
          <div className="bitcoin-amount-display"><AmountDisplay amount={amount} compact /></div>

          <div className="bitcoin-keypad" role="group" aria-label="Receive amount keypad"><NumberPad
            value={amount}
            disabled={requesting}
            onChange={onAmountChange}
            compact
          /></div>

          {/* On-Chain Receive Limits & Real-Time Feedback */}
          {mode === 'onchain' && (
            (amountSats > 0 && amountSats < minOnchainSats) || amountSats > maxOnchainSats
          ) && (
            <div className="bitcoin-receive-limits flex flex-col items-center gap-1.5 w-full">
              {amountSats > 0 && amountSats < minOnchainSats && (
                <div className="text-[12px] font-medium text-amber-400 bg-amber-500/15 px-3 py-1.5 rounded-lg border border-amber-500/30 text-center animate-fade-in shadow-sm">
                  ⚠️ Minimum on-chain deposit is {minOnchainSats.toLocaleString()} sats ({(minOnchainSats - amountSats).toLocaleString()} more needed)
                </div>
              )}
              {amountSats > maxOnchainSats && (
                <div className="text-[12px] font-medium text-error bg-error/15 px-3 py-1.5 rounded-lg border border-error/30 text-center animate-fade-in shadow-sm">
                  ⚠️ Maximum on-chain deposit is {maxOnchainSats.toLocaleString()} sats
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onRequest}
          disabled={requestDisabled}
          className={`bitcoin-primary bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary font-headline-lg-mobile text-[16px] sm:text-[18px] w-full py-3.5 sm:py-4 rounded-2xl shadow-lg transition-all duration-200 flex justify-center items-center mt-1 cursor-pointer ${
            requestDisabled
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:opacity-90 active:scale-[0.98]'
          }`}
        >
          {requesting ? (
            <Loader2 className="animate-spin w-6 h-6" />
          ) : mode === 'onchain' ? (
            amountSats > 0 && amountSats < minOnchainSats ? (
              `Min Deposit is ${minOnchainSats.toLocaleString()} sats`
            ) : amountSats > maxOnchainSats ? (
              `Exceeds ${maxOnchainSats.toLocaleString()} sats limit`
            ) : (
              'Get Bitcoin Address'
            )
          ) : (
            'Create Invoice'
          )}
        </button>
      </div>
    </div>
  );
}
