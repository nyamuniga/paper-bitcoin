import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Zap, QrCode, X, User, Loader2, Edit2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import QRCode from 'react-qr-code';
import { useNostr } from '../../hooks/useNostr';
import { NPUB_DOMAIN } from '../../constants.local';

export const LightningAddressCard: React.FC = () => {
  const {
    lightningAddress,
    customUsername,
    claimingUsername,
    claimUsername,
  } = useNostr();

  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUsernameInput, setShowUsernameInput] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');

  if (!lightningAddress) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(lightningAddress);
    setCopied(true);
    toast.success('Lightning Address copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClaimUsername = async () => {
    let sanitized = usernameInput.trim().toLowerCase();

    // Final fallback sanitization for valid characters
    sanitized = sanitized.replace(/[^a-z0-9_-]/g, '');

    if (!sanitized) {
      toast.error('Username cannot be empty');
      return;
    }

    if (sanitized.length < 3) {
      toast.error('Username must be at least 3 characters long');
      return;
    }

    if (sanitized.length > 20) {
      toast.error('Username must be at most 20 characters long');
      return;
    }

    const success = await claimUsername(sanitized);
    if (success) {
      setShowUsernameInput(false);
      setUsernameInput('');
    }
  };

  const truncatedAddress = lightningAddress.length > 30
    ? `${lightningAddress.slice(0, 14)}...${lightningAddress.slice(-14)}`
    : lightningAddress;

  // Full modal view (teleported to body to escape CSS transform context)
  const modalContent = showQR ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface-container-high/95 backdrop-blur-xl rounded-3xl w-full max-w-md p-6 relative border border-[#142d20] shadow-[0_16px_48px_-8px_rgba(0,0,0,0.6)]">
        <button onClick={() => setShowQR(false)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors border border-outline-variant/30">
          <X size={18} />
        </button>

        <div className="text-center mb-6">
          <div className="status-pill inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold mb-3 shadow-sm">
            <Zap size={13} className="text-primary" />
            Lightning Address
          </div>
          <p className="text-on-surface-variant text-sm font-medium">
            Share this address to receive payments
          </p>
        </div>

        {/* QR Code Presentation Card */}
        <div className="flex justify-center mb-5">
          <div className="qr-presentation-card">
            <div className="qr-presentation-card-inner">
              <QRCode value={lightningAddress} size={200} />
            </div>
          </div>
        </div>

        {/* Address */}
        <div
          onClick={handleCopy}
          className="bg-[#101c16] rounded-xl p-3 cursor-pointer hover:border-primary/40 border border-outline-variant/40 transition-colors mb-4 group"
        >
          <p className="text-center text-on-surface font-mono text-sm break-all select-all group-hover:text-primary transition-colors">
            {lightningAddress}
          </p>
        </div>

        {/* Copy Button */}
        <button
          onClick={handleCopy}
          className="btn-primary w-full flex items-center justify-center gap-2 rounded-xl py-3.5 font-display-hero text-[15px] font-semibold active:scale-[0.98] transition-all mb-4"
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? 'Copied!' : 'Copy Address'}
        </button>


        {/* Username Section */}
        <div className="border-t border-outline-variant pt-4">
          {!showUsernameInput ? (
            customUsername ? (
              <div className="flex items-center justify-center gap-2">
                <p className="text-center text-on-surface-variant text-xs">
                  Username: <span className="text-primary font-bold">{customUsername}@{NPUB_DOMAIN}</span>
                </p>
                <button
                  onClick={() => setShowUsernameInput(true)}
                  className="text-primary hover:text-primary/80 p-1 transition-colors"
                  title="Change username"
                >
                  <Edit2 size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowUsernameInput(true)}
                className="w-full flex items-center justify-center gap-2 text-on-surface-variant hover:text-on-surface text-sm py-2 transition-colors"
              >
                <User size={14} />
                Claim a username (e.g. alice@{NPUB_DOMAIN})
              </button>
            )
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 flex items-center bg-surface-container-low rounded-lg overflow-hidden">
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())}
                    placeholder={customUsername || "username"}
                    maxLength={20}
                    className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-on-surface outline-none"
                    autoFocus
                  />
                  <span className="text-on-surface-variant text-sm pr-3 whitespace-nowrap shrink-0">@{NPUB_DOMAIN}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      await handleClaimUsername();
                    }}
                    disabled={claimingUsername || usernameInput.length < 3}
                    className="flex-1 sm:flex-none bg-primary/15 hover:bg-primary/25 text-primary rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 transition-colors flex items-center justify-center"
                  >
                    {claimingUsername ? <Loader2 size={14} className="animate-spin" /> : 'Claim'}
                  </button>
                  {customUsername && (
                    <button
                      onClick={() => {
                        setShowUsernameInput(false);
                        setUsernameInput('');
                      }}
                      className="flex-1 sm:flex-none text-on-surface-variant hover:text-on-surface hover:bg-surface-bright/50 px-4 py-2 sm:px-2 rounded-lg transition-colors flex items-center justify-center"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
              {usernameInput.length > 0 && usernameInput.length < 3 && (
                <p className="text-red-400 text-xs px-1">Username must be at least 3 characters</p>
              )}
            </div>
          )}
        </div>


      </div>
    </div>
  ) : null;

  // Compact card view (for dashboard)
  return (
    <>
      {modalContent && createPortal(modalContent, document.body)}
      <div className="bg-[#0c1b14] border border-[#142d20] rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-[#1a3829] transition-all">
        <div className="flex items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#12261d] border border-[#1e3c2e] flex items-center justify-center text-[#f2a93b] shrink-0 shadow-sm">
              <Zap size={18} className="sm:w-5 sm:h-5 text-[#f2a93b] fill-current" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] sm:text-[10px] text-[#627d70] font-mono font-bold tracking-widest uppercase mb-0.5">
                LIGHTNING ADDRESS
              </p>
              <p className="text-[13px] sm:text-[14px] md:text-[15px] text-[#f7f4eb] font-semibold tracking-tight truncate font-sans">
                {truncatedAddress}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button
              onClick={handleCopy}
              className="p-2 sm:p-2.5 rounded-xl hover:bg-[#12261d] text-[#627d70] hover:text-[#f2a93b] transition-colors active:scale-95 cursor-pointer"
              title="Copy"
            >
              {copied ? <Check size={16} className="sm:w-[18px] sm:h-[18px] text-secondary" /> : <Copy size={16} className="sm:w-[18px] sm:h-[18px]" />}
            </button>
            <button
              onClick={() => setShowQR(true)}
              className="p-2 sm:p-2.5 rounded-xl hover:bg-[#12261d] text-[#627d70] hover:text-[#f2a93b] transition-colors active:scale-95 cursor-pointer"
              title="Show QR"
            >
              <QrCode size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
