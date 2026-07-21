import React, { useState, useEffect } from 'react';
import { X, Phone, PhoneOutgoing, PhoneIncoming, ChevronDown } from 'lucide-react';
import { AppPhase } from '../../types/momo';
import { calculateQuote, calculateSendQuote, fetchCurrentRate, fetchProxyBlinkBalance } from '../../services/flowServices';
import { useWalletStore } from '../../store/wallet';
import { useTransactionStore } from '../../store/transactionStore';
import { MintIcon } from '../shared/MintIcon';
import { MintName } from '../shared/MintName';
import { createPortal } from 'react-dom';

interface MomoTransferModalProps {
  initialTab?: 'send' | 'receive';
  onClose: () => void;
  mintUrl?: string;
}

export const MomoTransferModal: React.FC<MomoTransferModalProps> = ({
  initialTab = 'receive',
  onClose,
  mintUrl: initialMintUrl = ''
}) => {
  const { activeTransaction, error, setError, updateTransactionPhase, setActiveTransaction } = useTransactionStore();
  const phase = activeTransaction?.currentPhase || AppPhase.IDLE;

  const initialDerivedTab = activeTransaction 
    ? (activeTransaction.direction === 'RWF_TO_SATS' ? 'receive' : 'send')
    : initialTab;

  const [activeTab, setActiveTab] = useState<'send' | 'receive'>(initialDerivedTab);
  const [amount, setAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [mintUrl, setMintUrl] = useState(initialMintUrl);
  const [showMintDropdown, setShowMintDropdown] = useState(false);

  const mintBalances = useWalletStore((s) => s.mintBalances);
  const mintUrls = Object.keys(mintBalances || {});
  const availableBalance = mintBalances ? mintBalances[mintUrl] || 0 : 0;

  useEffect(() => {
    if (!mintUrl && mintUrls.length > 0) {
      setMintUrl(mintUrls[0]);
    }
  }, [mintUrl, mintUrls]);

  const [currentRate, setCurrentRate] = useState<number | null>(null);
  const [proxyBalance, setProxyBalance] = useState<number | null>(null);
  const [isFetchingRate, setIsFetchingRate] = useState(false);

  useEffect(() => {
    const fetchRatesAndBalances = async () => {
      if (!currentRate) {
        setIsFetchingRate(true);
        try {
          const rate = await fetchCurrentRate();
          setCurrentRate(rate);
        } catch (e) {
          console.error("Failed to fetch rate for validation", e);
        } finally {
          setIsFetchingRate(false);
        }
      }

      if (activeTab === 'receive' && proxyBalance === null) {
        try {
          const balance = await fetchProxyBlinkBalance();
          setProxyBalance(balance);
        } catch (e) {
          console.error("Failed to fetch proxy balance", e);
        }
      }
    };
    fetchRatesAndBalances();
  }, [activeTab, currentRate, proxyBalance]);

  const amountNum = parseFloat(amount);
  let amountError = '';
  let phoneError = '';

  if (amount) {
    if (isNaN(amountNum) || amountNum < 100) {
      amountError = 'Minimum amount is 100 RWF.';
    } else if (amountNum > 200000) {
      amountError = 'Maximum amount is 200,000 RWF.';
    } else if (activeTab === 'send' && currentRate) {
      const feeRwf = Math.ceil(amountNum * 0.03);
      const totalRwf = amountNum + feeRwf;
      const estimatedSats = Math.floor(totalRwf * currentRate);
      if (estimatedSats > availableBalance) {
        amountError = `Insufficient balance. Estimated cost: ~${estimatedSats.toLocaleString()} sats.`;
      }
    } else if (activeTab === 'receive' && currentRate && proxyBalance !== null) {
      const estimatedSats = Math.floor(amountNum * currentRate);
      if (estimatedSats > proxyBalance) {
        amountError = `Gateway has insufficient liquidity to process this amount right now. Please try a smaller amount.`;
      }
    }
  }

  if (phoneNumber && !/^07[89]\d{7}$/.test(phoneNumber)) {
    phoneError = 'Phone number must start with 078 or 079 and be exactly 10 digits.';
  }

  const isFormValid = amount && phoneNumber && !amountError && !phoneError && !isFetchingRate && phase === AppPhase.IDLE;

  const handleReceiveFromMomo = async () => {
    setError(null);
    await calculateQuote(amount, phoneNumber, 'ecash', mintUrl);
  };

  const handleSendToMomo = async () => {
    setError(null);
    await calculateSendQuote(amount, phoneNumber, 'ecash', mintUrl);
  };

  const switchTab = (tab: 'send' | 'receive') => {
    if (phase !== AppPhase.IDLE && phase !== AppPhase.READY_TO_CLAIM && phase !== AppPhase.RETRYABLE_ERROR) return;
    setActiveTab(tab);
    setAmount('');
    setPhoneNumber('');
    setError(null);
    if (phase === AppPhase.RETRYABLE_ERROR) {
       setActiveTransaction(null);
    }
  };

  const handleClose = () => {
    const isProcessPhase = phase !== AppPhase.IDLE && 
                           phase !== AppPhase.READY_TO_CLAIM && 
                           phase !== AppPhase.PAYMENT_FAILED && 
                           phase !== AppPhase.RETRYABLE_ERROR;
    
    if (isProcessPhase) {
      return;
    }

    if (phase === AppPhase.READY_TO_CLAIM || phase === AppPhase.PAYMENT_FAILED || phase === AppPhase.RETRYABLE_ERROR) {
      setActiveTransaction(null);
      setError(null);
    }
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-surface-container-high rounded-2xl border border-outline-variant/20 shadow-2xl flex flex-col overflow-hidden relative max-h-[90vh] animate-slide-up"
      >
        <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>

        {phase === AppPhase.IDLE && (
          <>
            <div className="flex items-center justify-between p-4 relative z-10 border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Phone className=" text-primary" size={20} />
                </div>
                <h2 className="text-headline-sm font-headline-sm text-on-surface">RWF Mobile Money</h2>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex border-b border-outline-variant/10 relative z-10">
              <button
                onClick={() => switchTab('send')}
                className={`flex-1 py-3 text-[14px] font-bold tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'send'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
                  }`}
              >
                <PhoneOutgoing size={16} /> SEND RWF
              </button>
              <button
                onClick={() => switchTab('receive')}
                className={`flex-1 py-3 text-[14px] font-bold tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'receive'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
                  }`}
              >
                <PhoneIncoming size={16} /> RECEIVE RWF
              </button>
            </div>
          </>
        )}

        <div className="flex-1 overflow-y-auto p-6 relative z-10 custom-scrollbar">
          {error && (
            <div className="p-3 mb-4 rounded-xl bg-error/10 text-error text-body-md text-center">
              {error}
            </div>
          )}

          {/* Mint info */}
          {phase === AppPhase.IDLE && (
            <div className="flex flex-col gap-2 mb-6">
              <p className="text-body-md font-body-md text-on-surface-variant">
                {activeTab === 'send'
                  ? 'Pay MoMo from mint:'
                  : 'Receive MoMo to mint:'}
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

          {activeTab === 'receive' && (
            <div className="flex flex-col gap-4">
              {phase === AppPhase.READY_TO_CLAIM ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-4">
                    <PhoneIncoming size={32} />
                  </div>
                  <h3 className="text-headline-md text-on-surface mb-2">Success!</h3>
                  <p className="text-body-md text-on-surface-variant">Sats have been minted to your wallet.</p>
                  <button
                    onClick={handleClose}
                    className="w-full mt-6 bg-primary text-on-primary py-4 rounded-2xl font-label-lg"
                  >
                    Close
                  </button>
                </div>
              ) : phase === AppPhase.PAYMENT_FAILED || phase === AppPhase.RETRYABLE_ERROR ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-error/20 text-error flex items-center justify-center mx-auto mb-4">
                    <X size={32} />
                  </div>
                  <h3 className="text-headline-md text-on-surface mb-2">Transfer Failed</h3>
                  <p className="text-body-md text-on-surface-variant mb-6">{error || "Something went wrong."}</p>
                  {phase === AppPhase.RETRYABLE_ERROR ? (
                    <div className="flex gap-3">
                      <button onClick={handleClose} className="flex-1 py-4 rounded-2xl font-label-lg border border-outline-variant/20 hover:bg-surface-container-highest">Cancel</button>
                      <button onClick={() => updateTransactionPhase(AppPhase.VERIFYING_PAYMENT)} className="flex-1 bg-primary text-on-primary py-4 rounded-2xl font-label-lg">Retry</button>
                    </div>
                  ) : (
                    <button onClick={handleClose} className="w-full bg-surface-container-highest text-on-surface py-4 rounded-2xl font-label-lg hover:bg-surface-bright">Close</button>
                  )}
                </div>
              ) : [AppPhase.FETCHING_RATE, AppPhase.INITIATING_PAYMENT, AppPhase.PENDING_PAYMENT, AppPhase.VERIFYING_PAYMENT, AppPhase.PAYING_INVOICE, AppPhase.FULFILLING].includes(phase) ? (
                <div className="py-6 px-4">
                  <h3 className="text-headline-md text-on-surface mb-6 text-center">Processing Transfer</h3>

                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center w-8 h-8">
                        {[AppPhase.FETCHING_RATE, AppPhase.INITIATING_PAYMENT].includes(phase) ? (
                          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-label-lg ${[AppPhase.FETCHING_RATE, AppPhase.INITIATING_PAYMENT].includes(phase) ? 'text-primary' : 'text-on-surface'}`}>Initiating Transaction</p>
                        <p className="text-body-sm text-on-surface-variant">Generating quote and securing rates</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center w-8 h-8">
                        {phase === AppPhase.PENDING_PAYMENT || phase === AppPhase.VERIFYING_PAYMENT ? (
                          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : [AppPhase.PAYING_INVOICE, AppPhase.FULFILLING].includes(phase) ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-outline-variant/50" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-label-lg ${phase === AppPhase.PENDING_PAYMENT || phase === AppPhase.VERIFYING_PAYMENT ? 'text-primary' : [AppPhase.PAYING_INVOICE, AppPhase.FULFILLING].includes(phase) ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>Awaiting MoMo Approval</p>
                        <p className={`text-body-sm ${phase === AppPhase.PENDING_PAYMENT || phase === AppPhase.VERIFYING_PAYMENT ? 'text-on-surface-variant' : 'text-on-surface-variant/50'}`}>Please enter your PIN on your phone</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center w-8 h-8">
                        {phase === AppPhase.PAYING_INVOICE ? (
                          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : phase === AppPhase.FULFILLING ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-outline-variant/50" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-label-lg ${phase === AppPhase.PAYING_INVOICE ? 'text-primary' : phase === AppPhase.FULFILLING ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>Paying Lightning Invoice</p>
                        <p className={`text-body-sm ${phase === AppPhase.PAYING_INVOICE ? 'text-on-surface-variant' : 'text-on-surface-variant/50'}`}>Funding the Cashu Mint via proxy</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center w-8 h-8">
                        {phase === AppPhase.FULFILLING ? (
                          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-outline-variant/50" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-label-lg ${phase === AppPhase.FULFILLING ? 'text-primary' : 'text-on-surface-variant/50'}`}>Minting eCash</p>
                        <p className={`text-body-sm ${phase === AppPhase.FULFILLING ? 'text-on-surface-variant' : 'text-on-surface-variant/50'}`}>Issuing tokens to your wallet</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-label-md text-on-surface-variant block mb-2">Phone Number</label>
                    <input
                      type="text"
                      spellCheck={false}
                      placeholder="078..."
                      className={`w-full bg-surface-container-highest rounded-2xl p-4 text-body-lg text-on-surface focus:outline-none focus:ring-2 ${phoneError ? 'border border-error focus:ring-error/50' : 'focus:ring-primary/50'}`}
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value)}
                    />
                    {phoneError && <p className="text-error text-label-sm mt-2 ml-2">{phoneError}</p>}
                  </div>
                  <div>
                    <label className="text-label-md text-on-surface-variant block mb-2">Amount to Receive (RWF)</label>
                    <input
                      type="number"
                      spellCheck={false}
                      placeholder="Amount in RWF"
                      className={`w-full bg-surface-container-highest rounded-2xl p-4 text-body-lg text-on-surface focus:outline-none focus:ring-2 ${amountError ? 'border border-error focus:ring-error/50' : 'focus:ring-primary/50'}`}
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                    />
                    {amountError && <p className="text-error text-label-sm mt-2 ml-2">{amountError}</p>}
                  </div>
                  <button
                    onClick={handleReceiveFromMomo}
                    disabled={!isFormValid}
                    className="w-full mt-4 bg-primary text-on-primary py-4 rounded-2xl font-label-lg disabled:opacity-50"
                  >
                    {phase === AppPhase.FETCHING_RATE ? 'Calculating...' : phase === AppPhase.INITIATING_PAYMENT ? 'Initiating...' : 'Request from MoMo'}
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
                  <p className="text-body-md text-on-surface-variant">RWF has been sent successfully to the mobile money number.</p>
                  <button
                    onClick={handleClose}
                    className="w-full mt-6 bg-primary text-on-primary py-4 rounded-2xl font-label-lg"
                  >
                    Close
                  </button>
                </div>
              ) : phase === AppPhase.PAYMENT_FAILED || phase === AppPhase.RETRYABLE_ERROR ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-error/20 text-error flex items-center justify-center mx-auto mb-4">
                    <X size={32} />
                  </div>
                  <h3 className="text-headline-md text-on-surface mb-2">Transfer Failed</h3>
                  <p className="text-body-md text-on-surface-variant mb-6">{error || "Something went wrong."}</p>
                  {phase === AppPhase.RETRYABLE_ERROR ? (
                    <div className="flex gap-3">
                      <button onClick={handleClose} className="flex-1 py-4 rounded-2xl font-label-lg border border-outline-variant/20 hover:bg-surface-container-highest">Cancel</button>
                      <button onClick={() => updateTransactionPhase(AppPhase.AWAITING_INVOICE_PAYMENT)} className="flex-1 bg-primary text-on-primary py-4 rounded-2xl font-label-lg">Retry</button>
                    </div>
                  ) : (
                    <button onClick={handleClose} className="w-full bg-surface-container-highest text-on-surface py-4 rounded-2xl font-label-lg hover:bg-surface-bright">Close</button>
                  )}
                </div>
              ) : [AppPhase.GENERATING_INVOICE, AppPhase.AWAITING_INVOICE_PAYMENT, AppPhase.PAYING_INVOICE, AppPhase.INITIATING_PAYOUT, AppPhase.VERIFYING_PAYOUT].includes(phase) ? (
                <div className="py-6 px-4">
                  <h3 className="text-headline-md text-on-surface mb-6 text-center">Processing Send</h3>

                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center w-8 h-8">
                        {phase === AppPhase.GENERATING_INVOICE ? (
                          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-label-lg ${phase === AppPhase.GENERATING_INVOICE ? 'text-primary' : 'text-on-surface'}`}>Calculating Quote</p>
                        <p className="text-body-sm text-on-surface-variant">Securing exchange rate and invoice</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center w-8 h-8">
                        {[AppPhase.AWAITING_INVOICE_PAYMENT, AppPhase.PAYING_INVOICE].includes(phase) ? (
                          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : [AppPhase.INITIATING_PAYOUT, AppPhase.VERIFYING_PAYOUT].includes(phase) ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-outline-variant/50" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-label-lg ${[AppPhase.AWAITING_INVOICE_PAYMENT, AppPhase.PAYING_INVOICE].includes(phase) ? 'text-primary' : [AppPhase.INITIATING_PAYOUT, AppPhase.VERIFYING_PAYOUT].includes(phase) ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>Funding Transfer</p>
                        <p className={`text-body-sm ${[AppPhase.AWAITING_INVOICE_PAYMENT, AppPhase.PAYING_INVOICE].includes(phase) ? 'text-on-surface-variant' : 'text-on-surface-variant/50'}`}>Paying Lightning invoice from eCash</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center w-8 h-8">
                        {phase === AppPhase.INITIATING_PAYOUT ? (
                          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : phase === AppPhase.VERIFYING_PAYOUT ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-outline-variant/50" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-label-lg ${phase === AppPhase.INITIATING_PAYOUT ? 'text-primary' : phase === AppPhase.VERIFYING_PAYOUT ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>Initiating MoMo Payout</p>
                        <p className={`text-body-sm ${phase === AppPhase.INITIATING_PAYOUT ? 'text-on-surface-variant' : 'text-on-surface-variant/50'}`}>Instructing gateway to send RWF</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center w-8 h-8">
                        {phase === AppPhase.VERIFYING_PAYOUT ? (
                          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-outline-variant/50" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-label-lg ${phase === AppPhase.VERIFYING_PAYOUT ? 'text-primary' : 'text-on-surface-variant/50'}`}>Verifying Transfer</p>
                        <p className={`text-body-sm ${phase === AppPhase.VERIFYING_PAYOUT ? 'text-on-surface-variant' : 'text-on-surface-variant/50'}`}>Waiting for MoMo network confirmation</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-label-md text-on-surface-variant block mb-2">Recipient Phone Number</label>
                    <input
                      type="text"
                      spellCheck={false}
                      placeholder="078..."
                      className={`w-full bg-surface-container-highest rounded-2xl p-4 text-body-lg text-on-surface focus:outline-none focus:ring-2 ${phoneError ? 'border border-error focus:ring-error/50' : 'focus:ring-primary/50'}`}
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value)}
                    />
                    {phoneError && <p className="text-error text-label-sm mt-2 ml-2">{phoneError}</p>}
                  </div>
                  <div>
                    <label className="text-label-md text-on-surface-variant block mb-2">Amount to Send (RWF)</label>
                    <input
                      type="number"
                      spellCheck={false}
                      placeholder="Amount in RWF"
                      className={`w-full bg-surface-container-highest rounded-2xl p-4 text-body-lg text-on-surface focus:outline-none focus:ring-2 ${amountError ? 'border border-error focus:ring-error/50' : 'focus:ring-primary/50'}`}
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                    />
                    {amountError && <p className="text-error text-label-sm mt-2 ml-2">{amountError}</p>}
                  </div>
                  <button
                    onClick={handleSendToMomo}
                    disabled={!isFormValid}
                    className="w-full mt-4 bg-primary text-on-primary py-4 rounded-2xl font-label-lg disabled:opacity-50 transition-all"
                  >
                    {isFetchingRate ? 'Loading rates...' : 'Send to MoMo'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
