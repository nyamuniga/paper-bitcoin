import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Plus, Landmark } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useMints } from '../../hooks/useMints';
import { useBottomSheet } from '../../hooks/useBottomSheet';

interface AddMintModalProps {
  onClose: () => void;
}

export const AddMintModal: React.FC<AddMintModalProps> = ({ onClose }) => {
  const { dragHandleProps, sheetStyle, backdropStyle, closeWithAnimation } = useBottomSheet({ onClose });
  const [mintUrl, setMintUrl] = useState('');
  const { loading: adding, addMint } = useMints();

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

    const success = await addMint(finalUrl);
    if (success) {
      closeWithAnimation();
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
        className="bg-surface-container-high/95 backdrop-blur-xl rounded-t-[2rem] sm:rounded-3xl w-full max-w-lg border-t border-x sm:border border-outline-variant/20 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col relative max-h-[92vh] pb-6 sm:pb-0"
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
          className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10 relative z-10 cursor-grab active:cursor-grabbing"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 flex-shrink-0">
              <Landmark className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-headline-sm font-headline-sm font-bold text-on-surface">Add New Mint</h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant">Connect to a Cashu mint</p>
            </div>
          </div>
          <button
            onClick={closeWithAnimation}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 relative z-10 overflow-y-auto">
          <div className="flex flex-col gap-2">
            <label className="text-body-md font-body-md font-semibold text-on-surface">Mint URL</label>
            <input
              type="text"
              value={mintUrl}
              onChange={(e) => setMintUrl(e.target.value)}
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
        <div className="p-4 sm:p-6 border-t border-outline-variant/10 bg-surface-container-high/60 relative z-10 flex justify-end gap-3">
          <button
            onClick={closeWithAnimation}
            className="px-6 py-2.5 rounded-full text-body-md font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleAddMint}
            disabled={adding || !mintUrl.trim()}
            className="bg-primary hover:bg-primary/90 text-on-primary px-6 py-2.5 rounded-full text-body-md font-bold transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-md"
          >
            {adding ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Plus className="w-5 h-5 stroke-[2.5]" />
            )}
            Add Mint
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
