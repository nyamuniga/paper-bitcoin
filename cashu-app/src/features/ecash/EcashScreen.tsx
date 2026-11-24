import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, Coins, ArrowUp, ArrowDown, QrCode } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { nip19 } from 'nostr-tools';
import { useWalletStore } from '../../store/wallet';
import { useEcash } from '../../hooks/useEcash';
import { useUrEncoder } from '../../hooks/useUrEncoder';
import { useUrDecoder } from '../../hooks/useUrDecoder';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { NumberPad } from '../../components/shared/NumberPad';
import { MintBalancePicker } from '../../components/shared/MintBalancePicker';
import { SovereignStampOverlay, StampPaymentStatus } from '../../components/shared/SovereignStampOverlay';
import { FullScreenLoader } from '../../components/shared/FullScreenLoader';
import { parseReceivedTokenPreview } from '../../services/receivedTokenPreview';
import { readClipboardText, writeClipboardText } from '../../utils/clipboard';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { EcashReceiveInvoice } from '../../components/home/EcashReceiveInvoice';
import { EcashRequestPayment } from '../../components/home/EcashRequestPayment';
import { PageHeader } from '../../components/shared/PageHeader';
import { isCashuRequest } from '../../services/cashuRequests';
import { saveEcashForLater } from '../../services/ecashNativeAdapter';
import { EcashSendView } from './EcashSendView';
import { EcashReceiveView } from './EcashReceiveView';
import '../../components/home/SendEcashPage.css';
import '../../components/home/EcashFields.css';

export interface EcashScreenProps {
  page?: boolean;
  mintUrl: string;
  initialTab?: 'send' | 'receive';
  initialToken?: string;
  initialRequest?: string;
  onClose: () => void;
}

type Tab = 'send' | 'receive';

export const EcashScreen: React.FC<EcashScreenProps> = ({
  mintUrl: initialMintUrl,
  initialTab = 'send',
  initialToken,
  initialRequest,
  onClose,
  page = false,
}) => {
  const { dragHandleProps, sheetStyle, backdropStyle, closeWithAnimation } = useBottomSheet({ onClose, modal: !page });
  const navigate = useNavigate();
  React.useEffect(() => {
    if (!page) {
      navigate(initialTab === 'send' ? '/send-ecash' : '/receive-ecash', {
        state: { mintUrl: initialMintUrl, ecashRequest: initialRequest, ecashToken: initialToken },
      });
      onClose();
    }
  }, [page, initialTab, initialMintUrl, initialRequest, initialToken, navigate, onClose]);

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [mintUrl, setMintUrl] = useState(initialMintUrl);

  // Send state
  const [amount, setAmount] = useState('');
  const [pubkey, setPubkey] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [tokenV3, setTokenV3] = useState<string | null>(null);
  const [tokenV4, setTokenV4] = useState<string | null>(null);
  const [formatVersion, setFormatVersion] = useState<'v3' | 'v4'>('v3');
  const [copied, setCopied] = useState(false);

  // Receive state
  const [receiveToken, setReceiveToken] = useState(initialToken || '');
  const receivePreview = useMemo(() => {
    try {
      return parseReceivedTokenPreview(receiveToken);
    } catch {
      return null;
    }
  }, [receiveToken]);
  const [savingToken, setSavingToken] = useState(false);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const [showScanner, setShowScanner] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState<number | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [scannedRequest, setScannedRequest] = useState(initialRequest);

  // Overlay state
  const [paymentStatus, setPaymentStatus] = useState<StampPaymentStatus | null>(null);
  const [paymentErrorMessage, setPaymentErrorMessage] = useState('');
  const [paymentAmount, setPaymentAmount] = useState<number | undefined>(undefined);
  const [paymentTitle, setPaymentTitle] = useState<string | undefined>(undefined);
  const [paymentSubtitle, setPaymentSubtitle] = useState<string | undefined>(undefined);
  const [paymentBadgeLabel, setPaymentBadgeLabel] = useState<string | undefined>(undefined);
  const [lastAction, setLastAction] = useState<(() => void) | undefined>(undefined);
  const [hasCelebratedClaim, setHasCelebratedClaim] = useState(false);

  const { sending, receiving, isClaimed, setIsClaimed, sendEcash, receiveEcash, trackOutgoing } = useEcash(mintUrl);
  const urDecoder = useUrDecoder();

  const mintBalances = useWalletStore((s) => s.mintBalances);
  const mintUrls = Object.keys(mintBalances || {});
  const availableBalance = mintBalances[mintUrl] || 0;

  const handleTokenInput = (text: string) => {
    setReceiveToken(text);
    let extractedMint: string | null = null;
    try {
      extractedMint = parseReceivedTokenPreview(text).mint;
    } catch {
      /* Incomplete input remains editable. */
    }
    if (extractedMint) {
      const normalizedExtracted = extractedMint.replace(/\/$/, '');
      const matchedMint = mintUrls.find((m) => m.replace(/\/$/, '') === normalizedExtracted) || extractedMint;
      if (matchedMint !== mintUrl) {
        setMintUrl(matchedMint);
      }
    }
  };

  React.useEffect(() => {
    if (initialToken) {
      handleTokenInput(initialToken);
    }
  }, [initialToken]);

  const { currentFrame, isAnimated, currentFrameIndex, totalFrames } = useUrEncoder(token || '', 150, 400);

  const parsedAmount = parseInt(amount) || 0;
  const isInsufficient = parsedAmount > availableBalance;
  const isValid = parsedAmount > 0 && !isInsufficient;

  React.useEffect(() => {
    if (isClaimed && !hasCelebratedClaim && token) {
      setHasCelebratedClaim(true);
      setPaymentAmount(paymentAmount || parsedAmount);
      setPaymentTitle('eCash Claimed');
      setPaymentSubtitle('The recipient has claimed your eCash token.');
      setPaymentBadgeLabel('Claimed');
      setPaymentStatus('success');
    }
  }, [isClaimed, hasCelebratedClaim, token, paymentAmount, parsedAmount]);

  const handleSend = async () => {
    if (!isValid || requestBusy) return;

    let targetPubkey = pubkey.trim();
    if (targetPubkey) {
      if (targetPubkey.startsWith('npub')) {
        try {
          const decoded = nip19.decode(targetPubkey);
          if (decoded.type === 'npub') {
            targetPubkey = decoded.data as string;
          }
        } catch {
          toast.error('Invalid npub');
          return;
        }
      }
      if (targetPubkey.length === 64) {
        targetPubkey = `02${targetPubkey}`;
      }
    }

    setPaymentAmount(parsedAmount);
    let mintErr = '';
    const result = await sendEcash(parsedAmount, undefined, targetPubkey || undefined, {
      silent: true,
      onError: (msg) => {
        mintErr = msg;
      },
    });
    if (result) {
      setToken(result.token);
      setTokenV3(result.token_v3 || result.token);
      setTokenV4(result.token_v4 || result.token);
      setFormatVersion('v3');
      setHasCelebratedClaim(false);
    } else {
      toast.error(mintErr || 'Could not create eCash token from mint.');
    }
  };

  const handleCopy = async () => {
    if (!token) return;
    try {
      await writeClipboardText(token);
      setCopied(true);
      toast.success('Token copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleReceive = async () => {
    if (!receivePreview || savingToken) return;
    let trimmed = receivePreview.token;
    if (trimmed.toLowerCase().startsWith('cashu://')) {
      trimmed = trimmed.substring(8).trim();
    } else if (trimmed.toLowerCase().startsWith('cashu:')) {
      trimmed = trimmed.substring(6).trim();
    }
    setPaymentErrorMessage('');
    setLastAction(() => handleReceive);

    let mintErr = '';
    const received = await receiveEcash(trimmed, {
      silent: true,
      onError: (msg) => {
        mintErr = msg;
      },
    });
    if (received !== null) {
      setReceivedAmount(received);
      setPaymentAmount(received);
      setPaymentTitle('eCash Received');
      setPaymentSubtitle('Tokens claimed and balance settled to your wallet.');
      setPaymentBadgeLabel('Received');
      setPaymentStatus('success');
    } else {
      const lower = (mintErr || '').toLowerCase();
      const isAlreadySpent =
        lower.includes('already spent') ||
        lower.includes('already signed') ||
        lower.includes('already issued') ||
        lower.includes('already redeemed') ||
        lower.includes('could not be recovered');
      if (isAlreadySpent) {
        setPaymentTitle('Token Already Used');
        setPaymentSubtitle('This eCash token has already been claimed or redeemed.');
        setPaymentErrorMessage(mintErr || 'Tokens are already spent and cannot be claimed again.');
        setPaymentBadgeLabel('Already Spent');
      } else {
        setPaymentTitle('Claim Failed');
        setPaymentSubtitle(mintErr || 'Failed to claim eCash token.');
        setPaymentErrorMessage(mintErr || 'The mint rejected this token proof.');
        setPaymentBadgeLabel('Failed');
      }
      setPaymentStatus('failed');
    }
  };

  const handleClaimLater = async () => {
    if (!receivePreview || receiving || savingToken) return;
    setSavingToken(true);
    try {
      await saveEcashForLater(receivePreview.token);
      await refreshWallet();
      toast.success('Token saved in History. Claim it whenever you’re ready.');
      navigate('/');
    } catch {
      toast.error('Could not save the token. Please try again.');
    } finally {
      setSavingToken(false);
    }
  };

  const resetSend = () => {
    setAmount('');
    setToken(null);
    setTokenV3(null);
    setTokenV4(null);
    setFormatVersion('v3');
    setCopied(false);
    setIsClaimed(false);
    setHasCelebratedClaim(false);
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

  const handleSendScanText = (text: string) => {
    if (isCashuRequest(text)) {
      resetSend();
      setScannedRequest(text);
      setShowScanner(false);
      return;
    }
    if (text.startsWith('npub')) {
      try {
        const decoded = nip19.decode(text);
        if (decoded.type === 'npub') {
          let hex = decoded.data as string;
          if (hex.length === 64) hex = `02${hex}`;
          setPubkey(hex);
          setShowScanner(false);
          return;
        }
      } catch {
        // Fall through to invalid invoice/request toast.
      }
    }
    if (/^(?:0[23])?[0-9a-fA-F]{64}$/.test(text)) {
      setPubkey(text.length === 64 ? `02${text}` : text);
      setShowScanner(false);
      return;
    }
    toast.error('Invalid ecash invoice or request');
    setShowScanner(false);
  };

  const handleReceiveScanText = (text: string) => {
    if (text.toLowerCase().startsWith('ur:')) {
      const decoded = urDecoder.receivePart(text);
      if (decoded) {
        handleTokenInput(decoded);
        setShowScanner(false);
      }
    } else {
      if (isCashuRequest(text)) {
        resetSend();
        setScannedRequest(text);
        setActiveTab('send');
      } else {
        handleTokenInput(text);
      }
      setShowScanner(false);
    }
  };

  const pubkeyField = (
    <div className="ecash-pubkey-field flex flex-col gap-1">
      <label htmlFor="ecash-lock-pubkey" className="text-[11px] font-label-caps text-on-surface-variant ml-1">
        Lock to Pubkey (Optional)
      </label>
      <input
        id="ecash-lock-pubkey"
        type="text"
        value={pubkey}
        onChange={(e) => {
          let val = e.target.value.trim();
          if (val.startsWith('npub')) {
            try {
              const decoded = nip19.decode(val);
              if (decoded.type === 'npub') {
                let hex = decoded.data as string;
                if (hex.length === 64) hex = `02${hex}`;
                val = hex;
              }
            } catch {
              /* Ignore invalid partial npub while typing. */
            }
          } else if (val.length === 64) {
            val = `02${val}`;
          }
          setPubkey(val);
        }}
        placeholder="npub1... or hex pubkey"
        className="ecash-field w-full py-2.5 px-3 rounded-xl text-[13px] transition-colors"
      />
    </div>
  );

  const receiveAction = (
    <button
      onClick={handleReceive}
      disabled={receiving || !receiveToken.trim() || showScanner}
      className={`btn-gradient w-full py-3.5 sm:py-4 rounded-2xl text-on-primary font-headline-lg-mobile text-[16px] sm:text-[18px] shadow-lg transition-all duration-200 flex justify-center items-center cursor-pointer ${
        receiving || !receiveToken.trim() || showScanner
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:opacity-90 active:scale-[0.98]'
      }`}
    >
      {receiving ? <Loader2 className="animate-spin w-6 h-6" /> : 'Receive Ecash'}
    </button>
  );

  const renderInner = (closeAction: () => void, dragHandleProps?: Record<string, unknown>) => (
    <>
      <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>

      {!page && (
        <div
          {...(dragHandleProps || {})}
          className="w-full flex justify-center pt-2.5 pb-1 relative z-10 cursor-grab active:cursor-grabbing sm:hidden"
        >
          <div className="w-12 h-1.5 bg-white/25 rounded-full transition-colors"></div>
        </div>
      )}

      {page ? (
        <PageHeader
          title={activeTab === 'receive' ? 'Receive ecash' : 'Send ecash'}
          subtitle={activeTab === 'receive' ? 'Request ecash or scan a token' : 'Create an ecash token to share'}
          onBack={onClose}
          sticky={false}
          className="ecash-page-header"
        />
      ) : (
        <div
          {...(dragHandleProps || {})}
          className="flex justify-between items-center px-5 sm:px-6 py-3 sm:py-4 border-b border-outline-variant/10 relative z-10 cursor-grab active:cursor-grabbing"
        >
          <h2 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
            <Coins className="text-primary w-5 h-5" /> eCash
          </h2>
          <button
            type="button"
            onClick={closeAction}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className={`${page ? 'hidden' : 'relative flex'} border-b border-outline-variant/10 z-10 bg-surface-container-high/40 select-none`}>
        <button
          onClick={() => {
            onClose();
            navigate('/send-ecash', { state: { mintUrl } });
          }}
          className={`flex-1 py-2.5 sm:py-3 text-[13px] sm:text-[14px] font-bold tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
            activeTab === 'send'
              ? 'text-primary'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-bright/20'
          }`}
        >
          <ArrowUp size={16} className={`transition-transform duration-200 ${activeTab === 'send' ? 'scale-110 text-primary' : ''}`} />
          <span>SEND</span>
        </button>
        <button
          onClick={() => switchTab('receive')}
          className={`flex-1 py-2.5 sm:py-3 text-[13px] sm:text-[14px] font-bold tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
            activeTab === 'receive'
              ? 'text-primary'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-bright/20'
          }`}
        >
          <ArrowDown size={16} className={`transition-transform duration-200 ${activeTab === 'receive' ? 'scale-110 text-primary' : ''}`} />
          <span>RECEIVE</span>
        </button>

        <div
          className="absolute bottom-0 left-0 h-[2.5px] bg-primary shadow-[0_0_12px_rgba(242,169,59,0.7)] rounded-t-full transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] w-1/2 pointer-events-none"
          style={{
            transform: `translate3d(${activeTab === 'send' ? '0%' : '100%'}, 0, 0)`,
          }}
        />
      </div>

      <div className={page ? 'ecash-page-content' : 'contents'}>
        <div className="ecash-body p-4 sm:p-6 flex flex-col gap-3.5 sm:gap-4 relative z-10 overflow-y-auto overflow-x-hidden flex-1">
          {!(activeTab === 'send' && (requestBusy || token)) && !(activeTab === 'receive' && receivePreview && !showScanner) && (
            <div className="flex flex-col gap-1.5 sm:gap-2">
              <div className="ecash-mint-row flex items-stretch gap-2">
                <div className="flex-1 min-w-0">
                  <MintBalancePicker mintUrl={mintUrl} balances={mintBalances} onSelect={setMintUrl} />
                </div>
                {activeTab === 'send' && !token && !requestBusy && (
                  <button
                    type="button"
                    onClick={() => {
                      urDecoder.reset();
                      setShowScanner(true);
                    }}
                    disabled={sending || showScanner}
                    aria-label="Scan ecash invoice"
                    title="Scan ecash invoice"
                    className="w-12 min-h-11 shrink-0 rounded-xl bg-surface-container-highest hover:bg-surface-bright text-primary border border-outline-variant/20 flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  >
                    <QrCode size={20} />
                  </button>
                )}
                {activeTab === 'receive' && receivedAmount === null && (
                  <button
                    type="button"
                    onClick={() => {
                      urDecoder.reset();
                      setShowScanner(true);
                    }}
                    disabled={receiving || showScanner}
                    aria-label="Scan ecash token"
                    title="Scan ecash token"
                    className="w-12 min-h-11 shrink-0 rounded-xl bg-surface-container-highest hover:bg-surface-bright text-primary border border-outline-variant/20 flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  >
                    <QrCode size={20} />
                  </button>
                )}
              </div>
            </div>
          )}
          {page && activeTab === 'send' && !token && !requestBusy && !showScanner && pubkeyField}

          <div
            key={activeTab}
            className={`ecash-flow flex flex-col gap-4 ${
              activeTab === 'receive' ? 'animate-tab-from-right' : 'animate-tab-from-left'
            }`}
          >
            {activeTab === 'receive' && receivedAmount === null && (
              <div className="ecash-request-panel" hidden={showScanner || Boolean(receiveToken.trim())}>
                <EcashReceiveInvoice
                  mintUrl={mintUrl}
                  onPaid={(paidAmount) => {
                    setReceivedAmount(paidAmount);
                    setPaymentAmount(paidAmount);
                    setPaymentTitle('eCash Received');
                    setPaymentSubtitle('Invoice paid and ecash redeemed to your wallet.');
                    setPaymentBadgeLabel('Received');
                    setPaymentStatus('success');
                  }}
                />
              </div>
            )}
            {activeTab === 'send' && (
              <EcashRequestPayment
                key={activeTab}
                mintUrl={mintUrl}
                paused={sending || receiving || showScanner || paymentStatus !== null}
                onBusy={setRequestBusy}
                onStartRequest={resetSend}
                initialRequest={activeTab === 'send' ? scannedRequest : undefined}
                onPrepared={(payment, netAmount) => {
                  setMintUrl(payment.mint_url);
                  setAmount(String(netAmount));
                  setPaymentAmount(netAmount);
                  setToken(payment.token);
                  setTokenV4(payment.token);
                  setTokenV3(payment.token_v3 || null);
                  setFormatVersion('v4');
                  setHasCelebratedClaim(false);
                  trackOutgoing(payment.tx_id);
                }}
              />
            )}
            {activeTab === 'send' ? (
              <EcashSendView
                page={page}
                mintUrl={mintUrl}
                amount={amount}
                parsedAmount={parsedAmount}
                isInsufficient={isInsufficient}
                isValid={isValid}
                sending={sending}
                requestBusy={requestBusy}
                showScanner={showScanner}
                token={token}
                tokenV3={tokenV3}
                tokenV4={tokenV4}
                formatVersion={formatVersion}
                isClaimed={isClaimed}
                copied={copied}
                currentFrame={currentFrame}
                isAnimated={isAnimated}
                currentFrameIndex={currentFrameIndex}
                totalFrames={totalFrames}
                pubkeyField={pubkeyField}
                onAmountChange={(val) => {
                  setAmount(val);
                  setToken(null);
                }}
                onSend={handleSend}
                onCopy={handleCopy}
                onFormatChange={(val) => {
                  setFormatVersion(val);
                  if (val === 'v3' && tokenV3) setToken(tokenV3);
                  if (val === 'v4' && tokenV4) setToken(tokenV4);
                }}
                onScanText={handleSendScanText}
                onScanError={(msg) => toast.error(msg)}
                onCancelScanner={() => {
                  setShowScanner(false);
                  urDecoder.reset();
                }}
              />
            ) : (
              <EcashReceiveView
                page={page}
                receivedAmount={receivedAmount}
                receiveToken={receiveToken}
                receivePreview={receivePreview}
                showScanner={showScanner}
                urProgress={urDecoder.progress}
                urIsSuccess={urDecoder.isSuccess}
                receiveAction={receiveAction}
                onDone={closeAction}
                onTokenChange={handleTokenInput}
                onClearToken={() => setReceiveToken('')}
                onPasteToken={async () => {
                  try {
                    const text = await readClipboardText();
                    if (text) handleTokenInput(text.trim());
                  } catch (e) {
                    console.warn('Clipboard read failed', e);
                  }
                }}
                onScanText={handleReceiveScanText}
                onScanError={(msg) => toast.error(msg)}
                onCancelScanner={() => {
                  setShowScanner(false);
                  urDecoder.reset();
                }}
              />
            )}
          </div>
        </div>
        {page && activeTab === 'receive' && receivedAmount === null && !showScanner && (
          <div className="ecash-receive-actions">
            {receivePreview ? (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={handleReceive} disabled={receiving || savingToken} className="ecash-create disabled:opacity-40">
                  {receiving ? 'Claiming…' : 'Claim now'}
                </button>
                <button
                  type="button"
                  onClick={handleClaimLater}
                  disabled={receiving || savingToken}
                  className="w-full min-h-11 rounded-2xl border border-outline-variant/30 text-primary cursor-pointer disabled:opacity-40"
                >
                  {savingToken ? 'Saving…' : 'Claim later'}
                </button>
              </div>
            ) : receiveToken.trim() ? (
              <p role="alert" className="text-error text-sm">
                Invalid or unsupported ecash token. Clear it and scan another token.
              </p>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await readClipboardText();
                    if (text) handleTokenInput(text.trim());
                  } catch {
                    toast.error('Could not read clipboard');
                  }
                }}
                className="w-full text-sm text-primary cursor-pointer"
              >
                Paste token
              </button>
            )}
          </div>
        )}
        {page && activeTab === 'send' && !token && !requestBusy && !showScanner && (
          <div className="ecash-page-amount">
            <AmountDisplay amount={amount} compact />
            {isInsufficient && (
              <p role="alert" className="text-error text-xs text-center">
                Insufficient balance
              </p>
            )}
          </div>
        )}
        {page && activeTab === 'send' && !token && !requestBusy && !showScanner && (
          <div className="ecash-controls">
            <div className="ecash-number-pad" role="group" aria-label="Amount keypad">
              <NumberPad value={amount} onChange={setAmount} compact />
            </div>
            <button type="button" onClick={handleSend} disabled={sending || !isValid} className="ecash-create">
              {sending ? <Loader2 className="animate-spin" /> : 'Create Token'}
            </button>
          </div>
        )}
      </div>
    </>
  );

  const overlays = (
    <>
      {sending && <FullScreenLoader title="Creating eCash Token..." message="Preparing your tokens for sending." />}
      {receiving && <FullScreenLoader title="Receiving eCash..." message="Claiming tokens to your wallet." />}
      <SovereignStampOverlay
        status={paymentStatus}
        amountSats={paymentAmount}
        title={paymentTitle}
        subtitle={paymentSubtitle}
        badgeLabel={paymentBadgeLabel}
        errorMessage={paymentErrorMessage}
        onDismiss={() => {
          setPaymentStatus(null);
          if (paymentStatus === 'success' && !page) onClose();
        }}
        onRetry={lastAction}
      />
    </>
  );

  if (page) {
    return (
      <div className={`ecash-send-page ${activeTab === 'receive' ? 'ecash-receive-page' : !token && !requestBusy && !showScanner ? 'is-entry' : ''}`}>
        <div className="ecash-sheet w-full">{renderInner(onClose)}</div>
        {overlays}
      </div>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm"
      style={backdropStyle}
      onClick={closeWithAnimation}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={sheetStyle}
        className="ecash-sheet bg-surface-container-high/95 backdrop-blur-xl rounded-t-[28px] sm:rounded-2xl w-full max-w-lg border-t border-x sm:border border-outline-variant/20 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col relative max-h-[92vh] pb-6 sm:pb-4"
      >
        {renderInner(closeWithAnimation, dragHandleProps)}
      </div>
      {overlays}
    </div>,
    document.body,
  );
};
