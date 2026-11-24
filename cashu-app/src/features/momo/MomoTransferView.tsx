import React, { useState, useEffect, useRef } from 'react';
import { X, Phone, PhoneOutgoing, PhoneIncoming } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { PaymentPageLayout } from '../../components/shared/PaymentPageLayout';
import { BottomSheet } from '../../components/shared/BottomSheet';
import { MomoPaymentForm } from './MomoPaymentForm';
import { MomoProgressBody } from './MomoProgressBody';
import { buildMomoReview, MomoReviewChangedError } from '../../services/momoReview';
import type { MomoReview } from '../../services/momoReview';
import './MomoPages.css';
import { AppPhase } from '../../types/momo';
import { calculateQuote, calculateSendQuote, fetchCurrentRate, checkMomoRecovery } from '../../services/flowServices';
import { fetchProxyBlinkBalance } from '../../services/proxyBalanceService';
import type { ProxyBlinkBalanceResult } from '../../services/proxyBalanceService';
import { MOMO_WITHDRAWAL_FIXED_FEE, ECASH_LIGHTNING_FEE, SPREAD } from '../../constants.local';
import { useWalletStore } from '../../store/wallet';
import { useTransactionStore } from '../../store/transactionStore';
import { useAddressBookStore } from '../../store/addressBookStore';
import { AddressBookPickerModal } from '../../components/addressBook/AddressBookPickerModal';
import { SovereignStampOverlay, StampPaymentStatus } from '../../components/shared/SovereignStampOverlay';
import { canSaveMomoTransaction } from '../../services/momoRecovery';

export interface MomoTransferViewProps {
  page?: boolean;
  initialTab?: 'send' | 'receive';
  onClose: () => void;
  mintUrl?: string;
}

export const MomoTransferView: React.FC<MomoTransferViewProps> = ({
  initialTab = 'receive',
  onClose,
  mintUrl: initialMintUrl = '',
  page = false,
}) => {
  const navigate = useNavigate();
  const {
    activeTransaction,
    history,
    error,
    setError,
    updateTransaction,
    setActiveTransaction,
    saveActiveTransaction,
    resumeTransaction,
  } = useTransactionStore();
  const phase = activeTransaction?.currentPhase || AppPhase.IDLE;

  const isProcessPhase =
    phase !== AppPhase.IDLE &&
    phase !== AppPhase.READY_TO_CLAIM &&
    phase !== AppPhase.PAYOUT_COMPLETE &&
    phase !== AppPhase.PAYMENT_FAILED &&
    phase !== AppPhase.PAYOUT_FAILED &&
    phase !== AppPhase.RETRYABLE_ERROR &&
    phase !== AppPhase.RECOVERY_REQUIRED &&
    phase !== AppPhase.EXPIRED;

  const initialDerivedTab =
    activeTransaction && !canSaveMomoTransaction(activeTransaction)
      ? activeTransaction.direction === 'RWF_TO_SATS'
        ? 'receive'
        : 'send'
      : initialTab;

  const [activeTab, setActiveTab] = useState<'send' | 'receive'>(initialDerivedTab);
  const [amount, setAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [review, setReview] = useState<MomoReview | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const confirming = useRef(false);

  const [showAddressBook, setShowAddressBook] = useState(false);
  const [stampDismissed, setStampDismissed] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const savedTransfers = history.filter(
    (tx) =>
      ['RWF_TO_SATS', 'SATS_TO_RWF'].includes(tx.direction) &&
      tx.id !== activeTransaction?.id &&
      (tx.status === 'PENDING' ||
        tx.currentPhase === AppPhase.RECOVERY_REQUIRED ||
        (tx.direction === 'SATS_TO_RWF' && tx.invoicePaid && tx.status !== 'COMPLETED')),
  );

  useEffect(() => {
    useTransactionStore.getState().saveActiveTransaction();
  }, []);

  const [mintUrl, setMintUrl] = useState(initialMintUrl);
  const mintBalances = useWalletStore((s) => s.mintBalances);
  const mintUrls = Object.keys(mintBalances || {});
  const availableBalance = mintBalances ? mintBalances[mintUrl] || 0 : 0;

  useEffect(() => {
    if (!mintUrl && mintUrls.length > 0) {
      setMintUrl(mintUrls[0]);
    }
  }, [mintUrl, mintUrls]);

  const startNewTopup = () => {
    if (!saveActiveTransaction()) return;
    setReview(null);
    setActiveTab('receive');
    setAmount('');
    setPhoneNumber('');
    setStampDismissed(false);
    if (page) navigate('/top-up', { replace: true, state: { mintUrl } });
  };

  const needsRecovery = phase === AppPhase.RECOVERY_REQUIRED || phase === AppPhase.RETRYABLE_ERROR;
  const handleCheckStatus = async () => {
    setCheckingStatus(true);
    setError(null);
    try {
      await checkMomoRecovery();
    } finally {
      setCheckingStatus(false);
    }
  };

  const [currentRate, setCurrentRate] = useState<number | null>(null);
  const [proxyBalance, setProxyBalance] = useState<ProxyBlinkBalanceResult | null>(null);
  const [isFetchingRate, setIsFetchingRate] = useState(false);

  useEffect(() => {
    const fetchRatesAndBalances = async () => {
      if (!currentRate) {
        setIsFetchingRate(true);
        try {
          const rate = await fetchCurrentRate();
          setCurrentRate(rate);
        } catch (e) {
          console.error('Failed to fetch rate for validation', e);
        } finally {
          setIsFetchingRate(false);
        }
      }

      if (activeTab === 'receive' && proxyBalance === null) {
        try {
          const balance = await fetchProxyBlinkBalance();
          setProxyBalance(balance);
        } catch (e) {
          console.error('Failed to fetch proxy balance', e);
        }
      }
    };
    fetchRatesAndBalances();
  }, [activeTab, currentRate, proxyBalance]);

  const amountNum = parseFloat(amount);
  let amountError = '';
  let phoneError = '';

  const lightningFeeRwf = currentRate ? Math.ceil(ECASH_LIGHTNING_FEE / currentRate) : 10;
  const totalNetworkFeeRwf = MOMO_WITHDRAWAL_FIXED_FEE + lightningFeeRwf;

  const maxWithdrawableRwf =
    activeTab === 'send' && currentRate && availableBalance > ECASH_LIGHTNING_FEE
      ? (() => {
          const usableBalance = availableBalance - ECASH_LIGHTNING_FEE;
          let maxRwf = Math.max(0, Math.floor((usableBalance / currentRate - MOMO_WITHDRAWAL_FIXED_FEE) / (1 + SPREAD)));
          while (maxRwf > 0) {
            const testNeeded = maxRwf + MOMO_WITHDRAWAL_FIXED_FEE + Math.ceil(maxRwf * SPREAD);
            if (Math.ceil(testNeeded * currentRate) + ECASH_LIGHTNING_FEE <= availableBalance) break;
            maxRwf--;
          }
          return maxRwf;
        })()
      : 0;

  if (amount) {
    if (isNaN(amountNum) || amountNum < 100) {
      amountError = 'Minimum amount is 100 RWF.';
    } else if (amountNum > 200000) {
      amountError = 'Maximum amount is 200,000 RWF.';
    } else if (activeTab === 'send' && currentRate) {
      const totalRwf = amountNum + MOMO_WITHDRAWAL_FIXED_FEE + Math.ceil(amountNum * SPREAD);
      const estimatedSats = Math.ceil(totalRwf * currentRate) + ECASH_LIGHTNING_FEE;
      if (estimatedSats > availableBalance) {
        amountError = 'INSUFFICIENT_BALANCE';
      }
    } else if (activeTab === 'receive' && currentRate && proxyBalance?.status === 'available') {
      const estimatedSats = Math.floor(amountNum * (1 - SPREAD) * currentRate);
      if (estimatedSats > proxyBalance.balanceSats) {
        amountError = 'Gateway has insufficient liquidity to process this amount right now. Please try a smaller amount.';
      }
    }
  }

  if (phoneNumber && !/^07[89]\d{7}$/.test(phoneNumber)) {
    phoneError = 'Phone number must start with 078 or 079 and be exactly 10 digits.';
  }

  const isFormValid = Boolean(amount && phoneNumber && !amountError && !phoneError && !isFetchingRate && phase === AppPhase.IDLE);
  const isSuccess = phase === AppPhase.READY_TO_CLAIM || phase === AppPhase.PAYOUT_COMPLETE;
  const isFailed = phase === AppPhase.PAYMENT_FAILED || phase === AppPhase.PAYOUT_FAILED;

  useEffect(() => {
    if (isSuccess && phoneNumber) {
      try {
        useAddressBookStore.getState().recordSuccessfulUse('momo', phoneNumber, {
          network: phoneNumber.startsWith('078') || phoneNumber.startsWith('079') ? 'mtn' : undefined,
          currency: 'RWF',
        });
      } catch (e) {
        console.warn('Failed to record MoMo address book entry:', e);
      }
    }
  }, [isSuccess, phoneNumber]);

  const stampStatus: StampPaymentStatus | null = !stampDismissed && isSuccess ? 'success' : !stampDismissed && isFailed ? 'failed' : null;

  const reviewTransfer = () => {
    if (!isFormValid || !currentRate) return;
    setError(null);
    try {
      setReview(
        buildMomoReview({
          direction: activeTab === 'send' ? 'SATS_TO_RWF' : 'RWF_TO_SATS',
          amount: amountNum,
          phone: phoneNumber,
          mint: mintUrl,
          rate: currentRate,
          spread: SPREAD,
          fixedFee: MOMO_WITHDRAWAL_FIXED_FEE,
          networkReserve: ECASH_LIGHTNING_FEE,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review transfer.');
    }
  };

  const confirmReview = async () => {
    if (!review || confirming.current || phase !== AppPhase.IDLE) return;
    confirming.current = true;
    setSubmittingReview(true);
    setError(null);
    setStampDismissed(false);
    try {
      const submit = review.direction === 'SATS_TO_RWF' ? calculateSendQuote : calculateQuote;
      await submit(String(review.amount), review.phone, 'ecash', review.mint, review);
      setReview(null);
    } catch (err) {
      if (err instanceof MomoReviewChangedError) {
        setReview(err.review);
        setCurrentRate(err.review.rate);
      }
      setError(err instanceof Error ? err.message : 'Could not confirm transfer.');
    } finally {
      confirming.current = false;
      setSubmittingReview(false);
    }
  };

  const handleReceiveFromMomo = async () => {
    setError(null);
    setStampDismissed(false);
    await calculateQuote(amount, phoneNumber, 'ecash', mintUrl);
  };

  const handleSendToMomo = async () => {
    setError(null);
    setStampDismissed(false);
    await calculateSendQuote(amount, phoneNumber, 'ecash', mintUrl);
  };

  const switchTab = (tab: 'send' | 'receive') => {
    if (phase !== AppPhase.IDLE) return;
    setActiveTab(tab);
    setAmount('');
    setPhoneNumber('');
    setError(null);
    setStampDismissed(false);
  };

  const clearFinishedTransfer = () => {
    if (
      phase === AppPhase.READY_TO_CLAIM ||
      phase === AppPhase.PAYOUT_COMPLETE ||
      phase === AppPhase.PAYMENT_FAILED ||
      phase === AppPhase.PAYOUT_FAILED
    ) {
      setActiveTransaction(null);
      setError(null);
      setStampDismissed(false);
    }
  };

  const handleClose = (closeSheet?: () => void) => {
    if (confirming.current && phase === AppPhase.IDLE) return;
    clearFinishedTransfer();
    if (closeSheet) closeSheet();
    else onClose();
  };

  const renderBody = (closeAction: () => void, dragHandleProps?: Record<string, unknown>) => (
    <>
      <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>

      {!page && (
        <div
          {...(isProcessPhase ? {} : dragHandleProps || {})}
          className={`w-full flex justify-center pt-3 pb-1 relative z-10 sm:hidden ${
            isProcessPhase ? 'cursor-default pointer-events-none opacity-30' : 'cursor-grab active:cursor-grabbing'
          }`}
        >
          <div className="w-12 h-1.5 bg-white/25 rounded-full transition-colors"></div>
        </div>
      )}

      {!page && phase === AppPhase.IDLE && (
        <>
          <div
            {...(dragHandleProps || {})}
            className="flex items-center justify-between px-6 py-4 relative z-10 border-b border-outline-variant/10 cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Phone className="text-primary" size={20} />
              </div>
              <h2 className="text-headline-sm font-headline-sm text-on-surface">Mobile Money</h2>
            </div>
            <button
              type="button"
              onClick={closeAction}
              aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="relative flex border-b border-outline-variant/10 z-10 bg-surface-container-high/40 select-none">
            <button
              onClick={() => switchTab('receive')}
              className={`flex-1 py-3.5 text-[14px] font-bold tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                activeTab === 'receive' ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-bright/20'
              }`}
            >
              <PhoneIncoming size={16} className={`transition-transform duration-200 ${activeTab === 'receive' ? 'scale-110 text-primary' : ''}`} />
              <span>TOP UP</span>
            </button>
            <button
              onClick={() => switchTab('send')}
              className={`flex-1 py-3.5 text-[14px] font-bold tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                activeTab === 'send' ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-bright/20'
              }`}
            >
              <PhoneOutgoing size={16} className={`transition-transform duration-200 ${activeTab === 'send' ? 'scale-110 text-primary' : ''}`} />
              <span>CASH OUT</span>
            </button>

            <div
              className="absolute bottom-0 left-0 h-[2.5px] bg-primary shadow-[0_0_12px_rgba(242,169,59,0.7)] rounded-t-full transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] w-1/2 pointer-events-none"
              style={{ transform: `translate3d(${activeTab === 'receive' ? '0%' : '100%'}, 0, 0)` }}
            />
          </div>
        </>
      )}

      {page && phase === AppPhase.IDLE ? (
        <MomoPaymentForm
          cashout={activeTab === 'send'}
          amount={amount}
          phone={phoneNumber}
          mint={mintUrl}
          balances={mintBalances}
          onAmount={setAmount}
          onPhone={setPhoneNumber}
          onMint={setMintUrl}
          onAddressBook={() => setShowAddressBook(true)}
          valid={Boolean(isFormValid && currentRate && mintUrl)}
          loadingRate={isFetchingRate}
          validation={
            phoneError || (amountError === 'INSUFFICIENT_BALANCE' ? 'Insufficient wallet balance for this amount and fees.' : amountError)
          }
          review={review}
          submitting={submittingReview}
          error={error}
          maxAmount={maxWithdrawableRwf}
          rateUnavailable={!currentRate && !isFetchingRate}
          onRefreshRate={async () => {
            setIsFetchingRate(true);
            try {
              setCurrentRate(await fetchCurrentRate());
              setError(null);
            } catch {
              setError('Could not load the exchange rate. Try again.');
            } finally {
              setIsFetchingRate(false);
            }
          }}
          onReview={reviewTransfer}
          onConfirm={confirmReview}
          saved={savedTransfers}
          onResume={(id) => {
            if (resumeTransaction(id)) {
              const tx = history.find((t) => t.id === id);
              if (tx) setActiveTab(tx.direction === 'RWF_TO_SATS' ? 'receive' : 'send');
              setReview(null);
              setStampDismissed(false);
            }
          }}
        />
      ) : (
        <MomoProgressBody
          activeTab={activeTab}
          phase={phase}
          activeTransaction={activeTransaction}
          error={error}
          savedTransfers={savedTransfers}
          mintUrl={mintUrl}
          mintUrls={mintUrls}
          mintBalances={mintBalances}
          availableBalance={availableBalance}
          needsRecovery={needsRecovery}
          checkingStatus={checkingStatus}
          isProcessPhase={isProcessPhase}
          phoneNumber={phoneNumber}
          phoneError={phoneError}
          amount={amount}
          amountNum={amountNum}
          amountError={amountError}
          currentRate={currentRate}
          isFetchingRate={isFetchingRate}
          isFormValid={isFormValid}
          maxWithdrawableRwf={maxWithdrawableRwf}
          totalNetworkFeeRwf={totalNetworkFeeRwf}
          onSelectMint={setMintUrl}
          onResumeTransfer={(id) => {
            if (!resumeTransaction(id)) return;
            const tx = history.find((t) => t.id === id);
            if (tx) setActiveTab(tx.direction === 'RWF_TO_SATS' ? 'receive' : 'send');
            setStampDismissed(false);
          }}
          onRetryPayout={() => {
            setError(null);
            updateTransaction({ momoSubmission: 'not_started', currentPhase: AppPhase.INITIATING_PAYOUT });
          }}
          onCheckStatus={handleCheckStatus}
          onStartNewTopup={startNewTopup}
          onClose={closeAction}
          onPhoneChange={setPhoneNumber}
          onAmountChange={setAmount}
          onOpenAddressBook={() => setShowAddressBook(true)}
          onReceiveFromMomo={handleReceiveFromMomo}
          onSendToMomo={handleSendToMomo}
        />
      )}
    </>
  );

  const overlays = (
    <>
      <SovereignStampOverlay
        status={stampStatus}
        amountValue={activeTransaction?.rwfAmount || (amount ? parseInt(amount, 10) : undefined)}
        currency="RWF"
        currencyPosition="suffix"
        title={
          stampStatus === 'success'
            ? activeTab === 'receive'
              ? 'Top Up Complete'
              : 'Cash Out Complete'
            : activeTab === 'receive'
              ? 'Top Up Failed'
              : 'Cash Out Failed'
        }
        subtitle={
          stampStatus === 'success'
            ? activeTab === 'receive'
              ? 'Funds added to your wallet balance.'
              : 'RWF sent to your mobile money account.'
            : error || activeTransaction?.recoveryMessage || 'The mobile money transfer failed.'
        }
        badgeLabel={stampStatus === 'success' ? (activeTab === 'receive' ? 'Topped Up' : 'Cashed Out') : 'Failed'}
        errorMessage={stampStatus === 'failed' ? error || activeTransaction?.recoveryMessage || undefined : undefined}
        onDismiss={() => {
          setStampDismissed(true);
          if (stampStatus === 'success' && page) clearFinishedTransfer();
          else handleClose();
        }}
        onRetry={
          stampStatus === 'failed'
            ? () => {
                setStampDismissed(false);
                setActiveTransaction(null);
                setError(null);
              }
            : undefined
        }
      />
      <AddressBookPickerModal
        isOpen={showAddressBook}
        onClose={() => setShowAddressBook(false)}
        type="momo"
        onSelect={(contact) => {
          setPhoneNumber(contact.value);
        }}
      />
    </>
  );

  if (page) {
    return (
      <>
        <PaymentPageLayout
          className="momo-page"
          bodyClassName="momo-page-body"
          bodyLabel="Mobile Money transfer"
          header={
            <PageHeader
              title={
                review
                  ? activeTab === 'send'
                    ? 'Review cashout'
                    : 'Review top-up'
                  : activeTab === 'send'
                    ? 'Cash out'
                    : 'Top up'
              }
              subtitle={
                review
                  ? 'Check your phone number, amount and fees'
                  : activeTab === 'send'
                    ? 'Send RWF to a Mobile Money account'
                    : 'Add funds using Mobile Money'
              }
              sticky={false}
              className="momo-page-header"
              backDisabled={submittingReview}
              onBack={() => {
                if (review) {
                  setReview(null);
                  setError(null);
                } else handleClose();
              }}
            />
          }
        >
          <div className="momo-sheet">{renderBody(() => handleClose())}</div>
        </PaymentPageLayout>
        {overlays}
      </>
    );
  }

  return (
    <>
      <BottomSheet
        onClose={() => handleClose()}
        aria-label="Mobile Money"
        dismissible={!isProcessPhase && !(confirming.current && phase === AppPhase.IDLE)}
        className="w-full max-w-lg bg-surface-container-high/95 backdrop-blur-xl rounded-t-[28px] sm:rounded-2xl border-t border-x sm:border border-outline-variant/20 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden relative max-h-[92vh] pb-6 sm:pb-0"
      >
        {({ close, dragHandleProps }) => renderBody(() => handleClose(close), dragHandleProps)}
      </BottomSheet>
      {overlays}
    </>
  );
};
