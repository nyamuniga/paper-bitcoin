import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Zap, X, Loader2, Edit2 } from 'lucide-react';
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
  const [isEditing, setIsEditing] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
      setIsEditing(false);
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
          <div className="w-12 h-1.5 bg-white/25 rounded-full transition-colors"></div>
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
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors border border-outline-variant/30 cursor-pointer"
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

          {/* Address with pen on the right & expanding edit background from right to left */}
          <div className="relative bg-[#101c16] rounded-2xl border border-outline-variant/40 hover:border-primary/40 transition-colors group flex items-center overflow-hidden min-h-[56px]">
            {/* Base address display */}
            <div
              onClick={handleCopy}
              className="flex-1 min-w-0 py-3.5 pl-4 pr-2 cursor-pointer flex items-center"
              title="Click to copy address"
            >
              <p className="text-on-surface font-mono text-sm break-all select-all group-hover:text-primary transition-colors">
                {lightningAddress}
              </p>
            </div>

            {/* Subtle separating line */}
            <div className="h-6 w-px bg-outline-variant/30 shrink-0"></div>

            {/* Pen button on the right */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
                setUsernameInput(customUsername || '');
                setTimeout(() => inputRef.current?.focus(), 150);
              }}
              className="p-3.5 px-4 text-on-surface-variant hover:text-primary hover:bg-surface-bright/50 transition-colors cursor-pointer shrink-0 flex items-center justify-center group/pen"
              title={customUsername ? "Change username" : "Claim custom username"}
            >
              <Edit2 size={16} className="text-on-surface-variant group-hover/pen:text-primary transition-colors" />
            </button>

            {/* Expanding dark background from right to left */}
            <div
              className={`absolute inset-y-0 right-0 z-20 flex items-center bg-[#0a1711] border border-primary/50 rounded-2xl transition-all duration-300 ease-out overflow-hidden ${
                isEditing
                  ? 'w-full opacity-100 shadow-[0_0_20px_rgba(242,169,59,0.15)]'
                  : 'w-0 opacity-0 pointer-events-none border-transparent'
              }`}
            >
              <div className="w-full flex items-center min-w-0">
                {/* Username input directly on dark background (no inner edit box) */}
                <div className="flex-1 min-w-0 flex items-center pl-4 pr-3 py-3">
                  <input
                    ref={inputRef}
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleClaimUsername();
                      } else if (e.key === 'Escape') {
                        setIsEditing(false);
                        setUsernameInput(customUsername || '');
                      }
                    }}
                    placeholder={customUsername || "username"}
                    maxLength={20}
                    className="flex-1 min-w-0 bg-transparent text-sm text-on-surface font-mono outline-none placeholder:text-on-surface-variant/40"
                  />
                  <span className="text-on-surface-variant/70 font-mono text-xs pr-1 whitespace-nowrap shrink-0 select-none">
                    @{NPUB_DOMAIN}
                  </span>
                </div>

                {/* Subtle separating line */}
                <div className="h-6 w-px bg-outline-variant/30 shrink-0"></div>

                {/* Edit and close buttons with comfortable touch spacing */}
                <div className="flex items-center gap-2.5 pl-2.5 pr-3 shrink-0">
                  <button
                    type="button"
                    onClick={handleClaimUsername}
                    disabled={claimingUsername || usernameInput.length < 3}
                    className="p-2 rounded-xl text-primary hover:bg-white/5 active:scale-95 disabled:opacity-30 transition-all cursor-pointer disabled:cursor-not-allowed flex items-center justify-center"
                    title="Save username"
                  >
                    {claimingUsername ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setUsernameInput(customUsername || '');
                    }}
                    className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-white/5 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                    title="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Validation hint while editing */}
          {isEditing && usernameInput.length > 0 && usernameInput.length < 3 && (
            <p className="text-red-400 text-xs px-1 text-center -mt-2">
              Username must be at least 3 characters
            </p>
          )}

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="btn-primary w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-display-hero text-[15px] font-semibold active:scale-[0.98] transition-all cursor-pointer"
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? 'Copied!' : 'Copy Address'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
