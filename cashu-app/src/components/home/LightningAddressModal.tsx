import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Zap, X, User, Loader2, Edit2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import QRCode from 'react-qr-code';
import { useNostr } from '../../hooks/useNostr';
import { NPUB_DOMAIN } from '../../constants.local';
import { useBottomSheet } from '../../hooks/useBottomSheet';

interface LightningAddressModalProps {
  onClose: () => void;
}

export const LightningAddressModal: React.FC<LightningAddressModalProps> = ({ onClose }) => {
  const {
    lightningAddress,
    customUsername,
    claimingUsername,
    claimUsername,
  } = useNostr();

  const { dragHandleProps, sheetStyle, backdropStyle, closeWithAnimation } = useBottomSheet({ onClose });

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

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm"
      style={backdropStyle}
      onClick={closeWithAnimation}
    >
      <div 
        onClick={e => e.stopPropagation()}
        style={sheetStyle}
        className="bg-surface-container-high/95 backdrop-blur-xl rounded-t-[2rem] sm:rounded-3xl w-full max-w-md border-t border-x sm:border border-[#142d20] shadow-[0_16px_48px_-8px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col relative max-h-[92vh] pb-6 sm:pb-4"
      >
        <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>

        {/* Drag Handle */}
        <div 
          {...dragHandleProps}
          className="w-full flex justify-center pt-3 pb-1 relative z-10 cursor-grab active:cursor-grabbing sm:hidden"
        >
          <div className="w-12 h-1.5 bg-outline-variant/50 rounded-full"></div>
        </div>

        {/* Header */}
        <div 
          {...dragHandleProps}
          className="flex justify-between items-center px-6 py-4 border-b border-[rgba(247,244,235,0.04)] relative z-10 cursor-grab active:cursor-grabbing"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#12261d] border border-[#1e3c2e] flex items-center justify-center text-[#f2a93b]">
              <Zap size={16} className="fill-current text-[#f2a93b]" />
            </div>
            <div>
              <h2 className="font-display-hero text-headline-sm font-semibold text-on-surface">Lightning Address</h2>
            </div>
          </div>
          <button
            onClick={closeWithAnimation}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors border border-outline-variant/30"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-5 relative z-10 overflow-y-auto">
          <p className="text-on-surface-variant text-sm font-medium text-center">
            Share this address to receive Lightning payments directly to your wallet
          </p>

          {/* QR Code Presentation Card */}
          <div className="flex justify-center">
            <div className="qr-presentation-card">
              <div className="qr-presentation-card-inner">
                <QRCode value={lightningAddress} size={200} />
              </div>
            </div>
          </div>

          {/* Address */}
          <div
            onClick={handleCopy}
            className="bg-[#101c16] rounded-xl p-3 cursor-pointer hover:border-primary/40 border border-outline-variant/40 transition-colors group"
          >
            <p className="text-center text-on-surface font-mono text-sm break-all select-all group-hover:text-primary transition-colors">
              {lightningAddress}
            </p>
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="btn-primary w-full flex items-center justify-center gap-2 rounded-xl py-3.5 font-display-hero text-[15px] font-semibold active:scale-[0.98] transition-all"
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? 'Copied!' : 'Copy Address'}
          </button>

          {/* Username Section */}
          <div className="border-t border-outline-variant/30 pt-4">
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
              <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 flex items-center bg-surface-container-low rounded-lg overflow-hidden border border-outline-variant/30 focus-within:border-primary/50 transition-colors">
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
                      onClick={handleClaimUsername}
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
    </div>,
    document.body
  );
};
