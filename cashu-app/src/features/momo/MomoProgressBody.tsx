import React, { useState } from 'react';
import { BookUser, Check, ChevronDown, PhoneIncoming, PhoneOutgoing, X } from 'lucide-react';
import { AppPhase, type TransactionDetails as TransactionRecord } from '../../types/momo';
import { ECASH_LIGHTNING_FEE, MOMO_WITHDRAWAL_FIXED_FEE, SPREAD } from '../../constants.local';
import { AddressBookAutocomplete } from '../../components/addressBook/AddressBookAutocomplete';
import { MintIcon } from '../../components/shared/MintIcon';
import { MintName } from '../../components/shared/MintName';
import { canSaveMomoTransaction } from '../../services/momoRecovery';

export interface MomoProgressBodyProps {
  activeTab: 'send' | 'receive';
  phase: AppPhase;
  activeTransaction: TransactionRecord | null;
  error: string | null;
  savedTransfers: TransactionRecord[];
  mintUrl: string;
  mintUrls: string[];
  mintBalances: Record<string, number>;
  availableBalance: number;
  needsRecovery: boolean;
  checkingStatus: boolean;
  isProcessPhase: boolean;
  phoneNumber: string;
  phoneError: string;
  amount: string;
  amountNum: number;
  amountError: string;
  currentRate: number | null;
  isFetchingRate: boolean;
  isFormValid: boolean;
  maxWithdrawableRwf: number;
  totalNetworkFeeRwf: number;
  onSelectMint: (mint: string) => void;
  onResumeTransfer: (id: string) => void;
  onRetryPayout: () => void;
  onCheckStatus: () => void;
  onStartNewTopup: () => void;
  onClose: () => void;
  onPhoneChange: (phone: string) => void;
  onAmountChange: (amount: string) => void;
  onOpenAddressBook: () => void;
  onReceiveFromMomo: () => void;
  onSendToMomo: () => void;
}

function StepIcon({ active, done }: { active: boolean; done: boolean }) {
  if (active) {
    return <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />;
  }
  if (done) {
    return (
      <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  return <div className="w-2 h-2 rounded-full bg-outline-variant/50" />;
}

export const MomoProgressBody: React.FC<MomoProgressBodyProps> = ({
  activeTab,
  phase,
  activeTransaction,
  error,
  savedTransfers,
  mintUrl,
  mintUrls,
  mintBalances,
  availableBalance,
  needsRecovery,
  checkingStatus,
  isProcessPhase,
  phoneNumber,
  phoneError,
  amount,
  amountNum,
  amountError,
  currentRate,
  isFetchingRate,
  isFormValid,
  maxWithdrawableRwf,
  totalNetworkFeeRwf,
  onSelectMint,
  onResumeTransfer,
  onRetryPayout,
  onCheckStatus,
  onStartNewTopup,
  onClose,
  onPhoneChange,
  onAmountChange,
  onOpenAddressBook,
  onReceiveFromMomo,
  onSendToMomo,
}) => {
  const [showMintDropdown, setShowMintDropdown] = useState(false);
  const [isClosingMintDropdown, setIsClosingMintDropdown] = useState(false);

  const closeMintDropdown = () => {
    setIsClosingMintDropdown(true);
    setTimeout(() => {
      setShowMintDropdown(false);
      setIsClosingMintDropdown(false);
    }, 160);
  };

  const toggleMintDropdown = () => {
    if (showMintDropdown) closeMintDropdown();
    else setShowMintDropdown(true);
  };

  return (
    <div className="momo-progress-body flex-1 overflow-y-auto overflow-x-hidden p-6 relative z-10 custom-scrollbar">
      {error && (
        <div className="p-3 mb-4 rounded-xl bg-error/10 text-error text-body-md text-center">{error}</div>
      )}

      {phase === AppPhase.IDLE && savedTransfers.length > 0 && (
        <details className="mb-5 rounded-2xl bg-surface-container-highest/60 border border-outline-variant/15">
          <summary className="p-4 cursor-pointer text-label-lg text-on-surface">
            Saved transfers <span className="text-on-surface-variant text-body-sm">({savedTransfers.length} pending)</span>
          </summary>
          <div className="px-4 pb-4 flex flex-col gap-2">
            <p className="text-body-sm text-on-surface-variant mb-1">
              These transfers may still complete. Open one to check its status.
            </p>
            {savedTransfers.map((tx) => (
              <button
                key={tx.id}
                onClick={() => onResumeTransfer(tx.id)}
                className="flex items-center justify-between gap-3 w-full p-3 rounded-xl border border-outline-variant/20 text-left hover:bg-surface-bright/30"
              >
                <span className="min-w-0">
                  <span className="block text-label-md text-on-surface">
                    {tx.direction === 'RWF_TO_SATS' ? 'Top-up' : 'Cashout'} · {tx.rwfAmount.toLocaleString()} RWF
                  </span>
                  <span className="block text-body-sm text-on-surface-variant">
                    {tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : 'Pending'}
                  </span>
                </span>
                <span className="text-label-md text-primary shrink-0">View transfer</span>
              </button>
            ))}
          </div>
        </details>
      )}

      {phase === AppPhase.IDLE && (
        <div className="flex flex-col gap-2 mb-6">
          <p className="text-body-md font-body-md text-on-surface-variant">
            {activeTab === 'send' ? 'Cash out from mint:' : 'Top up to mint:'}
          </p>
          <div className="relative">
            {showMintDropdown && <div className="fixed inset-0 z-40" onClick={closeMintDropdown}></div>}
            <button
              onClick={toggleMintDropdown}
              className="w-full flex items-center justify-between bg-surface-container-highest p-3 rounded-xl border border-outline-variant/10 hover:bg-surface-bright transition-colors relative z-50 cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0 pr-4">
                <MintIcon
                  mintUrl={mintUrl}
                  className="w-6 h-6 flex-shrink-0 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30"
                  textClassName="text-primary text-[10px] font-bold"
                />
                <MintName mintUrl={mintUrl} className="text-body-md font-body-md text-on-surface font-medium truncate" />
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
                <span className="text-body-md font-body-md font-semibold text-on-surface">
                  ₿{availableBalance.toLocaleString()}
                </span>
                <ChevronDown
                  size={16}
                  className={`flex-shrink-0 transition-transform duration-300 ease-out ${
                    showMintDropdown && !isClosingMintDropdown ? 'rotate-180 text-primary' : 'text-on-surface-variant'
                  }`}
                />
              </div>
            </button>

            {showMintDropdown && (
              <div
                className={`absolute top-full left-0 right-0 mt-2 bg-surface-container-highest rounded-2xl shadow-[0_16px_48px_-8px_rgba(0,0,0,0.7)] border border-outline-variant/20 overflow-hidden flex flex-col z-50 max-h-[250px] overflow-y-auto ${
                  isClosingMintDropdown ? 'animate-dropdown-collapse' : 'animate-dropdown-expand'
                }`}
              >
                {mintUrls.map((m, index) => (
                  <button
                    key={m}
                    style={{ animationDelay: `${index * 30}ms` }}
                    onClick={() => {
                      onSelectMint(m);
                      closeMintDropdown();
                    }}
                    className="flex items-center justify-between p-3 hover:bg-surface-bright transition-colors text-left w-full border-b border-outline-variant/10 last:border-b-0 animate-dropdown-item cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <MintIcon
                        mintUrl={m}
                        className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0"
                        textClassName="text-primary text-[10px] font-bold"
                      />
                      <MintName mintUrl={m} className="text-body-sm font-body-sm text-on-surface truncate" />
                      {mintUrl === m && <Check size={14} className="text-primary flex-shrink-0" />}
                    </div>
                    <span className="text-body-sm font-body-sm font-bold text-on-surface flex-shrink-0">
                      ₿{(mintBalances[m] || 0).toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {needsRecovery ? (
        <div className="flex flex-col gap-5 py-4">
          <div>
            <h3 className="text-headline-md text-on-surface mb-3">Check your transfer</h3>
            <p className="text-body-md text-on-surface-variant" role="status">
              {activeTransaction?.recoveryMessage || 'This transfer was interrupted. Check its status before trying again.'}
            </p>
          </div>
          <div className="rounded-2xl bg-surface-container-highest p-4">
            <p className="text-label-md text-on-surface-variant mb-2">Transaction ID</p>
            <p className="text-body-sm text-on-surface break-all select-text">{activeTransaction?.id}</p>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            You can close this screen. This transfer stays saved. Checking its status will not charge your phone or wallet again.
          </p>
          {activeTransaction?.direction === 'SATS_TO_RWF' &&
            activeTransaction.invoicePaid &&
            activeTransaction.momoSubmission === 'rejected' && (
              <button
                disabled={checkingStatus}
                onClick={onRetryPayout}
                className="w-full bg-surface-container-highest text-on-surface py-4 rounded-2xl font-label-lg"
              >
                Retry payout using existing funding
              </button>
            )}
          <button
            disabled={checkingStatus}
            onClick={onCheckStatus}
            className="w-full bg-primary text-on-primary py-4 rounded-2xl font-label-lg disabled:opacity-50"
          >
            {checkingStatus ? 'Checking status…' : 'Check status'}
          </button>
          <button onClick={onStartNewTopup} className="w-full text-primary py-3 rounded-2xl font-label-lg">
            New top-up
          </button>
          <button onClick={onClose} className="w-full text-primary py-3 rounded-2xl font-label-lg">
            Close
          </button>
        </div>
      ) : (
        <div
          key={activeTab}
          className={`flex flex-col gap-4 ${activeTab === 'send' ? 'animate-tab-from-right' : 'animate-tab-from-left'}`}
        >
          {activeTab === 'receive' && (
            <div className="flex flex-col gap-4">
              {phase === AppPhase.READY_TO_CLAIM ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-4">
                    <PhoneIncoming size={32} />
                  </div>
                  <h3 className="text-headline-md text-on-surface mb-2">Success!</h3>
                  <p className="text-body-md text-on-surface-variant">Sats have been topped up to your wallet.</p>
                  <button onClick={onClose} className="w-full mt-6 bg-primary text-on-primary py-4 rounded-2xl font-label-lg">
                    Close
                  </button>
                </div>
              ) : phase === AppPhase.PAYMENT_FAILED ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-error/20 text-error flex items-center justify-center mx-auto mb-4">
                    <X size={32} />
                  </div>
                  <h3 className="text-headline-md text-on-surface mb-2">Transfer Failed</h3>
                  <p className="text-body-md text-on-surface-variant mb-6">
                    {error || activeTransaction?.recoveryMessage || 'Something went wrong.'}
                  </p>
                  <button
                    onClick={onClose}
                    className="w-full bg-surface-container-highest text-on-surface py-4 rounded-2xl font-label-lg hover:bg-surface-bright"
                  >
                    Close
                  </button>
                </div>
              ) : [
                  AppPhase.FETCHING_RATE,
                  AppPhase.INITIATING_PAYMENT,
                  AppPhase.PENDING_PAYMENT,
                  AppPhase.VERIFYING_PAYMENT,
                  AppPhase.PAYING_INVOICE,
                  AppPhase.FULFILLING,
                ].includes(phase) ? (
                <div className="py-6 px-4">
                  <h3 className="text-headline-md text-on-surface mb-6 text-center">Processing Transfer</h3>
                  <div className="flex flex-col gap-4">
                    {[
                      {
                        title: 'Initiating Transaction',
                        subtitle: 'Generating quote and securing rates',
                        active: [AppPhase.FETCHING_RATE, AppPhase.INITIATING_PAYMENT].includes(phase),
                        done: ![AppPhase.FETCHING_RATE, AppPhase.INITIATING_PAYMENT].includes(phase),
                      },
                      {
                        title: 'Awaiting MoMo Approval',
                        subtitle: 'Please enter your PIN on your phone',
                        active: phase === AppPhase.PENDING_PAYMENT || phase === AppPhase.VERIFYING_PAYMENT,
                        done: [AppPhase.PAYING_INVOICE, AppPhase.FULFILLING].includes(phase),
                      },
                      {
                        title: 'Paying Lightning Invoice',
                        subtitle: 'Funding the Cashu Mint via proxy',
                        active: phase === AppPhase.PAYING_INVOICE,
                        done: phase === AppPhase.FULFILLING,
                      },
                      {
                        title: 'Minting eCash',
                        subtitle: 'Issuing tokens to your wallet',
                        active: phase === AppPhase.FULFILLING,
                        done: false,
                      },
                    ].map((step) => (
                      <div key={step.title} className="flex items-center gap-4">
                        <div className="relative flex items-center justify-center w-8 h-8">
                          <StepIcon active={step.active} done={step.done} />
                        </div>
                        <div className="flex-1">
                          <p className={`text-label-lg ${step.active ? 'text-primary' : step.done ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>
                            {step.title}
                          </p>
                          <p className={`text-body-sm ${step.active || step.done ? 'text-on-surface-variant' : 'text-on-surface-variant/50'}`}>
                            {step.subtitle}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-label-md text-on-surface-variant block mb-2">Phone Number</label>
                    <div className="relative">
                      <input
                        type="text"
                        spellCheck={false}
                        placeholder="078..."
                        className={`w-full bg-[#0c1b14] rounded-xl p-4 pr-12 text-body-lg text-on-surface border focus:outline-none focus:ring-1 ${
                          phoneError ? 'border-error focus:ring-error' : 'border-[#142d20] focus:border-primary/50 focus:ring-primary'
                        }`}
                        value={phoneNumber}
                        onChange={(e) => onPhoneChange(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={onOpenAddressBook}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary p-1.5 rounded-xl hover:bg-surface-container transition-colors cursor-pointer"
                        title="Open Address Book"
                      >
                        <BookUser size={18} />
                      </button>
                      <AddressBookAutocomplete
                        type="momo"
                        query={phoneNumber}
                        visible={!!phoneNumber && !phoneError}
                        onSelect={(c) => onPhoneChange(c.value)}
                        onClose={() => {}}
                      />
                    </div>
                    {phoneError && <p className="text-error text-label-sm mt-2 ml-2">{phoneError}</p>}
                  </div>
                  <div>
                    <label className="text-label-md text-on-surface-variant block mb-2">Amount to Receive (RWF)</label>
                    <input
                      type="number"
                      spellCheck={false}
                      placeholder="Amount in RWF"
                      className={`w-full bg-[#0c1b14] rounded-xl p-4 text-body-lg text-on-surface border focus:outline-none focus:ring-1 ${
                        amountError ? 'border-error focus:ring-error' : 'border-[#142d20] focus:border-primary/50 focus:ring-primary'
                      }`}
                      value={amount}
                      onChange={(e) => onAmountChange(e.target.value)}
                    />
                    {amountError && <p className="text-error text-label-sm mt-2 ml-2">{amountError}</p>}
                    {!amountError && amountNum >= 100 && currentRate && (
                      <div className="mt-2.5 p-3 rounded-xl bg-surface-container-highest/60 border border-outline-variant/15 flex flex-col gap-1 text-xs text-on-surface-variant">
                        <div className="flex justify-between items-center">
                          <span>Deposit fee:</span>
                          <span className="font-semibold text-emerald-400">0 RWF (Free)</span>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-outline-variant/10 text-on-surface">
                          <span>You will receive:</span>
                          <span className="font-bold text-primary">
                            ~{Math.floor(amountNum * (1 - SPREAD) * currentRate).toLocaleString()} sats
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={onReceiveFromMomo}
                    disabled={!isFormValid}
                    className="w-full mt-4 bg-primary text-on-primary py-4 rounded-2xl font-label-lg disabled:opacity-50"
                  >
                    {phase === AppPhase.FETCHING_RATE
                      ? 'Calculating...'
                      : phase === AppPhase.INITIATING_PAYMENT
                        ? 'Initiating...'
                        : 'Top Up via MoMo'}
                  </button>
                </>
              )}
            </div>
          )}

          {activeTab === 'send' && (
            <div className="flex flex-col gap-4">
              {phase === AppPhase.READY_TO_CLAIM ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-4">
                    <PhoneOutgoing size={32} />
                  </div>
                  <h3 className="text-headline-md text-on-surface mb-2">Transfer Complete!</h3>
                  <p className="text-body-md text-on-surface-variant">
                    RWF has been cashed out successfully to the mobile money number.
                  </p>
                  <button onClick={onClose} className="w-full mt-6 bg-primary text-on-primary py-4 rounded-2xl font-label-lg">
                    Close
                  </button>
                </div>
              ) : phase === AppPhase.PAYMENT_FAILED ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-error/20 text-error flex items-center justify-center mx-auto mb-4">
                    <X size={32} />
                  </div>
                  <h3 className="text-headline-md text-on-surface mb-2">Transfer Failed</h3>
                  <p className="text-body-md text-on-surface-variant mb-6">
                    {error || activeTransaction?.recoveryMessage || 'Something went wrong.'}
                  </p>
                  <button
                    onClick={onClose}
                    className="w-full bg-surface-container-highest text-on-surface py-4 rounded-2xl font-label-lg hover:bg-surface-bright"
                  >
                    Close
                  </button>
                </div>
              ) : [
                  AppPhase.GENERATING_INVOICE,
                  AppPhase.AWAITING_INVOICE_PAYMENT,
                  AppPhase.PAYING_INVOICE,
                  AppPhase.INITIATING_PAYOUT,
                  AppPhase.VERIFYING_PAYOUT,
                ].includes(phase) ? (
                <div className="py-6 px-4">
                  <h3 className="text-headline-md text-on-surface mb-6 text-center">Processing Send</h3>
                  <div className="flex flex-col gap-4">
                    {[
                      {
                        title: 'Calculating Quote',
                        subtitle: 'Securing exchange rate and invoice',
                        active: phase === AppPhase.GENERATING_INVOICE,
                        done: phase !== AppPhase.GENERATING_INVOICE,
                      },
                      {
                        title: 'Funding Transfer',
                        subtitle: 'Paying Lightning invoice from eCash',
                        active: [AppPhase.AWAITING_INVOICE_PAYMENT, AppPhase.PAYING_INVOICE].includes(phase),
                        done: [AppPhase.INITIATING_PAYOUT, AppPhase.VERIFYING_PAYOUT].includes(phase),
                      },
                      {
                        title: 'Initiating MoMo Payout',
                        subtitle: 'Instructing gateway to cash out RWF',
                        active: phase === AppPhase.INITIATING_PAYOUT,
                        done: phase === AppPhase.VERIFYING_PAYOUT,
                      },
                      {
                        title: 'Verifying Transfer',
                        subtitle: 'Waiting for MoMo network confirmation',
                        active: phase === AppPhase.VERIFYING_PAYOUT,
                        done: false,
                      },
                    ].map((step) => (
                      <div key={step.title} className="flex items-center gap-4">
                        <div className="relative flex items-center justify-center w-8 h-8">
                          <StepIcon active={step.active} done={step.done} />
                        </div>
                        <div className="flex-1">
                          <p className={`text-label-lg ${step.active ? 'text-primary' : step.done ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>
                            {step.title}
                          </p>
                          <p className={`text-body-sm ${step.active || step.done ? 'text-on-surface-variant' : 'text-on-surface-variant/50'}`}>
                            {step.subtitle}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-label-md text-on-surface-variant block mb-2">Recipient Phone Number</label>
                    <div className="relative">
                      <input
                        type="text"
                        spellCheck={false}
                        placeholder="078..."
                        className={`w-full bg-[#0c1b14] rounded-xl p-4 pr-12 text-body-lg text-on-surface border focus:outline-none focus:ring-1 ${
                          phoneError ? 'border-error focus:ring-error' : 'border-[#142d20] focus:border-primary/50 focus:ring-primary'
                        }`}
                        value={phoneNumber}
                        onChange={(e) => onPhoneChange(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={onOpenAddressBook}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary p-1.5 rounded-xl hover:bg-surface-container transition-colors cursor-pointer"
                        title="Open Address Book"
                      >
                        <BookUser size={18} />
                      </button>
                      <AddressBookAutocomplete
                        type="momo"
                        query={phoneNumber}
                        visible={!!phoneNumber && !phoneError}
                        onSelect={(c) => onPhoneChange(c.value)}
                        onClose={() => {}}
                      />
                    </div>
                    {phoneError && <p className="text-error text-label-sm mt-2 ml-2">{phoneError}</p>}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-label-md text-on-surface-variant">Amount to Send (RWF)</label>
                      {maxWithdrawableRwf >= 100 && (
                        <button
                          type="button"
                          onClick={() => onAmountChange(String(maxWithdrawableRwf))}
                          className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 cursor-pointer"
                        >
                          Max: {maxWithdrawableRwf.toLocaleString()} RWF
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      spellCheck={false}
                      placeholder="Amount in RWF"
                      className={`w-full bg-[#0c1b14] rounded-xl p-4 text-body-lg text-on-surface border focus:outline-none focus:ring-1 ${
                        amountError ? 'border-error focus:ring-error' : 'border-[#142d20] focus:border-primary/50 focus:ring-primary'
                      }`}
                      value={amount}
                      onChange={(e) => onAmountChange(e.target.value)}
                    />
                    {amountError === 'INSUFFICIENT_BALANCE' && currentRate && (
                      <div className="mt-2.5 p-3 rounded-xl bg-error/10 border border-error/20 flex flex-col gap-1.5 text-xs">
                        <div className="text-error font-medium">
                          Need ~
                          {(
                            Math.ceil((amountNum + MOMO_WITHDRAWAL_FIXED_FEE + Math.ceil(amountNum * SPREAD)) * currentRate) +
                            ECASH_LIGHTNING_FEE
                          ).toLocaleString()}{' '}
                          sats (includes ~{totalNetworkFeeRwf.toLocaleString()} RWF network fee).
                        </div>
                        {maxWithdrawableRwf >= 100 ? (
                          <div className="text-on-surface-variant flex items-center justify-between pt-1 border-t border-error/15">
                            <span>Max you can withdraw:</span>
                            <button
                              type="button"
                              onClick={() => onAmountChange(String(maxWithdrawableRwf))}
                              className="font-bold text-primary hover:underline cursor-pointer"
                            >
                              Set to {maxWithdrawableRwf.toLocaleString()} RWF →
                            </button>
                          </div>
                        ) : (
                          <span className="text-on-surface-variant text-[11px]">
                            Balance too low to cover ~{totalNetworkFeeRwf.toLocaleString()} RWF network fee.
                          </span>
                        )}
                      </div>
                    )}
                    {amountError && amountError !== 'INSUFFICIENT_BALANCE' && (
                      <p className="text-error text-label-sm mt-2 ml-2">{amountError}</p>
                    )}
                    {!amountError && amountNum >= 100 && currentRate && (
                      <div className="mt-2.5 p-3 rounded-xl bg-surface-container-highest/60 border border-outline-variant/15 flex flex-col gap-1 text-xs text-on-surface-variant">
                        <div className="flex justify-between items-center">
                          <span>Recipient receives:</span>
                          <span className="font-semibold text-on-surface">{amountNum.toLocaleString()} RWF</span>
                        </div>
                        <div className="flex justify-between items-center text-on-surface-variant/80">
                          <span>Network fee:</span>
                          <span>~{totalNetworkFeeRwf.toLocaleString()} RWF</span>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-outline-variant/10 text-on-surface">
                          <span>Total from wallet:</span>
                          <span className="font-bold text-primary">
                            ~
                            {(
                              Math.ceil((amountNum + MOMO_WITHDRAWAL_FIXED_FEE + Math.ceil(amountNum * SPREAD)) * currentRate) +
                              ECASH_LIGHTNING_FEE
                            ).toLocaleString()}{' '}
                            sats
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={onSendToMomo}
                    disabled={!isFormValid}
                    className="w-full mt-4 bg-primary text-on-primary py-4 rounded-2xl font-label-lg disabled:opacity-50 transition-all"
                  >
                    {isFetchingRate ? 'Loading rates...' : 'Cash Out to MoMo'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {isProcessPhase && (
        <button onClick={onClose} className="w-full mt-5 text-primary py-3 rounded-2xl font-label-lg">
          Close and keep transfer
        </button>
      )}
      {isProcessPhase && canSaveMomoTransaction(activeTransaction) && (
        <button onClick={onStartNewTopup} className="w-full text-primary py-3 rounded-2xl font-label-lg">
          New top-up
        </button>
      )}
    </div>
  );
};
