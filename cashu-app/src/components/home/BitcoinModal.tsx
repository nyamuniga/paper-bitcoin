import React, { useState } from 'react';
import { X, Copy, Check, Loader2, Zap, ArrowUp, ArrowDown, QrCode, ChevronDown, ExternalLink, AlertCircle } from 'lucide-react';

import { toast } from 'react-hot-toast';
import { useWalletStore } from '../../store/wallet';
import { useBitcoin } from '../../hooks/useBitcoin';
import { useHistory } from '../../hooks/useHistory';
import { useTransactionStore } from '../../store/transactionStore';
import { AppPhase } from '../../types/momo';
import { MEMPOOL_EXPLORER_URL } from '../../constants.local';

import { FullScreenLoader } from '../shared/FullScreenLoader';
import { MintIcon } from '../shared/MintIcon';
import { MintName } from '../shared/MintName';
import { AmountDisplay } from '../shared/AmountDisplay';
import { NumberPad } from '../shared/NumberPad';
import QRCode from 'react-qr-code';
import { Scanner } from '@yudiel/react-qr-scanner';
import { parseBitcoinInput } from '../../utils/bitcoinValidation';

interface BitcoinModalProps {
  mintUrl: string;
  initialTab?: 'send' | 'receive';
  initialInvoice?: string;
  onClose: () => void;
}

type Tab = 'send' | 'receive';
type SendStep = 'input' | 'amount' | 'summary' | 'success';

export const BitcoinModal: React.FC<BitcoinModalProps> = ({ mintUrl: initialMintUrl, initialTab = 'send', initialInvoice = '', onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [mintUrl, setMintUrl] = useState(initialMintUrl);
  const [showMintDropdown, setShowMintDropdown] = useState(false);

  // Send state
  const [destinationInput, setDestinationInput] = useState(initialInvoice);
  const [showScanner, setShowScanner] = useState(false);
  const parsedInput = parseBitcoinInput(destinationInput);

  const [onchainSendAmount, setOnchainSendAmount] = useState('');
  const [miningFee, setMiningFee] = useState<number | null>(null);
  const [isFetchingFee, setIsFetchingFee] = useState(false);
  const [sendStep, setSendStep] = useState<SendStep>('input');
  const [txSuccessId, setTxSuccessId] = useState<string | null>(null);

  // Receive state
  const [receiveAmount, setReceiveAmount] = useState('');
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [receiveInvoice, setReceiveInvoice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [receiveMode, setReceiveMode] = useState<'lightning' | 'onchain'>('lightning');

  const mintBalances = useWalletStore((s) => s.mintBalances);
  const mintUrls = Object.keys(mintBalances || {});
  const availableBalance = mintBalances[mintUrl] || 0;

  const { transactions } = useHistory();
  const { paying, requesting, payInvoice, receiveLightning, getOnChainFee, sendOnChain, receiveOnChain } = useBitcoin(mintUrl);
  const activeTransaction = useTransactionStore((s) => s.activeTransaction);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const handleClose = () => {
    refreshWallet();
    if (activeTransaction) {
      if (activeTransaction.direction === 'ONCHAIN_RECEIVE' && 
          [AppPhase.GENERATING_ONCHAIN_ADDRESS, AppPhase.AWAITING_ONCHAIN_DEPOSIT].includes(activeTransaction.currentPhase!)) {
        useTransactionStore.getState().moveToHistory(activeTransaction);
        useTransactionStore.getState().setActiveTransaction(null);
      } else if (activeTransaction.direction === 'ONCHAIN_SEND' &&
          [AppPhase.ONCHAIN_PAYOUT_COMPLETE, AppPhase.ONCHAIN_PAYOUT_FAILED].includes(activeTransaction.currentPhase!)) {
        useTransactionStore.getState().setActiveTransaction(null);
      }
    }
    
    // Reset local component states
    setSendStep('input');
    setOnchainSendAmount('');
    setDestinationInput('');

    onClose();
  };

  const currentTx = quoteId ? transactions.find(t => t.id === quoteId) : null;
  const receiveSuccess = currentTx?.status === 'Success';

  // Observe background on-chain transaction
  const isProcessingOnChain = activeTransaction?.direction === 'ONCHAIN_SEND' && [
    AppPhase.GENERATING_ONCHAIN_INVOICE,
    AppPhase.PAYING_ONCHAIN_INVOICE, 
    AppPhase.EXECUTING_ONCHAIN_PAYOUT,
    AppPhase.ONCHAIN_PAYOUT_FAILED
  ].includes(activeTransaction.currentPhase!);

  const isProcessingOnChainReceive = activeTransaction?.direction === 'ONCHAIN_RECEIVE' && [
    AppPhase.GENERATING_ONCHAIN_ADDRESS,
    AppPhase.AWAITING_ONCHAIN_DEPOSIT, 
    AppPhase.DEPOSIT_CONFIRMED,
    AppPhase.GENERATING_MINT_INVOICE,
    AppPhase.PAYING_MINT_INVOICE,
    AppPhase.ISSUING_ECASH,
    AppPhase.PAYMENT_FAILED,
    AppPhase.RETRYABLE_ERROR
  ].includes(activeTransaction.currentPhase!);

  React.useEffect(() => {
    if (activeTransaction?.direction === 'ONCHAIN_SEND') {
      if (activeTransaction.currentPhase === AppPhase.ONCHAIN_PAYOUT_COMPLETE) {
        setTxSuccessId(activeTransaction.txSuccessId || 'SUCCESS');
        setSendStep('success');
      }
    }
  }, [activeTransaction?.currentPhase]);

  const isInsufficient = (parsedInput.type === 'lightning' && parsedInput.amountSats !== null)
    ? parsedInput.amountSats > availableBalance
    : false;

  const handlePayLightning = async () => {
    if (parsedInput.type !== 'lightning' || !parsedInput.addressOrInvoice || isInsufficient) return;
    const success = await payInvoice(parsedInput.addressOrInvoice);
    if (success) onClose();
  };

  const MIN_ONCHAIN_SATS = 1000;
  const MAX_ONCHAIN_SATS = 1000000;

  const handleNextFromInput = () => {
    if (parsedInput.type === 'onchain') {
      if (parsedInput.amountSats !== null) {
        if (parsedInput.amountSats < MIN_ONCHAIN_SATS || parsedInput.amountSats > MAX_ONCHAIN_SATS) {
          toast.error(`Amount must be between ${MIN_ONCHAIN_SATS.toLocaleString()} and ${MAX_ONCHAIN_SATS.toLocaleString()} sats`);
          return;
        }
        if (parsedInput.amountSats > availableBalance) {
          toast.error('Insufficient balance to send this amount');
          return;
        }
        setOnchainSendAmount(parsedInput.amountSats.toString());
        goToSummary(parsedInput.amountSats);
      } else {
        setSendStep('amount');
      }
    }
  };

  const goToSummary = async (amountSats: number) => {
    setSendStep('summary');
    setIsFetchingFee(true);
    setMiningFee(null);
    try {
      const fee = await getOnChainFee(parsedInput.addressOrInvoice, amountSats);
      setMiningFee(fee);
    } catch (e: any) {
      toast.error(`Failed to get mining fee: ${e.message}`);
      setSendStep('input');
    } finally {
      setIsFetchingFee(false);
    }
  };

  const handleNextFromAmount = () => {
    const amt = parseInt(onchainSendAmount) || 0;
    if (amt <= 0) return;

    if (amt < MIN_ONCHAIN_SATS || amt > MAX_ONCHAIN_SATS) {
      toast.error(`Amount must be between ${MIN_ONCHAIN_SATS.toLocaleString()} and ${MAX_ONCHAIN_SATS.toLocaleString()} sats`);
      return;
    }

    if (amt > availableBalance) {
      toast.error('Insufficient balance to send this amount');
      return;
    }

    goToSummary(amt);
  };

  const handleConfirmOnChainSend = async () => {
    if (parsedInput.type !== 'onchain' || miningFee === null) return;
    const amt = parsedInput.amountSats !== null ? parsedInput.amountSats : (parseInt(onchainSendAmount) || 0);

    if (amt + miningFee > availableBalance) {
      toast.error('Insufficient balance to cover amount + mining fee');
      return;
    }

    const res = await sendOnChain(parsedInput.addressOrInvoice, amt, miningFee);
    if (res && res.success) {
      // Background processor takes over. The UI will listen to activeTransaction.
    }
  };

  const parsedReceiveAmount = parseInt(receiveAmount) || 0;

  const handleRequestInvoice = async () => {
    if (parsedReceiveAmount <= 0) return;
    const res = await receiveLightning(parsedReceiveAmount);
    if (res) {
      setQuoteId(res.quoteId);
      setReceiveInvoice(res.receiveInvoice);
    }
  };

  const handleRequestOnChain = async () => {
    if (parsedReceiveAmount <= 0) return;
    await receiveOnChain(parsedReceiveAmount);
  };

  const handleCopy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied!');
      setTimeout(() => setCopied(false), 2000);
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
      setReceiveMode('lightning');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface-container-high rounded-2xl w-full max-w-lg border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col relative max-h-[90vh]">
        <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>

        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-outline-variant/10 relative z-10">
          <h2 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
            <Zap className="text-amber-400 w-5 h-5" /> Bitcoin
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        {sendStep === 'input' && (
          <div className="flex border-b border-outline-variant/10 relative z-10">
            <button
              onClick={() => switchTab('send')}
              className={`flex-1 py-3 text-[14px] font-bold tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'send'
                ? 'text-amber-400 border-b-2 border-amber-400'
                : 'text-on-surface-variant hover:text-on-surface'
                }`}
            >
              <ArrowUp size={16} /> SEND
            </button>
            <button
              onClick={() => switchTab('receive')}
              className={`flex-1 py-3 text-[14px] font-bold tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'receive'
                ? 'text-amber-400 border-b-2 border-amber-400'
                : 'text-on-surface-variant hover:text-on-surface'
                }`}
            >
              <ArrowDown size={16} /> RECEIVE
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 relative z-10 overflow-y-auto">
          {/* Mint info */}
          {sendStep !== 'success' && (
            <div className="flex flex-col gap-2">
              <p className="text-body-md font-body-md text-on-surface-variant">
                {activeTab === 'send'
                  ? 'Pay from:'
                  : (receiveSuccess ? 'Lightning received to:' : receiveInvoice ? 'Waiting for payment to:' : 'Receive lightning to:')}
              </p>
              <div className="relative">
                {showMintDropdown && (
                  <div className="fixed inset-0 z-40" onClick={() => setShowMintDropdown(false)}></div>
                )}
                <button
                  onClick={() => setShowMintDropdown(!showMintDropdown)}
                  className="w-full flex items-center justify-between bg-surface-container-highest p-3 rounded-xl border border-outline-variant/10 hover:bg-surface-bright transition-colors relative z-50"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-4">
                    <MintIcon mintUrl={mintUrl} className="w-6 h-6 flex-shrink-0 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30" textClassName="text-primary text-[10px] font-bold" />
                    <MintName mintUrl={mintUrl} className="text-body-md font-body-md text-on-surface font-medium truncate" />
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
                    <span className="text-body-md font-body-md font-semibold text-on-surface">₿{availableBalance.toLocaleString()}</span>
                    <ChevronDown size={16} className="text-on-surface-variant flex-shrink-0" />
                  </div>
                </button>

                {showMintDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container-highest rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden flex flex-col animate-fade-in z-50 max-h-[250px] overflow-y-auto">
                    {mintUrls.map((m, index) => (
                      <button
                        key={m}
                        onClick={() => { setMintUrl(m); setShowMintDropdown(false); }}
                        className={`flex items-center justify-between p-3 hover:bg-surface-bright transition-colors text-left w-full ${index > 0 ? 'border-t border-outline-variant/10' : ''}`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <MintIcon mintUrl={m} className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0" textClassName="text-primary text-[10px] font-bold" />
                          <MintName mintUrl={m} className="text-body-sm font-body-sm text-on-surface truncate" />
                        </div>
                        <span className="text-body-sm font-body-sm font-bold text-on-surface flex-shrink-0">₿{(mintBalances![m] || 0).toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'send' ? (
            /* ─── SEND TAB ──────────────────────────────── */
            <div className="flex flex-col gap-4">
              {isProcessingOnChain && (
                <div className="py-6 px-4 animate-fade-in">
                  <h3 className={`text-headline-md mb-6 text-center ${activeTransaction?.currentPhase === AppPhase.ONCHAIN_PAYOUT_FAILED ? 'text-error' : 'text-on-surface'}`}>
                    {activeTransaction?.currentPhase === AppPhase.ONCHAIN_PAYOUT_FAILED ? 'Send Failed' : 'Processing Send'}
                  </h3>

                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center w-8 h-8">
                        {activeTransaction?.currentPhase === AppPhase.GENERATING_ONCHAIN_INVOICE ? (
                          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                        ) : [AppPhase.PAYING_ONCHAIN_INVOICE, AppPhase.EXECUTING_ONCHAIN_PAYOUT, AppPhase.ONCHAIN_PAYOUT_FAILED].includes(activeTransaction?.currentPhase!) ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                            <Check className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-outline-variant/50" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-label-lg ${activeTransaction?.currentPhase === AppPhase.GENERATING_ONCHAIN_INVOICE ? 'text-amber-400' : [AppPhase.PAYING_ONCHAIN_INVOICE, AppPhase.EXECUTING_ONCHAIN_PAYOUT, AppPhase.ONCHAIN_PAYOUT_FAILED].includes(activeTransaction?.currentPhase!) ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>Securing Invoice</p>
                        <p className={`text-body-sm ${activeTransaction?.currentPhase === AppPhase.GENERATING_ONCHAIN_INVOICE ? 'text-on-surface-variant' : 'text-on-surface-variant/50'}`}>Requesting on-chain invoice from proxy</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center w-8 h-8">
                        {activeTransaction?.currentPhase === AppPhase.PAYING_ONCHAIN_INVOICE ? (
                          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                        ) : [AppPhase.EXECUTING_ONCHAIN_PAYOUT, AppPhase.ONCHAIN_PAYOUT_FAILED].includes(activeTransaction?.currentPhase!) ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                            <Check className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-outline-variant/50" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-label-lg ${activeTransaction?.currentPhase === AppPhase.PAYING_ONCHAIN_INVOICE ? 'text-amber-400' : [AppPhase.EXECUTING_ONCHAIN_PAYOUT, AppPhase.ONCHAIN_PAYOUT_FAILED].includes(activeTransaction?.currentPhase!) ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>Funding Transfer</p>
                        <p className={`text-body-sm ${activeTransaction?.currentPhase === AppPhase.PAYING_ONCHAIN_INVOICE ? 'text-on-surface-variant' : 'text-on-surface-variant/50'}`}>Melting eCash to fund on-chain transaction</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center w-8 h-8">
                        {activeTransaction?.currentPhase === AppPhase.EXECUTING_ONCHAIN_PAYOUT ? (
                          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                        ) : activeTransaction?.currentPhase === AppPhase.ONCHAIN_PAYOUT_FAILED ? (
                          <div className="w-6 h-6 rounded-full bg-error/20 text-error flex items-center justify-center">
                            <X className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-outline-variant/50" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-label-lg ${activeTransaction?.currentPhase === AppPhase.EXECUTING_ONCHAIN_PAYOUT ? 'text-amber-400' : activeTransaction?.currentPhase === AppPhase.ONCHAIN_PAYOUT_FAILED ? 'text-error' : 'text-on-surface-variant/50'}`}>Initiating Payout</p>
                        <p className={`text-body-sm ${activeTransaction?.currentPhase === AppPhase.EXECUTING_ONCHAIN_PAYOUT ? 'text-on-surface-variant' : 'text-on-surface-variant/50'}`}>Instructing proxy to send Bitcoin</p>
                      </div>
                    </div>
                  </div>

                  {activeTransaction?.currentPhase === AppPhase.ONCHAIN_PAYOUT_FAILED && (
                     <div className="mt-8 text-center bg-error/10 border border-error/20 p-4 rounded-xl">
                       <p className="text-body-md text-error font-bold mb-2">On-Chain Payout Failed</p>
                       <p className="text-body-sm text-on-surface-variant mb-4">Your eCash was melted successfully, but the final on-chain payout failed.</p>
                       <button onClick={onClose} className="w-full py-3 bg-surface-container-highest rounded-full text-on-surface hover:bg-surface-bright transition-colors font-label-lg">Close (Retry from History)</button>
                     </div>
                  )}
                </div>
              )}

              {!isProcessingOnChain && sendStep === 'input' && (
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
                        className={`w-full bg-surface-container-lowest text-on-surface font-label-caps text-label-caps p-4 pr-12 rounded-lg border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:outline-none resize-none placeholder:text-on-surface-variant/50 ${isInsufficient ? 'focus:ring-error ring-1 ring-error/50' : 'focus:ring-amber-400'}`}
                        placeholder="Lightning invoice or Bitcoin address..."
                        rows={4}
                        spellCheck={false}
                      />
                      <button
                        onClick={() => setShowScanner(true)}
                        className="absolute right-3 top-3 p-2 bg-surface-container-highest rounded-lg text-amber-400 hover:bg-surface-bright transition-colors"
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
                  {parsedInput.type === 'onchain' && !showScanner && (
                    <div className="text-[12px] font-label-caps px-1 text-primary">
                      Bitcoin Address Detected
                      {parsedInput.amountSats !== null && ` (₿${parsedInput.amountSats.toLocaleString()})`}
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
                      className={`mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-full shadow-lg transition-all duration-200 flex justify-center items-center ${paying || !destinationInput || isInsufficient ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                        }`}
                    >
                      {paying ? <Loader2 className="animate-spin w-6 h-6" /> : <><Zap className="w-5 h-5 mr-2" /> Pay Invoice</>}
                    </button>
                  ) : (
                    <button
                      onClick={handleNextFromInput}
                      disabled={parsedInput.type !== 'onchain'}
                      className={`mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-full shadow-lg transition-all duration-200 flex justify-center items-center ${parsedInput.type !== 'onchain' ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                        }`}
                    >
                      Next
                    </button>
                  )}
                </div>
              )}

              {!isProcessingOnChain && sendStep === 'amount' && (
                <div className="flex flex-col gap-4 animate-fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => setSendStep('input')} className="text-on-surface-variant hover:text-on-surface text-sm font-bold">← Back</button>
                    <p className="text-label-caps font-label-caps text-on-surface-variant">SEND AMOUNT</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <AmountDisplay amount={onchainSendAmount} compact />
                    {parseInt(onchainSendAmount) > availableBalance && (
                      <span className="text-[12px] font-label-caps text-error text-center mt-1">Insufficient Balance</span>
                    )}
                    {parseInt(onchainSendAmount) > 0 && (parseInt(onchainSendAmount) < MIN_ONCHAIN_SATS || parseInt(onchainSendAmount) > MAX_ONCHAIN_SATS) && (
                      <span className="text-[12px] font-label-caps text-error text-center mt-1">Limits: {MIN_ONCHAIN_SATS.toLocaleString()} - {MAX_ONCHAIN_SATS.toLocaleString()} Sats</span>
                    )}
                  </div>
                  <NumberPad
                    value={onchainSendAmount}
                    onChange={setOnchainSendAmount}
                    compact
                  />
                  <button
                    onClick={handleNextFromAmount}
                    disabled={!parseInt(onchainSendAmount) || parseInt(onchainSendAmount) > availableBalance || parseInt(onchainSendAmount) < MIN_ONCHAIN_SATS || parseInt(onchainSendAmount) > MAX_ONCHAIN_SATS}
                    className={`mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-full shadow-lg transition-all duration-200 flex justify-center items-center ${(!parseInt(onchainSendAmount) || parseInt(onchainSendAmount) > availableBalance || parseInt(onchainSendAmount) < MIN_ONCHAIN_SATS || parseInt(onchainSendAmount) > MAX_ONCHAIN_SATS) ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                      }`}
                  >
                    Calculate Fee
                  </button>
                </div>
              )}

              {!isProcessingOnChain && sendStep === 'summary' && (
                <div className="flex flex-col gap-4 animate-fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => setSendStep(parsedInput.amountSats !== null ? 'input' : 'amount')} className="text-on-surface-variant hover:text-on-surface text-sm font-bold">← Back</button>
                    <p className="text-label-caps font-label-caps text-on-surface-variant">SUMMARY</p>
                  </div>

                  {isFetchingFee ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-4">
                      <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                      <p className="text-on-surface-variant text-sm">Calculating mempool fee...</p>
                    </div>
                  ) : (
                    <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/30 flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                        <span className="text-on-surface-variant text-sm">Destination</span>
                        <span className="text-on-surface text-sm font-mono truncate max-w-[150px]">{parsedInput.addressOrInvoice}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-on-surface-variant text-sm">Send Amount</span>
                        <span className="text-on-surface text-sm font-bold">₿{parseInt(onchainSendAmount) || parsedInput.amountSats}</span>
                      </div>
                      <div className="flex justify-between items-center pb-4 border-b border-outline-variant/20">
                        <span className="text-on-surface-variant text-sm">Mining Fee</span>
                        <span className="text-amber-400 text-sm font-bold">₿{miningFee}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-on-surface-variant font-bold">Total Cost</span>
                        <span className="text-on-surface font-display-sm text-xl text-error">
                          ₿{((parseInt(onchainSendAmount) || parsedInput.amountSats || 0) + (miningFee || 0)).toLocaleString()}
                        </span>
                      </div>
                      {((parseInt(onchainSendAmount) || parsedInput.amountSats || 0) + (miningFee || 0)) > availableBalance && (
                        <div className="bg-error/10 border border-error/20 p-3 rounded-lg text-center mt-2">
                          <span className="text-[13px] font-bold text-error">Insufficient Balance</span>
                        </div>
                      )}
                    </div>
                  )}

                  {!isFetchingFee && (
                    <button
                      onClick={handleConfirmOnChainSend}
                      disabled={paying || (((parseInt(onchainSendAmount) || parsedInput.amountSats || 0) + (miningFee || 0)) > availableBalance)}
                      className={`mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-full shadow-lg transition-all duration-200 flex justify-center items-center ${(paying || (((parseInt(onchainSendAmount) || parsedInput.amountSats || 0) + (miningFee || 0)) > availableBalance)) ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                        }`}
                    >
                      {paying ? <Loader2 className="animate-spin w-6 h-6" /> : 'Confirm Send'}
                    </button>
                  )}
                </div>
              )}

              {!isProcessingOnChain && sendStep === 'success' && (
                <div className="flex flex-col items-center gap-5 animate-fade-in pt-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                    <Check size={32} className="text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-label-caps font-label-caps text-on-surface-variant mb-1">ON-CHAIN SEND COMPLETE</p>
                    <p className="text-[28px] font-display-lg text-emerald-400">₿{parseInt(onchainSendAmount) || parsedInput.amountSats}</p>
                  </div>

                  {txSuccessId && txSuccessId !== 'SUCCESS' && txSuccessId !== 'PENDING' && (
                    <div className="w-full mt-4">
                      <p className="text-center text-xs text-on-surface-variant mb-2">Transaction ID</p>
                      <div className="w-full bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 text-center">
                        <p className="text-[11px] font-mono text-on-surface-variant break-all select-all">{txSuccessId}</p>
                      </div>
                      <a
                        href={`${MEMPOOL_EXPLORER_URL}/tx/${txSuccessId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 flex items-center justify-center gap-2 text-amber-400 hover:text-amber-300 transition-colors text-sm font-bold"
                      >
                        View on Mempool.space <ExternalLink size={14} />
                      </a>
                    </div>
                  )}

                  <button
                    onClick={handleClose}
                    className="w-full mt-6 py-4 rounded-full bg-surface-container-highest text-on-surface font-bold text-[15px] hover:bg-surface-bright transition-colors border border-outline-variant/20"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ─── RECEIVE TAB ─────────────────────────────── */
            isProcessingOnChainReceive ? (
              <div className="flex flex-col items-center gap-6 py-4 animate-fade-in">
                <div className="text-center mb-4">
                  <p className="text-label-caps font-label-caps text-on-surface-variant mb-2">RECEIVING ON-CHAIN</p>
                  <p className="text-sm text-on-surface/70 px-4">
                    Please send Bitcoin to the generated address.
                  </p>
                </div>

                {activeTransaction?.status === 'COMPLETED' && (
                  <div className="flex flex-col items-center gap-2 mb-2">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-2">
                      <Check size={32} className="text-emerald-400" />
                    </div>
                    <p className="text-label-caps font-label-caps text-emerald-400">RECEIVE COMPLETE</p>
                    <p className="text-[28px] font-display-lg text-emerald-400">₿{activeTransaction.satsAmount?.toLocaleString()}</p>
                  </div>
                )}

                {(activeTransaction?.currentPhase === AppPhase.PAYMENT_FAILED || activeTransaction?.currentPhase === AppPhase.RETRYABLE_ERROR) && (
                  <div className="flex flex-col items-center gap-2 mb-2 w-full">
                     <div className="bg-error/10 border border-error/20 p-4 rounded-xl text-center w-full">
                       <AlertCircle className="w-8 h-8 text-error mx-auto mb-2" />
                       <p className="text-body-md text-error font-bold mb-2">Receive Failed</p>
                       <p className="text-body-sm text-on-surface-variant">The swap failed. If you have sent funds, please close this and request a refund from the History tab.</p>
                     </div>
                  </div>
                )}

                {activeTransaction?.onchainAddress && activeTransaction.currentPhase === AppPhase.AWAITING_ONCHAIN_DEPOSIT && (
                  <div className="flex flex-col items-center gap-4 w-full">
                    <div className="bg-white p-4 rounded-xl shadow-lg">
                      <QRCode value={activeTransaction.onchainAddress} size={200} />
                    </div>
                    <div
                      onClick={() => handleCopy(activeTransaction.onchainAddress!)}
                      className="w-full bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 shadow-inner cursor-pointer hover:border-amber-400/30 transition-colors"
                    >
                      <p className="text-[11px] font-mono text-on-surface-variant break-all select-all text-center">{activeTransaction.onchainAddress}</p>
                    </div>
                    <button
                      onClick={() => handleCopy(activeTransaction.onchainAddress!)}
                      className="w-full py-3 rounded-full bg-amber-500/15 text-amber-400 font-bold text-[15px] hover:bg-amber-500/25 transition-colors border border-amber-500/20 flex items-center justify-center gap-2"
                    >
                      {copied ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> Copy Address</>}
                    </button>
                    
                    <div className="w-full bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex items-start gap-3 mt-1">
                      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="text-[12px] text-amber-500/90 leading-tight">
                        <span className="font-bold">Exact amount required: ₿{activeTransaction.satsAmount?.toLocaleString()}</span> Please send the exact amount to avoid deposit failures.
                      </div>
                    </div>

                    <p className="text-xs text-on-surface-variant mt-1 text-center">
                      Waiting for block confirmation... <br /> This can take ~10-30 minutes. You can safely close this modal.
                    </p>
                  </div>
                )}

                <div className="w-full space-y-4 relative mt-2">
                  <div className="absolute left-[15px] top-6 bottom-6 w-0.5 bg-surface-container-highest" />

                  {[
                    { phase: [AppPhase.GENERATING_ONCHAIN_ADDRESS], label: 'Generating Address' },
                    { phase: [AppPhase.AWAITING_ONCHAIN_DEPOSIT], label: 'Awaiting Deposit' },
                    { phase: [AppPhase.DEPOSIT_CONFIRMED, AppPhase.GENERATING_MINT_INVOICE, AppPhase.PAYING_MINT_INVOICE, AppPhase.ISSUING_ECASH], label: 'Issuing eCash' },
                  ].map((step, idx) => {
                    let state = 'pending';
                    const activePhaseIdx = [
                      [AppPhase.GENERATING_ONCHAIN_ADDRESS],
                      [AppPhase.AWAITING_ONCHAIN_DEPOSIT],
                      [AppPhase.DEPOSIT_CONFIRMED, AppPhase.GENERATING_MINT_INVOICE, AppPhase.PAYING_MINT_INVOICE, AppPhase.ISSUING_ECASH]
                    ].findIndex(group => group.includes(activeTransaction?.currentPhase as AppPhase));

                    if (idx < activePhaseIdx) state = 'completed';
                    if (idx === activePhaseIdx) state = 'active';

                    if (activeTransaction?.currentPhase === AppPhase.RETRYABLE_ERROR && idx === activePhaseIdx) state = 'error';
                    if (activeTransaction?.status === 'COMPLETED' && idx === 2) state = 'completed';

                    return (
                      <div key={idx} className="relative flex items-center gap-4 bg-surface-container p-3 rounded-xl border border-outline-variant/10">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 transition-colors ${state === 'completed' ? 'bg-emerald-500 text-on-primary' :
                          state === 'active' ? 'bg-amber-500 text-on-primary' :
                            state === 'error' ? 'bg-red-500 text-on-primary' :
                              'bg-surface-container-highest text-on-surface-variant'
                          }`}>
                          {state === 'completed' ? <Check size={16} /> :
                            state === 'active' ? <Loader2 size={16} className="animate-spin" /> :
                              <span className="text-xs font-bold">{idx + 1}</span>}
                        </div>
                        <span className={`font-bold text-[15px] ${state === 'active' ? 'text-amber-400' :
                          state === 'completed' ? 'text-emerald-400' :
                            state === 'error' ? 'text-red-400' :
                              'text-on-surface-variant'
                          }`}>{step.label}</span>
                      </div>
                    );
                  })}
                </div>

                {activeTransaction?.status === 'COMPLETED' && (
                  <button
                    onClick={handleClose}
                    className="w-full mt-2 py-4 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[15px] hover:bg-emerald-500/25 transition-colors border border-emerald-500/20"
                  >
                    Done
                  </button>
                )}
                {activeTransaction?.status !== 'COMPLETED' && (
                  <button
                    onClick={handleClose}
                    className="w-full mt-2 py-4 rounded-full bg-surface-container-highest text-on-surface font-bold text-[15px] hover:bg-surface-bright transition-colors border border-outline-variant/20"
                  >
                    Close & Track in History
                  </button>
                )}
              </div>
            ) : receiveSuccess ? (
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
                  className="w-full py-4 rounded-full bg-amber-500/15 text-amber-400 font-bold text-[15px] hover:bg-amber-500/25 transition-colors border border-amber-500/20"
                >
                  Done
                </button>
              </div>
            ) : receiveInvoice ? (
              /* Show invoice QR */
              <div className="flex flex-col items-center gap-5">
                <div className="text-center">
                  <p className="text-label-caps font-label-caps text-on-surface-variant mb-1">AMOUNT</p>
                  <p className="text-[28px] font-display-lg text-amber-400">₿{parsedReceiveAmount.toLocaleString()}</p>
                </div>

                <div className="relative">
                  <div className="bg-white p-4 rounded-xl shadow-lg">
                    <QRCode value={receiveInvoice} size={200} />
                  </div>
                  <div className="absolute inset-0 bg-amber-400/20 rounded-xl blur-xl -z-10 animate-pulse"></div>
                </div>

                <div className="w-full flex flex-col gap-2">
                  <div
                    onClick={() => handleCopy(receiveInvoice)}
                    className="w-full bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 shadow-inner cursor-pointer hover:border-amber-400/30 transition-colors"
                  >
                    <p className="text-[11px] font-mono text-on-surface-variant break-all line-clamp-3 select-all">{receiveInvoice}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(receiveInvoice)}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full bg-amber-500/15 text-amber-400 font-bold text-[15px] hover:bg-amber-500/25 transition-colors border border-amber-500/20"
                    >
                      {copied ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> Copy Invoice</>}
                    </button>
                    <button
                      onClick={() => setReceiveInvoice(null)}
                      className="px-6 py-3 rounded-full bg-surface-container-highest text-on-surface-variant font-bold text-[15px] hover:bg-surface-bright transition-colors border border-outline-variant/20"
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
            ) : (
              <div className="flex flex-col gap-6">
                
                {/* Mode Toggle */}
                <div className="flex p-1 bg-surface-container-highest rounded-full">
                  <button
                    onClick={() => setReceiveMode('lightning')}
                    className={`flex-1 py-2 text-sm font-bold rounded-full transition-all ${
                      receiveMode === 'lightning' 
                        ? 'bg-amber-500 text-on-primary shadow-md' 
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Lightning
                  </button>
                  <button
                    onClick={() => setReceiveMode('onchain')}
                    className={`flex-1 py-2 text-sm font-bold rounded-full transition-all ${
                      receiveMode === 'onchain' 
                        ? 'bg-amber-500 text-on-primary shadow-md' 
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    On-Chain
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4">
                    <AmountDisplay amount={receiveAmount} compact />
                    <NumberPad
                      value={receiveAmount}
                      onChange={(val) => {
                        setReceiveAmount(val);
                        setReceiveInvoice(null);
                        setQuoteId(null);
                      }}
                      compact
                    />
                  </div>

                  {receiveMode === 'lightning' ? (
                    <button
                      onClick={handleRequestInvoice}
                      disabled={requesting || parsedReceiveAmount <= 0}
                      className={`bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-full shadow-lg transition-all duration-200 flex justify-center items-center ${requesting || parsedReceiveAmount <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                        }`}
                    >
                      {requesting ? <Loader2 className="animate-spin w-6 h-6" /> : 'Create Invoice'}
                    </button>
                  ) : (
                    <button
                      onClick={handleRequestOnChain}
                      disabled={requesting || parsedReceiveAmount <= 0}
                      className={`bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-full shadow-lg transition-all duration-200 flex justify-center items-center ${requesting || parsedReceiveAmount <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                        }`}
                    >
                      {requesting ? <Loader2 className="animate-spin w-6 h-6" /> : 'Generate Address'}
                    </button>
                  )}
                </div>
              </div>
            )
          )}
        </div>
        {paying && !isProcessingOnChain ? (
          <FullScreenLoader title="Sending Bitcoin..." message="Executing transaction." />
        ) : null}
      </div>
    </div>
  );
};
