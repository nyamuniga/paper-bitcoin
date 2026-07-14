import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Plus, Landmark } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-hot-toast';
import { useWalletStore } from '../../store/wallet';

interface AddMintModalProps {
  onClose: () => void;
}

export const AddMintModal: React.FC<AddMintModalProps> = ({ onClose }) => {
  const [mintUrl, setMintUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const handleAddMint = async () => {
    let finalUrl = mintUrl.trim();
    if (!finalUrl) {
      toast.error('Please enter a mint URL');
      return;
    }

    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }
    
    try {
      const urlObj = new URL(finalUrl);
      urlObj.hostname = urlObj.hostname.toLowerCase();
      finalUrl = urlObj.toString().replace(/\/$/, '');
    } catch {
      toast.error('Invalid URL format');
      return;
    }

    setAdding(true);
    try {
      await invoke('add_mint', { mintUrl: finalUrl });
      toast.success('Mint added successfully!');
      refreshWallet();
      onClose();
    } catch (e: any) {
      toast.error(`Failed to add mint: ${e}`);
    } finally {
      setAdding(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-surface-container-high rounded-2xl shadow-2xl overflow-hidden border border-outline-variant/30 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-outline-variant/30 bg-surface-container-highest">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
              <Landmark className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-title-md font-title-md text-on-surface">Add New Mint</h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant">Connect to a Cashu mint</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 overflow-y-auto">
          <div className="flex flex-col gap-2">
            <label className="text-label-lg font-label-lg text-on-surface">Mint URL</label>
            <input
              type="text"
              value={mintUrl}
              onChange={(e) => setMintUrl(e.target.value.toLowerCase())}
              placeholder="https://mint.example.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full bg-surface-container text-on-surface px-4 py-3 rounded-xl border border-outline-variant/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all font-body-md"
            />
            <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
              Enter the full URL of the mint you want to add.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-outline-variant/30 bg-surface-container-highest flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-full text-label-lg font-label-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAddMint}
            disabled={adding || !mintUrl}
            className="bg-primary hover:bg-primary-hover text-on-primary px-6 py-2.5 rounded-full text-label-lg font-label-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {adding ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
            Add Mint
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
