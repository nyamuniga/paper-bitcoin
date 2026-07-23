import React, { useState, useEffect } from 'react';
import { Network, Eye, EyeOff, Plus, Trash2, Shield, Copy, Edit2, Check, X, RefreshCcw, ChevronRight, ChevronDown } from 'lucide-react';
import { useNostrStore } from '../../store/nostrStore';
import { invoke } from '@tauri-apps/api/core';
import { deriveNostrKeypair } from '../../services/nostrService';
import { nip19 } from 'nostr-tools';
import toast from 'react-hot-toast';

const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
};

const truncateKey = (key: string | null) => {
  if (!key) return '';
  if (key.length <= 20) return key;
  return `${key.slice(0, 10)}...${key.slice(-10)}`;
};

export const NostrSection: React.FC = () => {
  const { npub, relays, setRelays, isInitializing } = useNostrStore();
  const [nsec, setNsec] = useState<string | null>(null);
  const [showNsec, setShowNsec] = useState(false);
  const [isEditingNsec, setIsEditingNsec] = useState(false);
  const [editNsecValue, setEditNsecValue] = useState('');
  const [newRelay, setNewRelay] = useState('');
  const [hasCustomKey, setHasCustomKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  useEffect(() => {
    // Check if we have a custom key stored in the backend
    invoke<string | null>('get_custom_nostr_key').then(key => {
      setHasCustomKey(!!key);
    }).catch(console.error);
  }, []);

  const handleRevealNsec = async () => {
    if (nsec) {
      setShowNsec(!showNsec);
      return;
    }

    try {
      const customKeyHex = await invoke<string | null>('get_custom_nostr_key');
      let privateKeyHex = customKeyHex;

      if (!privateKeyHex) {
        const seedHex = await invoke<string>('get_seed_hex');
        const { privateKey } = deriveNostrKeypair(seedHex);
        privateKeyHex = privateKey;
      }

      const nsecString = nip19.nsecEncode(hexToBytes(privateKeyHex));
      setNsec(nsecString);
      setShowNsec(true);
    } catch (e: any) {
      toast.error('Failed to reveal nsec: ' + e.message);
    }
  };

  const handleCopy = (text: string | null) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleCopyNsec = async () => {
    if (nsec) {
      handleCopy(nsec);
    } else {
      try {
        const customKeyHex = await invoke<string | null>('get_custom_nostr_key');
        let privateKeyHex = customKeyHex;

        if (!privateKeyHex) {
          const seedHex = await invoke<string>('get_seed_hex');
          const { privateKey } = deriveNostrKeypair(seedHex);
          privateKeyHex = privateKey;
        }

        const nsecString = nip19.nsecEncode(hexToBytes(privateKeyHex));
        setNsec(nsecString);
        handleCopy(nsecString);
      } catch (e: any) {
        toast.error('Failed to copy nsec');
      }
    }
  };

  const handleSaveNsec = async () => {
    if (!editNsecValue.trim()) {
      toast.error('Private key cannot be empty');
      return;
    }

    try {
      setIsSaving(true);
      // Validate by decoding
      const decoded = nip19.decode(editNsecValue.trim());
      if (decoded.type !== 'nsec') {
        throw new Error('Invalid nsec string');
      }

      // Convert to hex
      const hex = Array.from(decoded.data as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');

      // Clear local state so new key doesn't inherit old key's handle or address
      useNostrStore.getState().setCustomUsername(null);
      useNostrStore.getState().setNpub('');
      useNostrStore.getState().setLightningAddress('');

      await invoke('set_custom_nostr_key', { key: hex });
      await invoke('lock_wallet');
      toast.success('Custom Nostr key saved! Restarting to apply...');

      setTimeout(() => {
        window.history.replaceState(null, '', '/');
        window.location.reload();
      }, 1500);

    } catch (e: any) {
      toast.error('Invalid nsec: ' + e.message);
      setIsSaving(false);
    }
  };

  const handleRevertKey = async () => {
    try {
      setIsReverting(true);
      // Clear local state so default key doesn't inherit custom key's handle or address
      useNostrStore.getState().setCustomUsername(null);
      useNostrStore.getState().setNpub('');
      useNostrStore.getState().setLightningAddress('');

      await invoke('set_custom_nostr_key', { key: null });
      await invoke('lock_wallet');
      toast.success('Reverted to wallet key! Restarting...');
      setTimeout(() => {
        window.history.replaceState(null, '', '/');
        window.location.reload();
      }, 1500);
    } catch (e: any) {
      toast.error('Failed to revert key: ' + e.message);
      setIsReverting(false);
    }
  };

  const handleAddRelay = () => {
    if (!newRelay) return;
    let url = newRelay.trim();
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      url = 'wss://' + url;
    }
    if (relays.includes(url)) {
      toast.error('Relay already exists');
      return;
    }
    setRelays([...relays, url]);
    setNewRelay('');
    toast.success('Relay added');
  };

  const handleRemoveRelay = (urlToRemove: string) => {
    setRelays(relays.filter(r => r !== urlToRemove));
    toast.success('Relay removed');
  };

  return (
    <div className="bg-surface-container-high  rounded-2xl border border-outline-variant/20 shadow-sm relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none transition-transform group-hover:scale-110 duration-700"></div>

      <div
        className="flex items-center justify-between p-4 md:p-6 relative z-10 cursor-pointer hover:bg-surface-container-highest transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex shrink-0 items-center justify-center text-primary border border-primary/20">
            <Network size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-body-md font-body-md font-bold text-on-surface mb-1">Nostr Identity</h2>
            <p className="text-sm text-on-surface-variant truncate">Manage your Lightning Address keys & relays</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {hasCustomKey && isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRevertKey();
              }}
              disabled={isReverting}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-amber-500 bg-amber-500/10 rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              title="Revert to original wallet seed"
            >
              <RefreshCcw size={16} className={isReverting ? "animate-spin" : ""} />
              {isReverting ? 'Reverting...' : 'Revert to Default'}
            </button>
          )}
          <div className="text-on-surface-variant">
            {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 md:px-6 pb-4 md:pb-6 pt-2 border-t border-outline-variant/10 space-y-4 relative z-10">
          {/* npub */}
          <div>
            <label className="text-label-md font-label-md text-on-surface-variant mb-2 block">
              Public Key (npub)
            </label>
            <div className="flex items-center gap-2 relative">
              <input
                type="text"
                value={isInitializing ? 'Loading keys...' : (truncateKey(npub) || 'Not registered')}
                readOnly
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-body-md text-on-surface font-mono text-sm focus:outline-none pr-12"
              />
              <button
                onClick={() => handleCopy(npub)}
                disabled={!npub}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-on-surface-variant hover:text-primary transition-colors disabled:opacity-50"
                title="Copy full npub"
              >
                <Copy size={18} />
              </button>
            </div>
          </div>

          {/* nsec */}
          <div>
            <label className="text-label-md font-label-md text-on-surface-variant mb-2 flex items-center justify-between">
              <span>Private Key (nsec)</span>
              {!isEditingNsec && (
                <button
                  onClick={() => {
                    setIsEditingNsec(true);
                    setEditNsecValue('');
                  }}
                  className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                >
                  <Edit2 size={14} />
                  <span>Edit</span>
                </button>
              )}
            </label>

            {isEditingNsec ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Paste your nsec1... here"
                    value={editNsecValue}
                    onChange={(e) => setEditNsecValue(e.target.value.replace(/[^a-z0-9]/gi, '').toLowerCase())}
                    autoFocus
                    maxLength={63}
                    className="flex-1 min-w-0 bg-surface-container-low border border-primary/50 rounded-xl px-4 py-3 text-body-md text-on-surface font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    onClick={handleSaveNsec}
                    disabled={isSaving || (editNsecValue.length > 0 && (editNsecValue.length !== 63 || !editNsecValue.startsWith('nsec1')))}
                    className="p-3 bg-primary text-on-primary rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                    title="Save custom nsec"
                  >
                    {isSaving ? <span className="w-5 h-5 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin block"></span> : <Check size={20} />}
                  </button>
                  <button
                    onClick={() => setIsEditingNsec(false)}
                    className="p-3 bg-surface-variant text-on-surface-variant rounded-xl hover:bg-surface-variant/80 transition-colors"
                    title="Cancel"
                  >
                    <X size={20} />
                  </button>
                </div>
                {editNsecValue.length > 0 && !editNsecValue.startsWith('nsec1') && (
                  <p className="text-red-400 text-xs px-1">Must start with 'nsec1'</p>
                )}
                {editNsecValue.length > 0 && editNsecValue.startsWith('nsec1') && editNsecValue.length !== 63 && (
                  <p className="text-red-400 text-xs px-1">Must be exactly 63 characters (currently {editNsecValue.length})</p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 relative">
                <input
                  type="text"
                  value={isInitializing ? 'Loading keys...' : (showNsec ? truncateKey(nsec) : '..............')}
                  readOnly
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-body-md text-on-surface font-mono text-sm focus:outline-none pr-20"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                  <button
                    onClick={handleRevealNsec}
                    className="p-2 text-on-surface-variant hover:text-primary transition-colors"
                    title="Reveal shortened nsec"
                  >
                    {showNsec ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  <button
                    onClick={handleCopyNsec}
                    className="p-2 text-on-surface-variant hover:text-primary transition-colors"
                    title="Copy full nsec"
                  >
                    <Copy size={18} />
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 mt-2">
              <Shield className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-label-sm text-on-surface-variant">
                Never share your private key. Anyone with your nsec can control your Lightning Address.
              </p>
            </div>
          </div>

          <div className="divider-dashed my-6 border-outline-variant/20"></div>

          {/* Relays */}
          <div>
            <h3 className="text-title-md font-title-md text-on-surface mb-4">Configured Relays</h3>

            <div className="space-y-2 mb-4">
              {relays.map((relay) => (
                <div key={relay} className="flex items-center justify-between bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3">
                  <span className="text-body-md text-on-surface font-mono text-sm truncate mr-2">{relay}</span>
                  <button
                    onClick={() => handleRemoveRelay(relay)}
                    className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-md transition-colors"
                    title="Remove relay"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="wss://..."
                value={newRelay}
                onChange={(e) => setNewRelay(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRelay()}
                className="flex-1 min-w-0 bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-body-md text-on-surface focus:outline-none focus:border-primary/50"
              />
              <button
                onClick={handleAddRelay}
                disabled={!newRelay}
                className="bg-primary text-on-primary px-4 py-3 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
