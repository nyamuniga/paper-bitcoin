import React, { useState } from 'react';
import { X, Loader2, Copy, Check, Coins, ArrowUp, ArrowDown, QrCode } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useWalletStore } from '../../store/wallet';
import { useEcash } from '../../hooks/useEcash';
import QRCode from 'react-qr-code';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useUrEncoder } from '../../hooks/useUrEncoder';
import { useUrDecoder } from '../../hooks/useUrDecoder';
import { AmountDisplay } from '../shared/AmountDisplay';
import { NumberPad } from '../shared/NumberPad';
import { MintIcon } from '../shared/MintIcon';
import { FullScreenLoader } from '../shared/FullScreenLoader';
import { formatMintUrl } from '../../utils/format';

interface EcashModalProps {
  mintUrl: string;
  onClose: () => void;
}

type Tab = 'send' | 'receive';

export const EcashModal: React.FC<EcashModalProps> = ({ mintUrl, onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>('send');

  // Send state
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Receive state
  const [receiveToken, setReceiveToken] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState<number | null>(null);
  
  const { sending, receiving, isClaimed, setIsClaimed, sendEcash, receiveEcash, pollTransactionStatus, stopPolling } = useEcash(mintUrl);
  
  const urDecoder = useUrDecoder();

  const mintBalances = useWalletStore((s) => s.mintBalances);
  const availableBalance = mintBalances[mintUrl] || 0;

  const { currentFrame, isAnimated, currentFrameIndex, totalFrames } = useUrEncoder(token || '', 150, 400);

  const parsedAmount = parseInt(amount) || 0;
  const isInsufficient = parsedAmount > availableBalance;
  const isValid = parsedAmount > 0 && !isInsufficient;

  React.useEffect(() => {
    if (!txId || isClaimed) return;
    const cleanup = pollTransactionStatus(txId);
    return () => {
      cleanup?.then(c => c && c());
    };
  }, [txId, isClaimed]);

  const handleSend = async () => {
    if (!isValid) return;
    const result = await sendEcash(parsedAmount);
    if (result) {
      setToken(result.token);
      setTxId(result.tx_id);
    }
  };

  const handleCopy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      toast.success('Token copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleReceive = async () => {
    const trimmed = receiveToken.trim();
    if (!trimmed) return;
    const amount = await receiveEcash(trimmed);
    if (amount !== null) {
      setReceivedAmount(amount);
    }
  };

  const resetSend = () => {
    setAmount('');
    setToken(null);
    setTxId(null);
    setCopied(false);
    setIsClaimed(false);
    stopPolling();
  };

  const resetReceive = () => {
    setReceiveToken('');
    setShowScanner(false);
    setReceivedAmount(null);
    urDecoder.reset();
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'send') resetSend();
    else resetReceive();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface-container-high rounded-2xl w-full max-w-lg border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col relative max-h-[90vh]">
        <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-outline-variant/10 relative z-10">
          <h2 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
            <Coins className="text-primary w-5 h-5" /> Ecash
          </h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant/10 relative z-10">
          <button
            onClick={() => switchTab('send')}
            className={`flex-1 py-3 text-[14px] font-bold tracking-wider flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'send' 
                ? 'text-primary border-b-2 border-primary' 
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <ArrowUp size={16} /> SEND
          </button>
          <button
            onClick={() => switchTab('receive')}
            className={`flex-1 py-3 text-[14px] font-bold tracking-wider flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'receive' 
                ? 'text-primary border-b-2 border-primary' 
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <ArrowDown size={16} /> RECEIVE
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 relative z-10 overflow-y-auto">
          {/* Mint info */}
          <div className="flex flex-col gap-2">
            <p className="text-body-md font-body-md text-on-surface-variant">
              {activeTab === 'send' 
                ? (token ? 'Ecash token created from:' : 'Send ecash token from:')
                : (receivedAmount !== null ? 'Ecash received to:' : 'Receive ecash token to:')}
            </p>
            <div className="flex items-center justify-between bg-surface-container-highest p-3 rounded-xl border border-outline-variant/10">
              <div className="flex items-center gap-2 min-w-0 pr-4">
                <MintIcon mintUrl={mintUrl} className="w-6 h-6 flex-shrink-0 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30" textClassName="text-primary text-[10px] font-bold" />
                <span className="text-body-md font-body-md text-on-surface font-medium truncate">{formatMintUrl(mintUrl)}</span>
              </div>
              <div className="flex items-baseline gap-1 flex-shrink-0 whitespace-nowrap">
                <span className="text-body-md font-body-md font-semibold text-on-surface">₿{availableBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {activeTab === 'send' ? (
            /* ─── SEND TAB ────────────────────────────────────────────── */
            <div className="flex flex-col gap-6">
              {/* Amount input */}
              <div className="flex flex-col gap-4">
                {!token && (
                  <>
                    <AmountDisplay amount={amount} compact />
                    <NumberPad value={amount} onChange={(val) => { setAmount(val); setToken(null); }} compact />
                  </>
                )}
                {isInsufficient && !token && (
                  <p className="text-error text-[12px] font-label-caps text-center">Insufficient balance</p>
                )}

                <button 
                  onClick={handleSend}
                  disabled={sending || !isValid}
                  className={`btn-gradient w-full py-4 rounded-full text-on-primary font-headline-lg-mobile text-[18px] shadow-lg transition-all duration-200 flex justify-center items-center ${
                    sending || !isValid ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                  }`}
                >
                  {sending ? <Loader2 className="animate-spin w-6 h-6" /> : 'Create Token'}
                </button>
              </div>

              {token && (
                <div className="flex flex-col items-center gap-5 border-t border-outline-variant/10 pt-6">
                  <div className="text-center">
                    <p className="text-label-caps font-label-caps text-on-surface-variant mb-1">AMOUNT SENT</p>
                    <p className="text-[28px] font-display-lg text-primary">₿{parsedAmount.toLocaleString()}</p>
                  </div>

                  <div className="relative">
                    {isClaimed ? (
                      <div className="bg-emerald-500/10 p-8 rounded-xl shadow-lg relative border border-emerald-500/20 flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <Check className="w-8 h-8 text-emerald-400" />
                        </div>
                        <p className="text-headline-sm font-headline-sm text-emerald-400 text-center">Token Claimed!</p>
                        <p className="text-body-sm font-body-sm text-emerald-400/80 text-center">The recipient has successfully received these funds.</p>
                      </div>
                    ) : (
                      <>
                        <div className="bg-white p-4 rounded-xl shadow-lg relative">
                          <QRCode value={currentFrame || token} size={200} />
                          {isAnimated && (
                            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-label-caps">
                              {currentFrameIndex + 1}/{totalFrames}
                            </div>
                          )}
                        </div>
                        <div className="absolute inset-0 bg-primary/20 rounded-xl blur-xl -z-10 animate-pulse"></div>
                      </>
                    )}
                  </div>

                  <div className="w-full flex flex-col gap-2">
                    <div 
                      onClick={handleCopy}
                      className="w-full bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 shadow-inner cursor-pointer hover:border-primary/30 transition-colors"
                    >
                      <p className="text-[11px] font-mono text-on-surface-variant break-all line-clamp-3 select-all">{token}</p>
                    </div>
                    <button
                      onClick={handleCopy}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-primary/15 text-primary font-bold text-[15px] hover:bg-primary/25 transition-colors border border-primary/20"
                    >
                      {copied ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> Copy Token</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ─── RECEIVE TAB ─────────────────────────────────────────── */
            receivedAmount !== null ? (
              <div className="flex flex-col items-center gap-5">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <Check size={32} className="text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="text-label-caps font-label-caps text-on-surface-variant mb-1">RECEIVED</p>
                  <p className="text-[28px] font-display-lg text-emerald-400">₿{receivedAmount.toLocaleString()}</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-full py-4 rounded-full bg-primary/15 text-primary font-bold text-[15px] hover:bg-primary/25 transition-colors border border-primary/20"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  {showScanner ? (
                    <div className="relative rounded-xl overflow-hidden border border-outline-variant/30 aspect-square">
                      <Scanner 
                        onScan={(result) => {
                          if (result && result.length > 0) {
                            const text = result[0].rawValue;
                            if (text.toLowerCase().startsWith('ur:')) {
                              const decoded = urDecoder.receivePart(text);
                              if (decoded) {
                                setReceiveToken(decoded);
                                setShowScanner(false);
                              }
                            } else {
                              setReceiveToken(text);
                              setShowScanner(false);
                            }
                          }
                        }} 
                        onError={(e) => toast.error(e.message)}
                      />
                      {urDecoder.progress > 0 && !urDecoder.isSuccess && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-surface-container-highest/80 px-4 py-2 rounded-full text-label-caps font-label-caps text-primary backdrop-blur-md">
                          Scanning: {Math.round(urDecoder.progress * 100)}%
                        </div>
                      )}
                      <button 
                        onClick={() => {
                          setShowScanner(false);
                          urDecoder.reset();
                        }} 
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-surface-container-highest px-4 py-2 rounded-full text-label-caps font-label-caps text-on-surface-variant hover:text-on-surface"
                      >
                        Cancel Scanner
                      </button>
                      {receiving && (
        <FullScreenLoader title="Receiving eCash..." message="Claiming tokens to your wallet." />
      )}
    </div>
                  ) : (
                    <div className="relative">
                      <textarea
                        value={receiveToken}
                        onChange={(e) => setReceiveToken(e.target.value)}
                        className="w-full bg-surface-container-lowest text-on-surface font-label-caps text-label-caps p-4 pr-12 rounded-xl border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:ring-primary focus:outline-none resize-none placeholder:text-on-surface-variant/50"
                        placeholder="Paste cashuA token here to receive..."
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

                  <button 
                    onClick={handleReceive}
                    disabled={receiving || !receiveToken.trim() || showScanner}
                    className={`btn-gradient w-full py-4 rounded-full text-on-primary font-headline-lg-mobile text-[18px] shadow-lg transition-all duration-200 flex justify-center items-center ${
                      receiving || !receiveToken.trim() || showScanner ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
                    }`}
                  >
                    {receiving ? <Loader2 className="animate-spin w-6 h-6" /> : 'Receive Ecash'}
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
      {sending && (
        <FullScreenLoader title="Sending eCash..." message="Creating your tokens." />
      )}
      {receiving && (
        <FullScreenLoader title="Receiving eCash..." message="Claiming tokens to your wallet." />
      )}
    </div>
  );
};
