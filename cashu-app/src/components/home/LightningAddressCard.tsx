import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Zap, QrCode, X, ChevronDown, User, Loader2, Edit2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import QRCode from 'react-qr-code';
import { useNostr } from '../../hooks/useNostr';
import { NPUB_DOMAIN } from '../../constants.local';
import { useWalletStore } from '../../store/wallet';
import { MintIcon } from '../shared/MintIcon';
import { MintName } from '../shared/MintName';

export const LightningAddressCard: React.FC = () => {
  const {
    lightningAddress,
    customUsername,
    preferredMintUrl,
    claimingUsername,
    updatePreferredMint,
    claimUsername,
  } = useNostr();

  const mintBalances = useWalletStore((s) => s.mintBalances);
  const mintUrls = Object.keys(mintBalances || {});

  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMintDropdown, setShowMintDropdown] = useState(false);
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
      <div className="bg-surface-container-high rounded-2xl w-full max-w-md p-6 relative">
        <button onClick={() => setShowQR(false)} className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface">
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-400 px-3 py-1.5 rounded-full text-sm font-bold mb-3">
            <Zap size={14} />
            Lightning Address
          </div>
          <p className="text-on-surface-variant text-sm">
            Share this address to receive payments
          </p>
        </div>

        {/* QR Code */}
        <div className="flex justify-center mb-4">
          <div className="bg-white p-4 rounded-xl">
            <QRCode value={lightningAddress} size={200} />
          </div>
        </div>

        {/* Address */}
        <div
          onClick={handleCopy}
          className="bg-surface rounded-xl p-3 cursor-pointer hover:bg-surface-variant/70 transition-colors mb-4"
        >
          <p className="text-center text-on-surface font-mono text-sm break-all select-all">
            {lightningAddress}
          </p>
        </div>

        {/* Copy Button */}
        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-xl py-3 font-bold transition-colors mb-4"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied!' : 'Copy Address'}
        </button>

        {/* Preferred Mint Selector */}
        <div className="relative mb-4">
          <label className="text-on-surface-variant text-xs font-medium mb-1 block">Preferred Mint</label>
          <button
            onClick={() => setShowMintDropdown(!showMintDropdown)}
            className="w-full bg-surface rounded-lg px-3 py-2 text-left text-sm text-on-surface flex items-center justify-between"
          >
            <div className="flex items-center gap-2 min-w-0 pr-2">
              {preferredMintUrl ? (
                <>
                  <MintIcon mintUrl={preferredMintUrl} className="w-5 h-5 flex-shrink-0 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30" textClassName="text-[8px] font-bold text-primary" />
                  <MintName mintUrl={preferredMintUrl} className="truncate" />
                </>
              ) : (
                <span className="truncate text-on-surface-variant">Select a mint</span>
              )}
            </div>
            <ChevronDown size={14} />
          </button>
          {showMintDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-outline-variant rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
              {mintUrls.map((url) => (
                <button
                  key={url}
                  onClick={() => {
                    updatePreferredMint(url);
                    setShowMintDropdown(false);
                  }}
                  className={`w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-surface-variant/50 transition-colors truncate ${url === preferredMintUrl ? 'text-amber-400 font-bold' : 'text-on-surface'
                    }`}
                >
                  <MintIcon mintUrl={url} className="w-5 h-5 flex-shrink-0 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30" textClassName={`text-[8px] font-bold ${url === preferredMintUrl ? 'text-amber-400' : 'text-primary'}`} />
                  <MintName mintUrl={url} className="truncate" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Username Section */}
        <div className="border-t border-outline-variant/30 pt-4">
          {!showUsernameInput ? (
            customUsername ? (
              <div className="flex items-center justify-center gap-2">
                <p className="text-center text-on-surface-variant text-xs">
                  Username: <span className="text-amber-400 font-bold">{customUsername}@{NPUB_DOMAIN}</span>
                </p>
                <button
                  onClick={() => setShowUsernameInput(true)}
                  className="text-amber-400 hover:text-amber-300 p-1 transition-colors"
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
              <div className="flex gap-2">
                <div className="flex-1 flex items-center bg-surface-variant/30 rounded-lg overflow-hidden">
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())}
                    placeholder={customUsername || "username"}
                    maxLength={20}
                    className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-on-surface outline-none"
                    autoFocus
                  />
                  <span className="text-on-surface-variant text-sm pr-3 whitespace-nowrap">@{NPUB_DOMAIN}</span>
                </div>
                <button
                  onClick={async () => {
                    await handleClaimUsername();
                  }}
                  disabled={claimingUsername || usernameInput.length < 3}
                  className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 transition-colors"
                >
                  {claimingUsername ? <Loader2 size={14} className="animate-spin" /> : 'Claim'}
                </button>
                {customUsername && (
                  <button
                    onClick={() => {
                      setShowUsernameInput(false);
                      setUsernameInput('');
                    }}
                    className="text-on-surface-variant hover:text-on-surface px-2 transition-colors"
                  >
                    Cancel
                  </button>
                )}
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
      <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-amber-500/20 rounded-lg p-1.5 shrink-0">
              <Zap size={14} className="text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">Lightning Address</p>
              <p className="text-sm text-on-surface font-mono truncate">{truncatedAddress}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg hover:bg-surface-variant/50 transition-colors"
              title="Copy"
            >
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} className="text-on-surface-variant" />}
            </button>
            <button
              onClick={() => setShowQR(true)}
              className="p-2 rounded-lg hover:bg-surface-variant/50 transition-colors"
              title="Show QR"
            >
              <QrCode size={14} className="text-on-surface-variant" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
