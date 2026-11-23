import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MintBalancePicker } from '../../components/shared/MintBalancePicker';
import { PageHeader } from '../../components/shared/PageHeader';
import { PaymentPageLayout } from '../../components/shared/PaymentPageLayout';
import { BitcoinSendReview, BitcoinSendConfirmation } from './BitcoinSendReview';
import { BitcoinDestinationEntry } from './BitcoinDestinationEntry';
import { BitcoinReceive } from './BitcoinReceive';
import { useBitcoinSend } from './useBitcoinSend';
import { useBitcoinReceive } from './useBitcoinReceive';
import './BitcoinPages.css';
import { X, Loader2, Bitcoin, ArrowUp, ArrowDown } from 'lucide-react';
import { OnchainLimits, getOnchainSendLimits } from '../../services/sparkService';
import { useAddressBookStore } from '../../store/addressBookStore';
import { AddressBookPickerModal } from '../../components/addressBook/AddressBookPickerModal';

import { toast } from 'react-hot-toast';
import { useWalletStore } from '../../store/wallet';
import { useBitcoin } from '../../hooks/useBitcoin';
import { useHistory } from '../../hooks/useHistory';

import { SovereignStampOverlay } from '../../components/shared/SovereignStampOverlay';
import { FullScreenLoader } from '../../components/shared/FullScreenLoader';
import { createPortal } from 'react-dom';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { NumberPad } from '../../components/shared/NumberPad';
import { Scanner } from '@yudiel/react-qr-scanner';
import { readClipboardText, writeClipboardText } from '../../utils/clipboard';
import { fetchLnurlPayInvoice } from '../../services/lnurlService';
import { useLnurlValidation, validateLnurlPay } from '../../hooks/useLnurlValidation';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { openMempoolTx, openMempoolAddress } from '../../utils/mempool';

export interface BitcoinPaymentViewProps {
  page?: boolean;
  mintUrl: string;
  initialTab?: 'send' | 'receive';
  initialInvoice?: string;
  initialAmountSats?: number;
  onClose: () => void;
}

type Tab = 'send' | 'receive';

export const BitcoinPaymentView: React.FC<BitcoinPaymentViewProps> = ({ mintUrl: initialMintUrl, initialTab = 'send', initialInvoice = '', initialAmountSats, onClose, page = false }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [mintUrl, setMintUrl] = useState(initialMintUrl);
  const [showScanner, setShowScanner] = useState(false);
  const [showAddressBook, setShowAddressBook] = useState(false);
  const [onchainLimits, setOnchainLimits] = useState<OnchainLimits | null>(null);
  const [received, setReceived] = useState<{ amount?: number; visible: boolean } | null>(null);
  const mintBalances = useWalletStore((s) => s.mintBalances);
  const availableBalance = mintBalances[mintUrl] || 0;
  const { transactions } = useHistory();
  const { paying: bitcoinPaying, requesting: bitcoinRequesting, payInvoice, receiveLightning, receiveOnChain, estimateOnChain, executeOnChain } = useBitcoin(mintUrl);

  const send = useBitcoinSend({
    active: activeTab === 'send', mintUrl, availableBalance,
    busy: bitcoinPaying || bitcoinRequesting, limits: onchainLimits, initialInvoice, initialAmountSats,
    // Read on an action, after the live validation hook below has rendered.
    readClipboard: readClipboardText,
    readValidation: destination => destination === parsedInput.addressOrInvoice ? lnurlValidation : null,
    resolveLnurl: validateLnurlPay, fetchInvoice: fetchLnurlPayInvoice,
    payInvoice: (invoice, mint, onError) => payInvoice(invoice, mint, { silent: true, onError }),
    estimate: (destination, amount, mint, onError) => estimateOnChain(destination, amount, mint, { silent: true, onError }),
    execute: (estimate, destination, mint, onError) => executeOnChain(estimate, destination, mint, { silent: true, onError }),
    onError: message => toast.error(message),
    recordSuccessfulUse: (type, destination) => useAddressBookStore.getState().recordSuccessfulUse(type, destination),
  });
  const {
    destination: destinationInput, amount: lnurlSendAmount, step: sendStep, parsedInput, isLnurlInput, isInsufficient,
    changeDestination: setDestinationInput, changeAmount: setLnurlSendAmount, paste: handlePasteDestination,
    estimate: onchainEstimate, fetching: isFetchingLnurl,
    payLightning: handlePayLightning, nextInput: handleNextFromInput, nextAmount: handleNextFromAmount,
    confirm: handleConfirmOnchain, cancel: cancelSend,
  } = send;
  const lnurlValidation = useLnurlValidation(isLnurlInput ? parsedInput.addressOrInvoice : null);
  const isLnurlBlocked = isLnurlInput && lnurlValidation.status !== 'valid';
  const receive = useBitcoinReceive({
    active: activeTab === 'receive', mintUrl, busy: bitcoinRequesting,
    limits: onchainLimits, transactions,
    receiveLightning: (amount, mint, onError) => receiveLightning(amount, mint, { silent: true, onError }),
    receiveOnChain: (amount, mint, onError) => receiveOnChain(amount, mint, { silent: true, onError }),
    copyText: writeClipboardText,
    onCopied: type => toast.success(type === 'uri' ? 'Copied Payment URI (auto-fills amount in Sparrow)!' : 'Copied to clipboard!'),
    onCopyError: () => toast.error('Failed to copy'),
    onRequestError: error => toast.error(error instanceof Error ? error.message : String(error)),
    onReceived: amount => setReceived({ amount, visible: true }),
    onReset: () => setReceived(null),
  });
  const {
    mode: receiveMode, amount: receiveAmount, amountSats: parsedReceiveAmount,
    invoice: receiveInvoice, address: boardingAddress, depositSats,
    feeEstimateSats: receiveFeeEstimateSats, success: receiveSuccess, copied, copiedType,
    requestDisabled: isReceiveDisabled, minOnchainSats: minReceiveOnchain, maxOnchainSats: maxReceiveOnchain,
    request: handleRequestInvoice, copy: handleCopy, cancel: cancelReceive,
  } = receive;
  const paying = bitcoinPaying || send.paying;
  const requesting = bitcoinRequesting || receive.requesting || send.estimating;
  const payment = activeTab === 'send' ? send.payment : {
    status: received?.visible ? 'success' as const : null, amountSats: received?.amount, title: 'Payment received',
    error: '', recipient: undefined, txid: undefined,
  };
  const { status: paymentStatus, error: paymentErrorMessage, amountSats: paymentAmount,
    recipient: paymentRecipient, title: paymentTitle, txid: onchainTxid } = payment;
  const handleClose = () => { cancelSend(); cancelReceive(); onClose(); };
  const { dragHandleProps, sheetStyle, backdropStyle, closeWithAnimation, isClosing } = useBottomSheet({ onClose: handleClose, modal: !page });
  useLayoutEffect(() => {
    if (isClosing) { cancelSend(); cancelReceive(); }
  }, [isClosing, cancelSend, cancelReceive]);
  useEffect(() => {
    if (!page) {
      cancelSend(); cancelReceive();
      navigate(initialTab === 'send' ? '/send-bitcoin' : '/receive-bitcoin', {
        state: { mintUrl: initialMintUrl, invoice: initialInvoice, amountSats: initialAmountSats },
      });
      onClose();
    }
  }, [page, initialTab, initialMintUrl, initialInvoice, initialAmountSats, navigate, onClose, cancelSend, cancelReceive]);

  // The two flows share limit data; only the active prefetch may publish a result.
  useEffect(() => {
    let retired = false;
    if ((parsedInput.type === 'onchain' || receiveMode === 'onchain') && !onchainLimits) {
      getOnchainSendLimits().then(limits => { if (!retired) setOnchainLimits(limits); })
        .catch(error => { if (!retired) console.error(error); });
    }
    return () => { retired = true; };
  }, [parsedInput.type, receiveMode, onchainLimits]);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'send') { cancelReceive(); send.reset(); setShowScanner(false); }
    else { cancelSend(); receive.reset(); }
  };

  const confirmAction = <BitcoinSendConfirmation paying={paying} onConfirm={handleConfirmOnchain} />;

  const receiveEntry = activeTab === 'receive' && !receiveSuccess && !receiveInvoice && !boardingAddress;
  const amountEntry = activeTab === 'send' && sendStep === 'amount';
  const back = () => {
    if (activeTab === 'send' && sendStep !== 'input') send.back();
    else handleClose();
  };
  const renderContent = (content: React.ReactNode) => page ? (
    <PaymentPageLayout
      className={`bitcoin-page ${receiveEntry ? "bitcoin-receive-entry" : amountEntry ? "bitcoin-send-amount" : activeTab === 'send' && sendStep === 'input' ? "bitcoin-send-input" : ""}`}
      bodyClassName="bitcoin-page-content"
      bodyLabel="Bitcoin payment"
      footer={activeTab === 'send' && sendStep === 'confirm' && onchainEstimate
        ? <div className="bitcoin-actions">{confirmAction}</div>
        : undefined}
      header={
        <PageHeader
          title={activeTab === 'send' ? sendStep === 'confirm' ? 'Review Bitcoin send' : 'Send Bitcoin' : 'Receive Bitcoin'}
          subtitle={activeTab === 'send' ? sendStep === 'confirm' ? 'Check the destination, amount and fees' : 'Pay a Lightning invoice or Bitcoin address' : 'Create a Lightning invoice or Bitcoin deposit'}
          sticky={false}
          onBack={back}
          backDisabled={paying || requesting || isFetchingLnurl}
          className="bitcoin-page-header"
        />
      }
    >
      {content}
    </PaymentPageLayout>
  ) : createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm"
      style={backdropStyle}
      onClick={closeWithAnimation}
    >
      {content}
    </div>,
    document.body,
  );
  return (
    <>
      {renderContent(
      <div
        onClick={e => e.stopPropagation()}
        style={page ? undefined : sheetStyle}
        className={page ? "bitcoin-sheet" : "bg-surface-container-high/95 backdrop-blur-xl rounded-t-[28px] sm:rounded-2xl w-full max-w-lg border-t border-x sm:border border-outline-variant/20 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col relative max-h-[92vh] pb-6 sm:pb-4"}
      >
        <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>

        {/* Drag Handle */}
        <div
          {...dragHandleProps}
          className="w-full flex justify-center pt-2.5 pb-1 relative z-10 cursor-grab active:cursor-grabbing sm:hidden"
        >
          <div className="w-12 h-1.5 bg-white/25 rounded-full transition-colors"></div>
        </div>

        {/* Header */}
        {!page && <div
          {...dragHandleProps}
          className="flex justify-between items-center px-5 sm:px-6 py-3 sm:py-4 border-b border-outline-variant/10 relative z-10 cursor-grab active:cursor-grabbing"
        >
          <h2 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
            <Bitcoin className="text-primary w-5 h-5" /> Bitcoin
          </h2>
          <button
            onClick={closeWithAnimation}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
          >
            <X size={18} />
          </button>
        </div>}

        {/* Tabs */}
        {!page && sendStep === 'input' && (
          <div className="relative flex border-b border-outline-variant/10 z-10 bg-surface-container-high/40 select-none">
            <button
              onClick={() => switchTab('send')}
              className={`flex-1 py-2.5 sm:py-3 text-[13px] sm:text-[14px] font-bold tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${activeTab === 'send'
                ? 'text-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-bright/20'
                }`}
            >
              <ArrowUp size={16} className={`transition-transform duration-200 ${activeTab === 'send' ? 'scale-110 text-primary' : ''}`} />
              <span>SEND</span>
            </button>
            <button
              onClick={() => switchTab('receive')}
              className={`flex-1 py-2.5 sm:py-3 text-[13px] sm:text-[14px] font-bold tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${activeTab === 'receive'
                ? 'text-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-bright/20'
                }`}
            >
              <ArrowDown size={16} className={`transition-transform duration-200 ${activeTab === 'receive' ? 'scale-110 text-primary' : ''}`} />
              <span>RECEIVE</span>
            </button>

            {/* Gliding active indicator */}
            <div
              className="absolute bottom-0 left-0 h-[2.5px] bg-primary shadow-[0_0_12px_rgba(242,169,59,0.7)] rounded-t-full transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] w-1/2 pointer-events-none"
              style={{
                transform: `translate3d(${activeTab === 'send' ? '0%' : '100%'}, 0, 0)`
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="bitcoin-body p-4 sm:p-6 flex flex-col gap-3.5 sm:gap-4 relative z-10 overflow-y-auto overflow-x-hidden flex-1">
          {page ? ((activeTab === 'send' && sendStep !== 'confirm') || receiveEntry) && <div className="bitcoin-mint-row flex items-stretch gap-2">
            <div className="flex-1 min-w-0"><MintBalancePicker mintUrl={mintUrl} balances={mintBalances} onSelect={setMintUrl} disabled={paying || requesting || isFetchingLnurl || Boolean(receiveInvoice || boardingAddress) || (activeTab === 'send' && sendStep === 'confirm')} /></div>
          </div> : <>
          {/* Mint info */}
          <div className="flex flex-col gap-1.5 sm:gap-2">
            <p className="text-body-md font-body-md text-on-surface-variant">
              {activeTab === 'send'
                ? 'Pay from:'
                : (receiveSuccess ? 'Lightning received to:' : receiveInvoice ? 'Waiting for payment to:' : 'Receive lightning to:')}
            </p>
            <MintBalancePicker
              mintUrl={mintUrl}
              balances={mintBalances}
              onSelect={setMintUrl}
            />
          </div>
          </>}

          <div
            key={activeTab}
            className={`bitcoin-flow flex flex-col gap-4 ${activeTab === 'receive' ? 'animate-tab-from-right' : 'animate-tab-from-left'
              }`}
          >
            {activeTab === 'send' ? (
              /* ─── SEND TAB ──────────────────────────────── */
              <div className="bitcoin-send-form flex flex-col gap-4">
                {sendStep === 'input' && (
                  <BitcoinDestinationEntry
                    page={page} value={destinationInput} scannerVisible={showScanner}
                    parsedInput={parsedInput} lnurlValidation={lnurlValidation}
                    insufficientBalance={isInsufficient} lnurlInput={isLnurlInput} lnurlBlocked={isLnurlBlocked}
                    paying={paying} fetchingInvoice={isFetchingLnurl} minOnchainSats={onchainLimits?.min_sats ?? 2500}
                    onChange={setDestinationInput} onPaste={handlePasteDestination}
                    onOpenScanner={() => setShowScanner(true)} onCloseScanner={() => setShowScanner(false)}
                    onOpenAddressBook={() => setShowAddressBook(true)}
                    onPayInvoice={handlePayLightning} onNext={handleNextFromInput}
                    scanner={
                      <Scanner
                        onScan={(result) => {
                          if (result && result.length > 0) {
                            setDestinationInput(result[0].rawValue);
                            setShowScanner(false);
                          }
                        }}
                        onError={(e) => toast.error(e.message)}
                      />
                    }
                  />
                )}

                {sendStep === 'amount' && (() => {
                  const typedAmount = parseInt(lnurlSendAmount) || 0;
                  const isOnchain = parsedInput.type === 'onchain';
                  const minLimit = isOnchain ? (onchainLimits?.min_sats ?? 2500) : 1;
                  const maxLimit = isOnchain ? (onchainLimits?.max_sats ?? 100000000) : availableBalance;
                  const isBelowMin = isOnchain && typedAmount > 0 && typedAmount < minLimit;
                  const isAboveMax = isOnchain && typedAmount > maxLimit;
                  const isAboveBalance = typedAmount > availableBalance;
                  const canProceed = typedAmount > 0 && !isBelowMin && !isAboveMax && !isAboveBalance;

                  return (
                    <div className="bitcoin-send-amount-form flex flex-col gap-4 animate-fade-in">
                      <div className="bitcoin-step-caption flex items-center justify-between mb-1">
                        <button onClick={send.back} className="text-on-surface-variant hover:text-on-surface text-sm font-bold cursor-pointer">← Back</button>
                        <p className="text-label-caps font-label-caps text-on-surface-variant">
                          {isOnchain ? 'SEND ON-CHAIN' : 'SEND AMOUNT'}
                        </p>
                      </div>

                      <div className="bitcoin-amount-display flex flex-col gap-2 items-center">
                        <AmountDisplay amount={lnurlSendAmount} compact />

                        {/* On-Chain Limits and Real-Time Feedback */}
                        {isOnchain && (
                          <div className="flex flex-col items-center gap-1.5 w-full">
                            {/* Real-time typing alerts */}
                            {typedAmount > 0 && isBelowMin && (
                              <div className="text-[12px] font-medium text-amber-400 bg-amber-500/15 px-3 py-1.5 rounded-lg border border-amber-500/30 text-center animate-fade-in flex items-center justify-center gap-1.5 shadow-sm">
                                <span>⚠️ Minimum on-chain send is {minLimit.toLocaleString()} sats ({(minLimit - typedAmount).toLocaleString()} more needed)</span>
                              </div>
                            )}
                            {typedAmount > 0 && isAboveMax && (
                              <div className="text-[12px] font-medium text-error bg-error/15 px-3 py-1.5 rounded-lg border border-error/30 text-center animate-fade-in flex items-center justify-center gap-1.5 shadow-sm">
                                <span>⚠️ Exceeds maximum on-chain limit of {maxLimit.toLocaleString()} sats</span>
                              </div>
                            )}
                            {typedAmount > 0 && !isAboveMax && isAboveBalance && (
                              <div className="text-[12px] font-medium text-error bg-error/15 px-3 py-1.5 rounded-lg border border-error/30 text-center animate-fade-in flex items-center justify-center gap-1.5 shadow-sm">
                                <span>⚠️ Insufficient balance ({availableBalance.toLocaleString()} sats available)</span>
                              </div>
                            )}
                          </div>
                        )}

                        {!isOnchain && isAboveBalance && (
                          <span className="text-[12px] font-label-caps text-error text-center mt-1">Insufficient Balance</span>
                        )}
                      </div>

                      <div className="bitcoin-keypad" role="group" aria-label="Send amount keypad"><NumberPad
                        value={lnurlSendAmount}
                        disabled={requesting || isFetchingLnurl || paying}
                        onChange={setLnurlSendAmount}
                        compact
                      /></div>

                      <button
                        onClick={handleNextFromAmount}
                        disabled={!canProceed || requesting || isFetchingLnurl}
                        className={`bitcoin-primary mt-2 bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary font-headline-lg-mobile text-[16px] sm:text-[18px] w-full py-4 rounded-2xl shadow-lg transition-all duration-200 flex justify-center items-center cursor-pointer ${(!canProceed || requesting || isFetchingLnurl) ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                          }`}
                      >
                        {isFetchingLnurl || requesting ? (
                          <Loader2 className="animate-spin w-6 h-6" />
                        ) : isOnchain ? (
                          typedAmount === 0 ? (
                            `Enter Amount (Min ${minLimit.toLocaleString()} sats)`
                          ) : isBelowMin ? (
                            `Min is ${minLimit.toLocaleString()} sats`
                          ) : isAboveMax ? (
                            `Exceeds Max Limit`
                          ) : isAboveBalance ? (
                            'Insufficient Balance'
                          ) : (
                            'Review On-Chain Send'
                          )
                        ) : (
                          'Pay Lightning'
                        )}
                      </button>
                    </div>
                  );
                })()}

                {sendStep === 'confirm' && onchainEstimate && (
                  <BitcoinSendReview
                    page={page} mintUrl={mintUrl} destination={parsedInput.addressOrInvoice}
                    amountSats={onchainEstimate.amount} networkFeeSats={onchainEstimate.ark_fee}
                    mintFeeSats={onchainEstimate.cashu_fee} totalSats={onchainEstimate.total_cost}
                    onBack={send.back} confirmation={confirmAction}
                  />
                )}
              </div>
            ) : (
              /* ─── RECEIVE TAB ─────────────────────────────── */
              <BitcoinReceive
                success={receiveSuccess} invoice={receiveInvoice} address={boardingAddress}
                mode={receiveMode} amount={receiveAmount} amountSats={parsedReceiveAmount}
                mintUrl={mintUrl} depositSats={depositSats} feeEstimateSats={receiveFeeEstimateSats}
                copied={copied} copiedType={copiedType} requesting={requesting}
                requestDisabled={isReceiveDisabled} minOnchainSats={minReceiveOnchain} maxOnchainSats={maxReceiveOnchain}
                onDone={handleClose} onCopy={handleCopy} onRequest={handleRequestInvoice}
                onInvoiceBack={cancelReceive}
                onAddressBack={cancelReceive}
                onTrackAddress={openMempoolAddress}
                onModeChange={receive.changeMode}
                onAmountChange={receive.changeAmount}
              />
            )}
          </div>
        </div>
        {isFetchingLnurl && (
          <FullScreenLoader title="Generating Invoice..." message="Resolving address and fetching Lightning invoice..." />
        )}
        {requesting && (
          <FullScreenLoader title="Generating Invoice..." message="Requesting Lightning invoice from mint..." />
        )}
        {paying && (
          <FullScreenLoader title="Sending Payment..." message="Routing payment through the Lightning network..." />
        )}
        <SovereignStampOverlay
          status={paymentStatus}
          amountSats={paymentAmount}
          recipient={paymentRecipient}
          title={paymentTitle}
          txid={onchainTxid ?? undefined}
          onViewMempool={onchainTxid ? () => openMempoolTx(onchainTxid) : undefined}
          errorMessage={paymentErrorMessage}
          onDismiss={() => {
            if (activeTab === 'send') send.dismissPayment();
            else setReceived(previous => previous ? { ...previous, visible: false } : null);
            if (paymentStatus === 'success' && !page) handleClose();
          }}
          onRetry={activeTab === 'send' ? send.retry : undefined}
        />
          </div>
      )}

      <AddressBookPickerModal
        isOpen={showAddressBook}
        onClose={() => setShowAddressBook(false)}
        type="bitcoin"
        onSelect={(contact) => {
          setDestinationInput(contact.value);
        }}
      />
    </>
  );
};
