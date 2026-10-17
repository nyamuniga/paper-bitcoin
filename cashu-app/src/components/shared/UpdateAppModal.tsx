import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, X } from 'lucide-react';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { UpdateInfo, dismissUpdateForSession, openUpdateWebsite } from '../../services/updateService';

interface UpdateAppModalProps {
  updateInfo: UpdateInfo;
  onClose: () => void;
}

export const UpdateAppModal: React.FC<UpdateAppModalProps> = ({ updateInfo, onClose }) => {
  const { dragHandleProps, sheetStyle, backdropStyle, closeWithAnimation } = useBottomSheet({
    onClose: () => {
      dismissUpdateForSession();
      onClose();
    },
    dismissThreshold: 60,
  });

  const handleUpdateNow = async () => {
    try {
      await openUpdateWebsite();
    } finally {
      dismissUpdateForSession();
      closeWithAnimation();
    }
  };

  const handleUpdateLater = () => {
    dismissUpdateForSession();
    closeWithAnimation();
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleUpdateLater();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      {/* Blurred dark backdrop */}
      <div
        style={backdropStyle}
        onClick={handleUpdateLater}
        aria-label="Close update modal"
        className="fixed inset-0 bg-[#06110c]/85 backdrop-blur-md cursor-pointer"
      />

      {/* Bottom Sheet */}
      <div
        style={sheetStyle}
        className="relative z-10 w-full max-w-lg bg-[#0c1b14] border-t border-x border-[#1a3829] rounded-t-[32px] overflow-hidden shadow-[0_-12px_48px_rgba(0,0,0,0.85)] flex flex-col pb-8 pt-3 px-6 select-none"
      >
        {/* Top drag handle indicator */}
        <div {...dragHandleProps} className="w-full py-2.5 flex justify-center cursor-grab active:cursor-grabbing">
          <div className="w-12 h-1.5 bg-white/25 rounded-full transition-colors" />
        </div>

        {/* Close icon button */}
        <button
          onClick={handleUpdateLater}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#12261d] hover:bg-[#162f24] text-[#8b9e94] hover:text-[#f7f4eb] border border-[#1e3c2e] flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Title & Subtitle */}
        <div className="flex flex-col items-center text-center mt-3 mb-6">
          <h2 className="text-[22px] sm:text-[24px] font-display-hero font-extrabold text-[#f7f4eb] tracking-tight leading-tight">
            New Update Available
          </h2>
          <p className="text-[14px] text-[#8b9e94] max-w-sm mt-2 leading-relaxed font-normal">
            A new version of bitnotes (v{updateInfo.latestVersion}) is ready to install with performance enhancements and updates.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 w-full">
          <button
            onClick={handleUpdateNow}
            className="w-full h-[52px] rounded-2xl bg-[#f2a93b] hover:bg-[#fbb94d] active:scale-[0.98] text-[#06110c] font-display-hero font-extrabold text-[15px] flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(242,169,59,0.35)] transition-all cursor-pointer tracking-wide"
          >
            <span>Update Now</span>
            <ExternalLink size={16} className="stroke-[2.5]" />
          </button>

          <button
            onClick={handleUpdateLater}
            className="w-full h-[48px] rounded-2xl bg-[#12261d] hover:bg-[#162f24] active:scale-[0.98] text-[#8b9e94] hover:text-[#f7f4eb] border border-[#1e3c2e] font-display-hero font-semibold text-[14px] flex items-center justify-center transition-all cursor-pointer"
          >
            <span>Update Later</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
