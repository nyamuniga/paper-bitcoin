import React, { useState } from 'react';
import { X, Copy, Check, Loader2, Zap, ArrowUp, ArrowDown, QrCode, ChevronDown } from 'lucide-react';

import { toast } from 'react-hot-toast';
import { useWalletStore } from '../../store/wallet';
import { useBitcoin } from '../../hooks/useBitcoin';
import { useHistory } from '../../hooks/useHistory';

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

interface BitcoinModalProps {
  mintUrl: string;
  initialTab?: 'send' | 'receive';
  initialInvoice?: string;
  onClose: () => void;
}

type Tab = 'send' | 'receive';
type SendStep = 'input' | 'amount';

export const BitcoinModal: React.FC<BitcoinModalProps> = ({ mintUrl: initialMintUrl, initialTab = 'send', initialInvoice = '', onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [mintUrl, setMintUrl] = useState(initialMintUrl);
  const [showMintDropdown, setShowMintDropdown] = useState(false);

  // Send state
  const [destinationInput, setDestinationInput] = useState(initialInvoice);
  const [showScanner, setShowScanner] = useState(false);
  const parsedInput = parseBitcoinInput(destinationInput);

  const [lnurlParams, setLnurlParams] = useState<any | null>(null);

  const [lnurlSendAmount, setLnurlSendAmount] = useState('');
  const [isFetchingLnurl, setIsFetchingLnurl] = useState(false);
  const [sendStep, setSendStep] = useState<SendStep>('input');

  // Receive state
  const [receiveAmount, setReceiveAmount] = useState('');
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [receiveInvoice, setReceiveInvoice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mintBalances = useWalletStore((s) => s.mintBalances);
  const mintUrls = Object.keys(mintBalances || {});
  const availableBalance = mintBalances[mintUrl] || 0;

  const { transactions } = useHistory();
  const { paying, requesting, payInvoice, receiveLightning } = useBitcoin(mintUrl);


  const currentTx = quoteId ? transactions.find(t => t.id === quoteId) : null;
  const receiveSuccess = currentTx?.status === 'Success';

  const isInsufficient = (parsedInput.type === 'lightning' && parsedInput.amountSats !== null)
    ? parsedInput.amountSats > availableBalance
    : false;

  const handlePayLightning = async () => {
    if (parsedInput.type !== 'lightning' || !parsedInput.addressOrInvoice || isInsufficient) return;
    const success = await payInvoice(parsedInput.addressOrInvoice);
    if (success) onClose();
  };

  const handleNextFromInput = async () => {
    if (parsedInput.type === 'lnurl' || parsedInput.type === 'lnurl-pay') {
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

    if (lnurlParams) {
      setIsFetchingLnurl(true);
      try {
        const invoiceData = await fetchLnurlPayInvoice(lnurlParams.callback, amt * 1000);
        const success = await payInvoice(invoiceData.pr);
        if (success) {
          onClose();
        }
      } catch (e: any) {
        toast.error(`LNURL Error: ${e.message}`);
      } finally {
        setIsFetchingLnurl(false);
      }
      return;
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
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface-container-high rounded-2xl w-full max-w-lg border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col relative max-h-[90vh]">
        <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>

        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-outline-variant/10 relative z-10">
          <h2 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
            <Zap className="text-primary w-5 h-5" /> Bitcoin
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
                ? 'text-primary border-b-2 border-primary'
                : 'text-on-surface-variant hover:text-on-surface'
                }`}
            >
              <ArrowUp size={16} /> SEND
            </button>
            <button
              onClick={() => switchTab('receive')}
              className={`flex-1 py-3 text-[14px] font-bold tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'receive'
                ? 'text-primary border-b-2 border-primary'
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
                        placeholder="Lightning Invoice or Address..."
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
                  {parsedInput.type === 'invalid' && destinationInput.length > 0 && !showScanner && (
                    <div className="text-[12px] font-label-caps px-1 text-error">
                      Invalid invoice or address
                    </div>
                  )}

                  {parsedInput.type === 'lightning' ? (
                    <button
                      onClick={handlePayLightning}
                      disabled={paying || !destinationInput || isInsufficient}
                      className={`mt-2 bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-full shadow-lg transition-all duration-200 flex justify-center items-center ${paying || !destinationInput || isInsufficient ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                        }`}
                    >
                      {paying ? <Loader2 className="animate-spin w-6 h-6" /> : <><Zap className="w-5 h-5 mr-2" /> Pay Invoice</>}
                    </button>
                  ) : (
                    <button
                      onClick={handleNextFromInput}
                      disabled={parsedInput.type !== 'lnurl' && parsedInput.type !== 'lnurl-pay'}
                      className={`mt-2 bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-full shadow-lg transition-all duration-200 flex justify-center items-center ${(parsedInput.type !== 'lnurl' && parsedInput.type !== 'lnurl-pay') ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                        }`}
                    >
                      {isFetchingLnurl ? <Loader2 className="animate-spin w-6 h-6" /> : 'Next'}
                    </button>
                  )}
                </div>
              )}

              {sendStep === 'amount' && (
                <div className="flex flex-col gap-4 animate-fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => setSendStep('input')} className="text-on-surface-variant hover:text-on-surface text-sm font-bold">← Back</button>
                    <p className="text-label-caps font-label-caps text-on-surface-variant">SEND AMOUNT</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <AmountDisplay amount={lnurlSendAmount} compact />
                    {parseInt(lnurlSendAmount) > availableBalance && (
                      <span className="text-[12px] font-label-caps text-error text-center mt-1">Insufficient Balance</span>
                    )}
                  </div>
                  <NumberPad
                    value={lnurlSendAmount}
                    onChange={setLnurlSendAmount}
                    compact
                  />
                  <button
                    onClick={handleNextFromAmount}
                    disabled={!parseInt(lnurlSendAmount) || parseInt(lnurlSendAmount) > availableBalance}
                    className={`mt-2 bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-full shadow-lg transition-all duration-200 flex justify-center items-center ${(!parseInt(lnurlSendAmount) || parseInt(lnurlSendAmount) > availableBalance) ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                      }`}
                  >
                    {isFetchingLnurl ? <Loader2 className="animate-spin w-6 h-6" /> : 'Pay Lightning'}
                  </button>
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
                  className="w-full py-4 rounded-full bg-primary/15 text-primary font-bold text-[15px] hover:bg-primary/25 transition-colors border border-primary/20"
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
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full bg-primary/15 text-primary font-bold text-[15px] hover:bg-primary/25 transition-colors border border-primary/20"
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

                  <button
                    onClick={handleRequestInvoice}
                    disabled={requesting || parsedReceiveAmount <= 0}
                    className={`bg-gradient-to-r from-primary to-primary hover:from-primary/80 hover:to-primary text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-full shadow-lg transition-all duration-200 flex justify-center items-center ${requesting || parsedReceiveAmount <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                      }`}
                  >
                    {requesting ? <Loader2 className="animate-spin w-6 h-6" /> : 'Create Invoice'}
                  </button>
                </div>
              </div>
            )
          )}
        </div>
        {paying ? (
          <FullScreenLoader title="Sending Bitcoin..." message="Executing transaction." />
        ) : null}
      </div>
    </div>,
    document.body
  );
};
