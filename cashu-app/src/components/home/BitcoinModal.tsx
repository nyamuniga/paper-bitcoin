import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Loader2, Zap, Bitcoin, ArrowUp, ArrowDown, QrCode, ChevronDown } from 'lucide-react';
import { OnchainSendEstimate, OnchainLimits, getOnchainSendLimits } from '../../services/fixedFloatService';

import { toast } from 'react-hot-toast';
import { useWalletStore } from '../../store/wallet';
import { useBitcoin } from '../../hooks/useBitcoin';
import { useHistory } from '../../hooks/useHistory';

import { SovereignStampOverlay, StampPaymentStatus } from '../shared/SovereignStampOverlay';
import { FullScreenLoader } from '../shared/FullScreenLoader';
import { MintIcon } from '../shared/MintIcon';
import { MintName } from '../shared/MintName';
import { createPortal } from 'react-dom';
import { AmountDisplay } from '../shared/AmountDisplay';
import { NumberPad } from '../shared/NumberPad';
import QRCode from 'react-qr-code';
import { Scanner } from '@yudiel/react-qr-scanner';
import { parseBitcoinInput } from '../../utils/bitcoinValidation';
import { resolveLnurlPay, fetchLnurlPayInvoice } from '../../services/lnurlService';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { openMempoolTx, openMempoolAddress } from '../../utils/mempool';

interface BitcoinModalProps {
  mintUrl: string;
  initialTab?: 'send' | 'receive';
  initialInvoice?: string;
  onClose: () => void;
}

type Tab = 'send' | 'receive';
type SendStep = 'input' | 'amount' | 'confirm';
type ReceiveMode = 'lightning' | 'onchain';

export const BitcoinModal: React.FC<BitcoinModalProps> = ({ mintUrl: initialMintUrl, initialTab = 'send', initialInvoice = '', onClose }) => {
  const { dragHandleProps, sheetStyle, backdropStyle, closeWithAnimation } = useBottomSheet({ onClose });
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [mintUrl, setMintUrl] = useState(initialMintUrl);
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
    if (showMintDropdown) {
      closeMintDropdown();
    } else {
      setShowMintDropdown(true);
    }
  };

  // Send state
  const [destinationInput, setDestinationInput] = useState(initialInvoice);
  const [showScanner, setShowScanner] = useState(false);
  const parsedInput = parseBitcoinInput(destinationInput);

  const [lnurlParams, setLnurlParams] = useState<any | null>(null);

  const [lnurlSendAmount, setLnurlSendAmount] = useState('');
  const [isFetchingLnurl, setIsFetchingLnurl] = useState(false);
  const [sendStep, setSendStep] = useState<SendStep>('input');
  const [onchainEstimate, setOnchainEstimate] = useState<OnchainSendEstimate | null>(null);
  const [onchainLimits, setOnchainLimits] = useState<OnchainLimits | null>(null);

  // Receive state
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>('lightning');
  const [receiveAmount, setReceiveAmount] = useState('');
  const parsedReceiveAmount = parseInt(receiveAmount) || 0;
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [receiveInvoice, setReceiveInvoice] = useState<string | null>(null);
  const [boardingAddress, setBoardingAddress] = useState<string | null>(null);
  const [depositSats, setDepositSats] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);


  const mintBalances = useWalletStore((s) => s.mintBalances);
  const mintUrls = Object.keys(mintBalances || {});
  const availableBalance = mintBalances[mintUrl] || 0;

  const { transactions } = useHistory();
  const { paying, requesting, payInvoice, receiveLightning, receiveOnChain, estimateOnChain, executeOnChain } = useBitcoin(mintUrl);


  const currentTx = quoteId ? transactions.find(t => t.id === quoteId) : null;
  const receiveSuccess = currentTx?.status === 'Success';

  const [paymentStatus, setPaymentStatus] = useState<StampPaymentStatus | null>(null);
  const [paymentErrorMessage, setPaymentErrorMessage] = useState('');
  const [paymentAmount, setPaymentAmount] = useState<number | undefined>(undefined);
  const [paymentRecipient, setPaymentRecipient] = useState<string | undefined>(undefined);
  const [paymentTitle, setPaymentTitle] = useState<string | undefined>(undefined);
  const [onchainTxid, setOnchainTxid] = useState<string | null>(null);
  const [lastPayAction, setLastPayAction] = useState<(() => void) | undefined>(undefined);
  const [hasTriggeredReceiveCelebration, setHasTriggeredReceiveCelebration] = useState(false);

  // Preload on-chain limits when an on-chain address is detected
  useEffect(() => {
    if (parsedInput.type === 'onchain' && !onchainLimits) {
      getOnchainSendLimits().then(setOnchainLimits).catch(console.error);
    }
  }, [parsedInput.type, onchainLimits]);

  // Trigger sovereign stamp celebration when an incoming invoice is settled
  useEffect(() => {
    if (receiveSuccess && !hasTriggeredReceiveCelebration) {
      setHasTriggeredReceiveCelebration(true);
      setPaymentTitle('Payment received');
      setPaymentAmount(parsedReceiveAmount || currentTx?.amount);
      setPaymentStatus('success');
    }
  }, [receiveSuccess, hasTriggeredReceiveCelebration, parsedReceiveAmount, currentTx]);

  const isInsufficient = (parsedInput.type === 'lightning' && parsedInput.amountSats !== null)
    ? parsedInput.amountSats > availableBalance
    : false;

  const handlePayLightning = async () => {
    if (parsedInput.type !== 'lightning' || !parsedInput.addressOrInvoice || isInsufficient) return;
    setPaymentErrorMessage('');
    setPaymentAmount(parsedInput.amountSats || undefined);
    setPaymentTitle('Payment sent');
    setLastPayAction(() => handlePayLightning);
    let mintErr = '';
    const success = await payInvoice(parsedInput.addressOrInvoice, undefined, {
      silent: true,
      onError: (msg) => { mintErr = msg; }
    });
    if (success) {
      setPaymentStatus('success');
    } else {
      setPaymentErrorMessage(mintErr || 'The mint could not complete this payment.');
      setPaymentStatus('failed');
    }
  };

  const handleNextFromInput = async () => {
    if (parsedInput.type === 'onchain') {
      if (!onchainLimits) {
        getOnchainSendLimits().then(setOnchainLimits).catch(console.error);
      }
      setSendStep('amount');
    } else if (parsedInput.type === 'lnurl' || parsedInput.type === 'lnurl-pay') {
      try {
        setIsFetchingLnurl(true);
        const params = await resolveLnurlPay(parsedInput.addressOrInvoice);
        setLnurlParams(params);
        if (params.minSendable === params.maxSendable) {
          setLnurlSendAmount(Math.floor(params.minSendable / 1000).toString());
        }
        setSendStep('amount');
      } catch (e: any) {
        toast.error(`LNURL Error: ${e.message}`);
      } finally {
        setIsFetchingLnurl(false);
      }
    }
  };

  const handleNextFromAmount = async () => {
    const amt = parseInt(lnurlSendAmount) || 0;
    if (amt <= 0) return;

    if (amt > availableBalance) {
      toast.error('Insufficient balance to send this amount');
      return;
    }

    if (parsedInput.type === 'onchain' && parsedInput.addressOrInvoice) {
      const minLimit = onchainLimits?.min_sats ?? 12500;
      const maxLimit = onchainLimits?.max_sats ?? 150000000;
      if (amt < minLimit) {
        toast.error(`Minimum on-chain send is ${minLimit.toLocaleString()} sats`);
        return;
      }
      if (amt > maxLimit) {
        toast.error(`Maximum on-chain send is ${maxLimit.toLocaleString()} sats`);
        return;
      }
      const estimate = await estimateOnChain(parsedInput.addressOrInvoice, amt);
      if (estimate) {
        setOnchainEstimate(estimate);
        setSendStep('confirm');
      }
      return;
    }

    if (lnurlParams) {
      setIsFetchingLnurl(true);
      setPaymentErrorMessage('');
      setPaymentAmount(amt);
      setPaymentRecipient(parsedInput.addressOrInvoice);
      setPaymentTitle('Payment sent');
      setLastPayAction(() => handleNextFromAmount);
      try {
        const invoiceData = await fetchLnurlPayInvoice(lnurlParams.callback, amt * 1000);
        let mintErr = '';
        const success = await payInvoice(invoiceData.pr, undefined, {
          silent: true,
          onError: (msg) => { mintErr = msg; }
        });
        if (success) {
          setPaymentStatus('success');
        } else {
          setPaymentErrorMessage(mintErr || 'The mint could not complete this payment.');
          setPaymentStatus('failed');
        }
      } catch (e: any) {
        setPaymentErrorMessage(e?.message || 'LNURL payment failed.');
        setPaymentStatus('failed');
      } finally {
        setIsFetchingLnurl(false);
      }
      return;
    }
  };

  const handleConfirmOnchain = async () => {
    if (!onchainEstimate || !parsedInput.addressOrInvoice) return;
    setPaymentErrorMessage('');
    setPaymentAmount(onchainEstimate.amount);
    setPaymentRecipient(parsedInput.addressOrInvoice);
    setPaymentTitle('Payment sent');
    setOnchainTxid(null);
    setLastPayAction(() => handleConfirmOnchain);
    try {
      const res = await executeOnChain(onchainEstimate, parsedInput.addressOrInvoice);
      if (res && res.txid) {
        setOnchainTxid(res.txid);
        setPaymentStatus('success');
      } else {
        setPaymentErrorMessage('On-chain transaction execution failed.');
        setPaymentStatus('failed');
      }
    } catch (e: any) {
      setPaymentErrorMessage(e?.message || 'On-chain transaction failed.');
      setPaymentStatus('failed');
    }
  };

  const handleRequestInvoice = async () => {
    if (receiveMode === 'onchain') {
      const amt = parsedReceiveAmount >= 12500 ? parsedReceiveAmount : 12500;
      const res = await receiveOnChain(amt);
      if (res) {
        setBoardingAddress(res.boardingAddress);
        setDepositSats(res.amountSats || amt);
        if (res.quoteId) {
          setQuoteId(res.quoteId);
        }
      }
      return;
    }

    if (parsedReceiveAmount <= 0) return;
    const res = await receiveLightning(parsedReceiveAmount);
    if (res) {
      setQuoteId(res.quoteId);
      setReceiveInvoice(res.receiveInvoice);
    }
  };

  const [copiedType, setCopiedType] = useState<string | null>(null);

  const handleCopy = async (text: string, type: string = 'text') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopiedType(type);
      toast.success(type === 'uri' ? 'Copied Payment URI (auto-fills amount in Sparrow)!' : 'Copied to clipboard!');
      setTimeout(() => {
        setCopied(false);
        setCopiedType(null);
      }, 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'send') {
      setDestinationInput('');
      setShowScanner(false);
      setSendStep('input');
    } else {
      setReceiveAmount('');
      setQuoteId(null);
      setReceiveInvoice(null);
      setBoardingAddress(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm"
      style={backdropStyle}
      onClick={closeWithAnimation}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={sheetStyle}
        className="bg-surface-container-high/95 backdrop-blur-xl rounded-t-[28px] sm:rounded-2xl w-full max-w-lg border-t border-x sm:border border-outline-variant/20 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col relative max-h-[92vh] pb-6 sm:pb-4"
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
        <div
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
        </div>

        {/* Tabs */}
        {sendStep === 'input' && (
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
        <div className="p-4 sm:p-6 flex flex-col gap-3.5 sm:gap-4 relative z-10 overflow-y-auto overflow-x-hidden flex-1">
          {/* Mint info */}
          <div className="flex flex-col gap-1.5 sm:gap-2">
            <p className="text-body-md font-body-md text-on-surface-variant">
              {activeTab === 'send'
                ? 'Pay from:'
                : (receiveSuccess ? 'Lightning received to:' : receiveInvoice ? 'Waiting for payment to:' : 'Receive lightning to:')}
            </p>
            <div className="relative">
              {showMintDropdown && (
                <div className="fixed inset-0 z-40" onClick={closeMintDropdown}></div>
              )}
              <button
                onClick={toggleMintDropdown}
                className="w-full flex items-center justify-between bg-surface-container-highest p-2.5 sm:p-3 rounded-xl border border-outline-variant/10 hover:bg-surface-bright transition-colors relative z-50 cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0 pr-4">
                  <MintIcon mintUrl={mintUrl} className="w-6 h-6 flex-shrink-0 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30" textClassName="text-primary text-[10px] font-bold" />
                  <MintName mintUrl={mintUrl} className="text-body-md font-body-md text-on-surface font-medium truncate" />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
                  <span className="text-body-md font-body-md font-semibold text-on-surface">₿{availableBalance.toLocaleString()}</span>
                  <ChevronDown
                    size={16}
                    className={`flex-shrink-0 transition-transform duration-300 ease-out ${showMintDropdown && !isClosingMintDropdown ? 'rotate-180 text-primary' : 'text-on-surface-variant'
                      }`}
                  />
                </div>
              </button>

              {showMintDropdown && (
                <div className={`absolute top-full left-0 right-0 mt-2 bg-surface-container-highest rounded-2xl shadow-[0_16px_48px_-8px_rgba(0,0,0,0.7)] border border-outline-variant/20 overflow-hidden flex flex-col z-50 max-h-[250px] overflow-y-auto ${isClosingMintDropdown ? 'animate-dropdown-collapse' : 'animate-dropdown-expand'
                  }`}>
                  {mintUrls.map((m, index) => (
                    <button
                      key={m}
                      style={{ animationDelay: `${index * 30}ms` }}
                      onClick={() => { setMintUrl(m); closeMintDropdown(); }}
                      className="flex items-center justify-between p-3 hover:bg-surface-bright transition-colors text-left w-full border-b border-outline-variant/10 last:border-b-0 animate-dropdown-item cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <MintIcon mintUrl={m} className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0" textClassName="text-primary text-[10px] font-bold" />
                        <MintName mintUrl={m} className="text-body-sm font-body-sm text-on-surface truncate" />
                        {mintUrl === m && <Check size={14} className="text-primary flex-shrink-0" />}
                      </div>
                      <span className="text-body-sm font-body-sm font-bold text-on-surface flex-shrink-0">₿{(mintBalances![m] || 0).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div
            key={activeTab}
            className={`flex flex-col gap-4 ${activeTab === 'receive' ? 'animate-tab-from-right' : 'animate-tab-from-left'
              }`}
          >
            {activeTab === 'send' ? (
              /* ─── SEND TAB ──────────────────────────────── */
              <div className="flex flex-col gap-4">
                {sendStep === 'input' && (
                  <div className="relative flex flex-col gap-2">
                    {showScanner ? (
                      <div className="relative rounded-xl overflow-hidden border border-outline-variant/30 aspect-square">
                        <Scanner
                          onScan={(result) => {
                            if (result && result.length > 0) {
                              setDestinationInput(result[0].rawValue);
                              setShowScanner(false);
                            }
                          }}
                          onError={(e) => toast.error(e.message)}
                        />
                        <button onClick={() => setShowScanner(false)} className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-surface-container-highest px-4 py-2 rounded-full text-label-caps font-label-caps text-on-surface-variant hover:text-on-surface">Cancel Scanner</button>
                      </div>
                    ) : (
                      <div className={`relative glow-effect transition-shadow duration-300 rounded-lg ${isInsufficient ? 'shadow-[0_0_15px_rgba(239,68,68,0.3)]' : ''}`}>
                        <textarea
                          value={destinationInput}
                          onChange={(e) => setDestinationInput(e.target.value)}
                          className={`w-full bg-surface-container-lowest text-on-surface font-label-caps text-label-caps p-4 pr-12 rounded-lg border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:outline-none resize-none placeholder:text-on-surface-variant/50 ${isInsufficient ? 'focus:ring-error ring-1 ring-error/50' : 'focus:ring-primary'}`}
                          placeholder="Lightning, LNURL, or On-Chain..."
                          rows={4}
                          spellCheck={false}
                        />
                        <button
                          onClick={() => setShowScanner(true)}
                          className="absolute right-3 top-3 p-2 bg-surface-container-highest rounded-lg text-primary hover:bg-surface-bright transition-colors"
                          title="Scan QR Code"
                        >
                          <QrCode size={20} />
                        </button>
                      </div>
                    )}
                    {parsedInput.type === 'lightning' && parsedInput.amountSats !== null && !showScanner && (
                      <div className={`text-[12px] font-label-caps px-1 ${isInsufficient ? 'text-error' : 'text-on-surface-variant'}`}>
                        Invoice Amount: ₿{parsedInput.amountSats.toLocaleString()}
                        {isInsufficient && ' (Insufficient balance)'}
                      </div>
                    )}
                    {parsedInput.type === 'onchain' && destinationInput.length > 0 && !showScanner && (
                      <div className="flex items-center justify-between text-[12px] font-mono px-3 py-2 rounded-lg bg-surface-container-highest border border-outline-variant/20 text-on-surface-variant">
                        <span>On-Chain Bitcoin Address</span>
                        <span className="text-primary font-semibold">
                          Min: {(onchainLimits?.min_sats ?? 12500).toLocaleString()} sats
                        </span>
                      </div>
                    )}
                    {parsedInput.type === 'invalid' && destinationInput.length > 0 && !showScanner && (
                      <div className="text-[12px] font-label-caps px-1 text-error">
                        Invalid invoice or address
                      </div>
                    )}

                    {parsedInput.type === 'lightning' ? (
                      <button
                        onClick={handlePayLightning}
                        disabled={paying || !destinationInput || isInsufficient}
                        className={`mt-2 bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-2xl shadow-lg transition-all duration-200 flex justify-center items-center cursor-pointer ${paying || !destinationInput || isInsufficient ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                          }`}
                      >
                        {paying ? <Loader2 className="animate-spin w-6 h-6" /> : <><Zap className="w-5 h-5 mr-2" /> Pay Invoice</>}
                      </button>
                    ) : (
                      <button
                        onClick={handleNextFromInput}
                        disabled={parsedInput.type !== 'lnurl' && parsedInput.type !== 'lnurl-pay' && parsedInput.type !== 'onchain'}
                        className={`mt-2 bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-2xl shadow-lg transition-all duration-200 flex justify-center items-center cursor-pointer ${(parsedInput.type !== 'lnurl' && parsedInput.type !== 'lnurl-pay' && parsedInput.type !== 'onchain') ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                          }`}
                      >
                        {isFetchingLnurl ? <Loader2 className="animate-spin w-6 h-6" /> : 'Next'}
                      </button>
                    )}
                  </div>
                )}

                {sendStep === 'amount' && (() => {
                  const typedAmount = parseInt(lnurlSendAmount) || 0;
                  const isOnchain = parsedInput.type === 'onchain';
                  const minLimit = isOnchain ? (onchainLimits?.min_sats ?? 12500) : 1;
                  const maxLimit = isOnchain ? (onchainLimits?.max_sats ?? 150000000) : availableBalance;
                  const isBelowMin = isOnchain && typedAmount > 0 && typedAmount < minLimit;
                  const isAboveMax = isOnchain && typedAmount > maxLimit;
                  const isAboveBalance = typedAmount > availableBalance;
                  const canProceed = typedAmount > 0 && !isBelowMin && !isAboveMax && !isAboveBalance;

                  return (
                    <div className="flex flex-col gap-4 animate-fade-in">
                      <div className="flex items-center justify-between mb-1">
                        <button onClick={() => setSendStep('input')} className="text-on-surface-variant hover:text-on-surface text-sm font-bold cursor-pointer">← Back</button>
                        <p className="text-label-caps font-label-caps text-on-surface-variant">
                          {isOnchain ? 'SEND ON-CHAIN (BITCOIN)' : 'SEND AMOUNT'}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 items-center">
                        <AmountDisplay amount={lnurlSendAmount} compact />

                        {/* On-Chain Limits and Real-Time Feedback */}
                        {isOnchain && (
                          <div className="flex flex-col items-center gap-1.5 w-full">
                            {/* Limits Pills */}
                            <div className="flex items-center justify-center gap-2 text-[12px] font-mono py-1 px-3.5 rounded-full bg-surface-container-highest/80 border border-outline-variant/30 text-on-surface-variant shadow-sm">
                              <span>Min: <strong className="text-primary font-bold">{minLimit.toLocaleString()} sats</strong></span>
                              <span className="text-outline-variant/40">•</span>
                              <span>Max: <strong className="text-on-surface font-bold">{Math.min(maxLimit, availableBalance).toLocaleString()} sats</strong></span>
                            </div>

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
                            {typedAmount > 0 && canProceed && (
                              <div className="text-[12px] font-medium text-emerald-400 bg-emerald-500/15 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-center animate-fade-in flex items-center justify-center gap-1.5 shadow-sm">
                                <span>✓ Amount is within on-chain limits</span>
                              </div>
                            )}
                          </div>
                        )}

                        {!isOnchain && isAboveBalance && (
                          <span className="text-[12px] font-label-caps text-error text-center mt-1">Insufficient Balance</span>
                        )}
                      </div>

                      <NumberPad
                        value={lnurlSendAmount}
                        onChange={setLnurlSendAmount}
                        compact
                      />

                      {/* Quick preset buttons for on-chain send */}
                      {isOnchain && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setLnurlSendAmount(minLimit.toString())}
                            className="flex-1 py-2 px-3 bg-surface-container-highest hover:bg-surface-bright rounded-xl text-xs font-bold text-primary border border-outline-variant/30 transition-all active:scale-[0.98] cursor-pointer shadow-sm flex items-center justify-center gap-1"
                          >
                            <span>Fill Min ({minLimit.toLocaleString()})</span>
                          </button>
                          {availableBalance >= minLimit && (
                            <button
                              type="button"
                              onClick={() => setLnurlSendAmount(Math.min(maxLimit, availableBalance).toString())}
                              className="flex-1 py-2 px-3 bg-surface-container-highest hover:bg-surface-bright rounded-xl text-xs font-bold text-on-surface-variant hover:text-on-surface border border-outline-variant/30 transition-all active:scale-[0.98] cursor-pointer shadow-sm flex items-center justify-center gap-1"
                            >
                              <span>Fill Max ({Math.min(maxLimit, availableBalance).toLocaleString()})</span>
                            </button>
                          )}
                        </div>
                      )}

                      <button
                        onClick={handleNextFromAmount}
                        disabled={!canProceed || requesting || isFetchingLnurl}
                        className={`mt-2 bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary font-headline-lg-mobile text-[16px] sm:text-[18px] w-full py-4 rounded-2xl shadow-lg transition-all duration-200 flex justify-center items-center cursor-pointer ${(!canProceed || requesting || isFetchingLnurl) ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
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
                  <div className="flex-1 overflow-y-auto flex flex-col pt-4 animate-fade-in">
                    <div className="flex items-center justify-between mb-6">
                      <button onClick={() => setSendStep('amount')} className="text-on-surface-variant hover:text-on-surface text-sm font-bold">← Back</button>
                      <p className="text-label-caps font-label-caps text-on-surface-variant">CONFIRM SEND</p>
                    </div>
                    <div className="flex-1 flex flex-col justify-start items-center px-4 mx-auto w-full">
                      <div className="text-center mb-8 w-full">
                        <div className="text-on-surface-variant text-[14px] mb-2 font-medium">Sending to</div>
                        <div className="text-on-surface text-[14px] break-all w-full mx-auto font-mono bg-surface-container-high p-3 rounded-lg border border-outline-variant/30">
                          {parsedInput.addressOrInvoice}
                        </div>
                      </div>

                      <div className="w-full bg-surface-container rounded-[24px] p-6 mb-8 flex flex-col gap-4 border border-outline-variant/20">
                        <div className="flex justify-between items-center">
                          <span className="text-on-surface-variant font-medium text-[15px]">Target Amount</span>
                          <span className="text-on-surface font-bold text-[15px]">{onchainEstimate.amount.toLocaleString()} sats</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-on-surface-variant font-medium text-[15px]">Fee</span>
                          <span className="text-on-surface font-bold text-[15px]">{onchainEstimate.ark_fee.toLocaleString()} sats</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-on-surface-variant font-medium text-[15px]">Lightning Routing</span>
                          <span className="text-on-surface font-bold text-[15px]">{onchainEstimate.cashu_fee.toLocaleString()} sats</span>
                        </div>
                        <div className="h-[1px] bg-outline-variant/50 w-full my-1"></div>
                        <div className="flex justify-between items-center">
                          <span className="text-on-surface-variant font-medium text-[16px]">Total Deducted</span>
                          <span className="text-on-surface font-bold text-[18px]">{(onchainEstimate.total_cost).toLocaleString()} sats</span>
                        </div>
                      </div>

                      <button
                        onClick={handleConfirmOnchain}
                        disabled={paying}
                        className="w-full bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary py-4 rounded-2xl font-bold text-[16px] tracking-wide transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] shadow-lg cursor-pointer"
                      >
                        {paying ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Sending On-Chain...</span>
                          </>
                        ) : (
                          <span>Confirm & Send</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ─── RECEIVE TAB ─────────────────────────────── */
              receiveSuccess ? (
                <div className="flex flex-col items-center gap-5">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                    <Check size={32} className="text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-label-caps font-label-caps text-on-surface-variant mb-1">RECEIVED</p>
                    <p className="text-[28px] font-display-lg text-emerald-400">₿{parsedReceiveAmount.toLocaleString()}</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-full py-3.5 sm:py-4 rounded-2xl bg-primary/15 text-primary font-bold text-[15px] hover:bg-primary/25 transition-colors border border-primary/20 cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              ) : receiveInvoice ? (
                /* Show invoice QR */
                <div className="flex flex-col items-center gap-5">
                  <div className="text-center">
                    <p className="text-label-caps font-label-caps text-on-surface-variant mb-1">AMOUNT</p>
                    <p className="text-[28px] font-display-lg text-primary">₿{parsedReceiveAmount.toLocaleString()}</p>
                  </div>

                  <div className="relative">
                    <div className="bg-white p-4 rounded-xl shadow-lg">
                      <QRCode value={receiveInvoice} size={200} />
                    </div>
                    <div className="absolute inset-0 bg-primary/20 rounded-xl blur-xl -z-10 animate-pulse"></div>
                  </div>

                  <div className="w-full flex flex-col gap-2">
                    <div
                      onClick={() => handleCopy(receiveInvoice)}
                      className="w-full bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 shadow-inner cursor-pointer hover:border-primary/30 transition-colors"
                    >
                      <p className="text-[11px] font-mono text-on-surface-variant break-all line-clamp-3 select-all">{receiveInvoice}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopy(receiveInvoice)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary/15 text-primary font-bold text-[15px] hover:bg-primary/25 transition-colors border border-primary/20 cursor-pointer"
                      >
                        {copied ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> Copy Invoice</>}
                      </button>
                      <button
                        onClick={() => setReceiveInvoice(null)}
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
              ) : boardingAddress ? (
                /* Show ASP Boarding QR */
                <div className="flex flex-col items-center gap-5">
                  <div className="text-center">
                    <p className="text-[20px] font-display-sm text-primary">Bitcoin On-Chain Deposit</p>
                    {depositSats && (
                      <p className="text-[13px] font-mono text-on-surface-variant mt-1">
                        Deposit: <strong className="text-on-surface">{depositSats.toLocaleString()} sats</strong> ({(depositSats / 100_000_000).toFixed(8)} BTC)
                      </p>
                    )}
                  </div>

                  <div className="relative">
                    <div className="bg-white p-4 rounded-xl shadow-lg">
                      <QRCode
                        value={
                          depositSats
                            ? `bitcoin:${boardingAddress}?amount=${(depositSats / 100_000_000).toFixed(8)}`
                            : `bitcoin:${boardingAddress}`
                        }
                        size={200}
                      />
                    </div>
                  </div>

                  {(() => {
                    const bip21Uri = depositSats
                      ? `bitcoin:${boardingAddress}?amount=${(depositSats / 100_000_000).toFixed(8)}`
                      : `bitcoin:${boardingAddress}`;
                    return (
                      <div className="w-full flex flex-col gap-2.5">
                        <div
                          onClick={() => handleCopy(bip21Uri, 'uri')}
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
                            onClick={() => handleCopy(bip21Uri, 'uri')}
                            className="flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl bg-primary text-on-primary font-bold text-[13px] hover:opacity-95 transition-all shadow-md cursor-pointer"
                          >
                            {copiedType === 'uri' ? <><Check size={16} /> Copied URI!</> : <><Copy size={16} /> Copy URI (For Sparrow)</>}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(boardingAddress, 'address')}
                            className="flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl bg-primary/15 text-primary font-bold text-[13px] hover:bg-primary/25 transition-colors border border-primary/20 cursor-pointer"
                          >
                            {copiedType === 'address' ? <><Check size={16} /> Copied Address!</> : <><Copy size={16} /> Copy Address Only</>}
                          </button>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openMempoolAddress(boardingAddress)}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-surface-container-highest/80 hover:bg-surface-bright text-primary font-semibold text-[13px] transition-colors border border-outline-variant/20 cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            <span>Track on Mempool</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setBoardingAddress(null)}
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
              ) : (
                <div className="flex flex-col gap-3.5 sm:gap-4">
                  {/* Mode Toggle */}
                  <div className="flex bg-surface-container-highest rounded-lg p-1 border border-outline-variant/10">
                    <button
                      onClick={() => { setReceiveMode('lightning'); setReceiveAmount(''); }}
                      className={`flex-1 py-2 text-[13px] font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-2 ${receiveMode === 'lightning'
                        ? 'bg-surface-bright text-on-surface shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                    >
                      Lightning
                    </button>
                    <button
                      onClick={() => { setReceiveMode('onchain'); setReceiveAmount(''); }}
                      className={`flex-1 py-2 text-[13px] font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-2 ${receiveMode === 'onchain'
                        ? 'bg-surface-bright text-on-surface shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                    >
                      On-Chain (Bitcoin)
                    </button>
                  </div>

                  <div className="flex flex-col gap-2.5 sm:gap-3">
                    <div className="flex flex-col gap-2.5 sm:gap-3 animate-fade-in">
                      <AmountDisplay amount={receiveAmount} compact />

                      {/* On-Chain Receive Limits & Real-Time Feedback */}
                      {receiveMode === 'onchain' && (
                        <div className="flex flex-col items-center gap-1.5 w-full">
                          <div className="flex items-center justify-center gap-2 text-[12px] font-mono py-1 px-3.5 rounded-full bg-surface-container-highest/80 border border-outline-variant/30 text-on-surface-variant shadow-sm">
                            <span>Min: <strong className="text-primary font-bold">12,500 sats</strong></span>
                            <span className="text-outline-variant/40">•</span>
                            <span>Max: <strong className="text-on-surface font-bold">18,000,000 sats</strong></span>
                          </div>

                          {parsedReceiveAmount > 0 && parsedReceiveAmount < 12500 && (
                            <div className="text-[12px] font-medium text-amber-400 bg-amber-500/15 px-3 py-1.5 rounded-lg border border-amber-500/30 text-center animate-fade-in shadow-sm">
                              ⚠️ Minimum on-chain deposit is 12,500 sats ({(12500 - parsedReceiveAmount).toLocaleString()} more needed)
                            </div>
                          )}
                          {parsedReceiveAmount > 18000000 && (
                            <div className="text-[12px] font-medium text-error bg-error/15 px-3 py-1.5 rounded-lg border border-error/30 text-center animate-fade-in shadow-sm">
                              ⚠️ Maximum on-chain deposit is 18,000,000 sats
                            </div>
                          )}
                          {parsedReceiveAmount >= 12500 && parsedReceiveAmount <= 18000000 && (
                            <div className="text-[12px] font-medium text-emerald-400 bg-emerald-500/15 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-center animate-fade-in shadow-sm">
                              ✓ Valid deposit amount (within limits)
                            </div>
                          )}
                        </div>
                      )}

                      <NumberPad
                        value={receiveAmount}
                        onChange={(val) => {
                          setReceiveAmount(val);
                          setReceiveInvoice(null);
                          setQuoteId(null);
                          setBoardingAddress(null);
                          setDepositSats(null);
                        }}
                        compact
                      />
                    </div>

                    {receiveMode === 'onchain' && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setReceiveAmount('12500')}
                          className="flex-1 py-1.5 px-3 bg-surface-container-highest hover:bg-surface-bright rounded-xl text-xs font-bold text-primary border border-outline-variant/30 transition-all active:scale-[0.98] cursor-pointer shadow-sm text-center"
                        >
                          Fill Min (12,500 sats)
                        </button>
                        <button
                          type="button"
                          onClick={() => setReceiveAmount('50000')}
                          className="flex-1 py-1.5 px-3 bg-surface-container-highest hover:bg-surface-bright rounded-xl text-xs font-bold text-on-surface-variant hover:text-on-surface border border-outline-variant/30 transition-all active:scale-[0.98] cursor-pointer shadow-sm text-center"
                        >
                          50,000 sats
                        </button>
                        <button
                          type="button"
                          onClick={() => setReceiveAmount('100000')}
                          className="flex-1 py-1.5 px-3 bg-surface-container-highest hover:bg-surface-bright rounded-xl text-xs font-bold text-on-surface-variant hover:text-on-surface border border-outline-variant/30 transition-all active:scale-[0.98] cursor-pointer shadow-sm text-center"
                        >
                          100,000 sats
                        </button>
                      </div>
                    )}

                    <button
                      onClick={handleRequestInvoice}
                      disabled={
                        requesting ||
                        (receiveMode === 'lightning' && parsedReceiveAmount <= 0) ||
                        (receiveMode === 'onchain' && parsedReceiveAmount > 0 && parsedReceiveAmount < 12500) ||
                        (receiveMode === 'onchain' && parsedReceiveAmount > 18000000)
                      }
                      className={`bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary font-headline-lg-mobile text-[16px] sm:text-[18px] w-full py-3.5 sm:py-4 rounded-2xl shadow-lg transition-all duration-200 flex justify-center items-center mt-1 cursor-pointer ${
                        requesting ||
                        (receiveMode === 'lightning' && parsedReceiveAmount <= 0) ||
                        (receiveMode === 'onchain' && parsedReceiveAmount > 0 && parsedReceiveAmount < 12500) ||
                        (receiveMode === 'onchain' && parsedReceiveAmount > 18000000)
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:opacity-90 active:scale-[0.98]'
                      }`}
                    >
                      {requesting ? (
                        <Loader2 className="animate-spin w-6 h-6" />
                      ) : receiveMode === 'onchain' ? (
                        parsedReceiveAmount > 0 && parsedReceiveAmount < 12500 ? (
                          'Min Deposit is 12,500 sats'
                        ) : parsedReceiveAmount > 18000000 ? (
                          'Exceeds 18,000,000 sats limit'
                        ) : (
                          'Get Bitcoin Address'
                        )
                      ) : (
                        'Create Invoice'
                      )}
                    </button>
                  </div>
                </div>
              )
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
            if (paymentStatus === 'success') {
              onClose();
            } else {
              setPaymentStatus(null);
            }
          }}
          onRetry={lastPayAction}
        />
      </div>
    </div>,
    document.body
  );
};
