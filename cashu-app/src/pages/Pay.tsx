import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Zap, QrCode } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useWalletStore } from '../store/wallet';
import { useBitcoin } from '../hooks/useBitcoin';
import { FullScreenLoader } from '../components/shared/FullScreenLoader';
import { PageHeader } from '../components/shared/PageHeader';
import { formatMintUrl } from '../utils/format';
import { MintIcon } from '../components/shared/MintIcon';
import { bech32 } from 'bech32';
import { Buffer } from 'buffer';
import toast from 'react-hot-toast';

interface LnurlParams {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  domain?: string;
}

export const Pay = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as any;
  const mintUrl = state?.mintUrl;

  const [invoice, setInvoice] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const { paying, payInvoice } = useBitcoin(mintUrl);
  const mintBalances = useWalletStore((s) => s.mintBalances);
  const availableBalance = mintUrl ? (mintBalances[mintUrl] || 0) : 0;

  const [lnurlParams, setLnurlParams] = useState<LnurlParams | null>(null);
  const [lnurlAmount, setLnurlAmount] = useState<string>('');
  const [fetchingInvoice, setFetchingInvoice] = useState(false);

  // Process input to detect LNURL / Lightning Address
  useEffect(() => {
    const processInput = async () => {
      const val = invoice.trim();
      if (!val) {
        setLnurlParams(null);
        return;
      }
      
      let url = '';
      
      // Lightning Address
      if (val.match(/^[^@]+@[^@]+\.[^@]+$/)) {
        const [user, domain] = val.split('@');
        url = `https://${domain}/.well-known/lnurlp/${user}`;
      } 
      // LNURL (Bech32)
      else if (val.toLowerCase().startsWith('lnurl1')) {
        try {
          const decoded = bech32.decode(val.toLowerCase(), 2000);
          const bytes = bech32.fromWords(decoded.words);
          url = Buffer.from(bytes).toString('utf8');
        } catch (e) {
          console.warn('Failed to decode LNURL', e);
        }
      }

      if (url) {
        try {
          setFetchingInvoice(true);
          const res = await fetch(url);
          const data = await res.json();
          if (data.status === 'ERROR') {
            toast.error(data.reason || 'Failed to resolve LNURL');
            setLnurlParams(null);
          } else if (data.callback) {
            setLnurlParams({
              callback: data.callback,
              maxSendable: data.maxSendable,
              minSendable: data.minSendable,
              metadata: data.metadata,
              domain: new URL(url).hostname
            });
            setLnurlAmount(Math.floor((data.minSendable || 1000) / 1000).toString());
          }
        } catch (e) {
          toast.error('Failed to fetch LNURL details');
          setLnurlParams(null);
        } finally {
          setFetchingInvoice(false);
        }
      } else {
        setLnurlParams(null);
      }
    };
    
    // Only process if it doesn't look like a standard invoice
    if (!invoice.toLowerCase().startsWith('lnbc')) {
      processInput();
    } else {
      setLnurlParams(null);
    }
  }, [invoice]);

  if (!mintUrl) {
    return (
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding md:px-10 py-6">
        <PageHeader title="Pay Invoice" />
        <div className="text-center py-10 text-on-surface-variant">
          No mint selected. Please go back and select a mint to pay from.
        </div>
      </main>
    );
  }

  const getInvoiceAmountSats = (inv: string): number | null => {
    try {
      const hrp = inv.toLowerCase().split('1')[0];
      if (!hrp) return null;
      const match = hrp.match(/^ln[a-z]+(\d+)([munp]?)$/);
      if (match) {
        let val = parseInt(match[1], 10);
        const mult = match[2];
        if (mult === 'm') val *= 100000;
        else if (mult === 'u') val *= 100;
        else if (mult === 'n') val *= 0.1;
        else if (mult === 'p') val *= 0.0001;
        else val *= 100000000;
        return Math.floor(val);
      }
    } catch (e) {
      return null;
    }
    return null;
  };

  let invoiceAmount = getInvoiceAmountSats(invoice);
  if (lnurlParams) {
    invoiceAmount = parseInt(lnurlAmount) || 0;
  }

  const isZeroAmount = invoiceAmount === 0 || isNaN(invoiceAmount as number);
  const isInsufficient = invoiceAmount !== null && invoiceAmount > availableBalance;
  
  let isOutOflnurlBounds = false;
  if (lnurlParams && invoiceAmount !== null) {
    const amtMsat = invoiceAmount * 1000;
    if (amtMsat < lnurlParams.minSendable || amtMsat > lnurlParams.maxSendable) {
      isOutOflnurlBounds = true;
    }
  }

  const isInvalidAmount = isInsufficient || isZeroAmount || isOutOflnurlBounds;

  const handlePay = async () => {
    if (lnurlParams) {
      const amtSats = parseInt(lnurlAmount);
      if (!amtSats || amtSats <= 0 || isInvalidAmount) return;
      
      try {
        setFetchingInvoice(true);
        const res = await fetch(`${lnurlParams.callback}${lnurlParams.callback.includes('?') ? '&' : '?'}amount=${amtSats * 1000}`);
        const data = await res.json();
        
        if (data.status === 'ERROR') {
          toast.error(data.reason || 'Failed to fetch invoice from LNURL provider');
          setFetchingInvoice(false);
          return;
        }
        
        if (data.pr) {
          const success = await payInvoice(data.pr);
          if (success) {
            navigate('/');
          }
        } else {
          toast.error('Invalid response from LNURL provider');
        }
      } catch (e) {
        toast.error('Failed to fetch invoice');
      } finally {
        setFetchingInvoice(false);
      }
      return;
    }
    
    if (!invoice || isInvalidAmount) return;
    const success = await payInvoice(invoice);
    if (success) {
      navigate('/');
    }
  };

  return (
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding md:px-10 py-6 flex flex-col items-center">
      <div className="w-full max-w-2xl mb-6">
        <PageHeader title="Pay Lightning Invoice" />
      </div>

      <div className="w-full max-w-2xl bg-surface-container-high rounded-xl relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] p-card-gap flex flex-col gap-8 border border-outline-variant/30">
        <div className="noise-overlay"></div>
        <div className="flex flex-col gap-6 w-full">
          
          <div className="flex flex-col gap-2">
            <p className="text-body-md font-body-md text-on-surface-variant">
              Paying from mint:
            </p>
            <div className="flex items-center justify-between bg-surface-container-highest p-3 rounded-xl border border-outline-variant/10">
              <div className="flex items-center gap-2 min-w-0 pr-4">
                <MintIcon mintUrl={mintUrl} className="w-6 h-6 flex-shrink-0 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30" textClassName="text-primary text-[10px] font-bold" />
                <span className="text-body-md font-body-md text-on-surface font-medium truncate">{formatMintUrl(mintUrl)}</span>
              </div>
              <div className="flex items-baseline gap-1 flex-shrink-0 whitespace-nowrap">
                <span className="text-body-md font-body-md font-semibold text-on-surface">{availableBalance.toLocaleString()}</span>
                <span className="text-label-caps font-label-caps text-on-surface-variant text-[10px]">₿</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {showScanner ? (
              <div className="rounded-xl overflow-hidden border-2 border-primary">
                <Scanner
                  formats={['qr_code']}
                  onScan={(result) => {
                    if (!result || result.length === 0) return;
                    let val = result[0].rawValue;
                    if (val.toLowerCase().startsWith('lightning:')) {
                      val = val.substring(10);
                    }
                    if (val) {
                      setShowScanner(false);
                      setInvoice(val);
                    }
                  }}
                />
                <button onClick={() => setShowScanner(false)} className="w-full mt-2 text-on-surface-variant hover:text-on-surface py-2 text-label-caps font-label-caps">Cancel Scanner</button>
              </div>
            ) : (
              <button
                onClick={() => setShowScanner(true)}
                className="w-full aspect-[21/9] sm:aspect-[21/7] rounded-lg border-2 border-dashed border-outline-variant/50 hover:border-amber-400/50 transition-colors flex flex-col items-center justify-center gap-4 group relative bg-surface-container-lowest/50"
              >
                <div className="absolute inset-0 bg-amber-400/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"></div>
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-amber-400 rounded-tl-sm shadow-[0_0_10px_rgba(251,191,36,0.3)]"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-amber-400 rounded-tr-sm shadow-[0_0_10px_rgba(251,191,36,0.3)]"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-amber-400 rounded-bl-sm shadow-[0_0_10px_rgba(251,191,36,0.3)]"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-amber-400 rounded-br-sm shadow-[0_0_10px_rgba(251,191,36,0.3)]"></div>
                  <QrCode className="w-10 h-10 text-amber-400 opacity-80 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-label-caps font-label-caps text-amber-400 relative z-10">Tap to Scan Lightning QR</span>
              </button>
            )}

            <div className="flex items-center gap-4 w-full px-4 my-2">
              <div className="flex-grow h-px bg-outline-variant/30"></div>
              <span className="text-label-caps font-label-caps text-on-surface-variant opacity-60">OR PASTE</span>
              <div className="flex-grow h-px bg-outline-variant/30"></div>
            </div>

            <div className="relative flex flex-col gap-2">
              {!lnurlParams ? (
                <div className={`relative glow-effect transition-shadow duration-300 rounded-lg ${isInvalidAmount && invoice ? 'shadow-[0_0_15px_rgba(239,68,68,0.3)]' : ''}`}>
                  <textarea 
                    value={invoice}
                    onChange={(e) => setInvoice(e.target.value)}
                    className={`w-full bg-surface-container-lowest text-on-surface font-label-caps text-label-caps p-4 rounded-lg border-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:ring-1 focus:outline-none resize-none placeholder:text-on-surface-variant/50 ${isInvalidAmount && invoice ? 'focus:ring-error ring-1 ring-error/50' : 'focus:ring-amber-400'}`} 
                    placeholder="lnbc... or user@domain.com" 
                    rows={4}
                    spellCheck="false"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-4 bg-surface-container-lowest p-4 rounded-lg shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                  <div className="flex justify-between items-center">
                    <span className="text-on-surface-variant font-label-caps text-xs">Paying</span>
                    <span className="text-amber-400 font-bold truncate">{lnurlParams.domain || 'LNURL'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-on-surface-variant font-label-caps text-xs">Amount (sats)</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number"
                        value={lnurlAmount}
                        onChange={(e) => setLnurlAmount(e.target.value)}
                        className="flex-1 bg-surface-container text-on-surface font-bold text-xl p-3 rounded-lg border-none focus:ring-1 focus:ring-amber-400 outline-none"
                        placeholder="0"
                      />
                      <span className="text-amber-400 font-bold">sats</span>
                    </div>
                    <div className="text-[10px] text-on-surface-variant/70 flex justify-between mt-1">
                      <span>Min: {Math.ceil(lnurlParams.minSendable / 1000)} sats</span>
                      <span>Max: {Math.floor(lnurlParams.maxSendable / 1000)} sats</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setInvoice('');
                      setLnurlParams(null);
                    }}
                    className="text-error hover:text-error/80 text-xs font-bold text-right mt-2"
                  >
                    Cancel LNURL
                  </button>
                </div>
              )}
              
              {invoiceAmount !== null && !lnurlParams && (
                <div className={`text-[12px] font-label-caps px-1 ${isInvalidAmount ? 'text-error' : 'text-on-surface-variant'}`}>
                  Invoice Amount: ₿{invoiceAmount.toLocaleString()}
                  {isInsufficient && ' (Insufficient balance)'}
                  {isZeroAmount && ' (Amount must be greater than 0)'}
                </div>
              )}
              {isOutOflnurlBounds && lnurlParams && (
                <div className="text-[12px] font-label-caps px-1 text-error">
                  Amount must be between {Math.ceil(lnurlParams.minSendable / 1000)} and {Math.floor(lnurlParams.maxSendable / 1000)} sats
                </div>
              )}
              {isInsufficient && lnurlParams && (
                <div className="text-[12px] font-label-caps px-1 text-error">
                  Insufficient balance
                </div>
              )}
            </div>

            <button 
              onClick={handlePay}
              disabled={paying || fetchingInvoice || (!invoice && !lnurlParams) || isInvalidAmount}
              className={`mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-on-primary font-headline-lg-mobile text-[18px] w-full py-4 rounded-full shadow-lg transition-all duration-200 flex justify-center items-center ${
                paying || fetchingInvoice || (!invoice && !lnurlParams) || isInvalidAmount ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 active:scale-[0.98]'
              }`}
            >
              {paying || fetchingInvoice ? <Loader2 className="animate-spin w-6 h-6" /> : <><Zap className="w-5 h-5 mr-2" /> Pay {lnurlParams ? 'LNURL' : 'Invoice'}</>}
            </button>
          </div>
        </div>
      </div>
      {(paying || fetchingInvoice) && (
        <FullScreenLoader title={fetchingInvoice ? "Resolving LNURL..." : "Sending Bitcoin..."} message={fetchingInvoice ? "Getting lightning invoice from provider." : "Paying the lightning invoice."} />
      )}
    </main>
  );
};
export default Pay;
