import React from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useBottomSheet } from '../../hooks/useBottomSheet';

export interface ActionOption {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  colorClass?: string;
}

interface ActionMenuModalProps {
  title: string;
  options: ActionOption[];
  onClose: () => void;
}

export const ActionMenuModal: React.FC<ActionMenuModalProps> = ({ title, options, onClose }) => {
  const { dragHandleProps, sheetStyle, backdropStyle, closeWithAnimation } = useBottomSheet({ onClose });

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm" 
      style={backdropStyle}
      onClick={closeWithAnimation}
    >
      <div 
        onClick={e => e.stopPropagation()}
        style={sheetStyle}
        className="bg-surface-container-high/95 backdrop-blur-xl rounded-t-[28px] sm:rounded-2xl w-full max-w-[480px] border-t border-x sm:border border-[#142d20] shadow-[0_16px_48px_-8px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col relative pb-8 sm:pb-4"
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
          className="flex justify-between items-center px-6 py-4 relative z-10 border-b border-[rgba(247,244,235,0.04)] cursor-grab active:cursor-grabbing"
        >
          <h2 className="font-display-hero text-headline-sm font-semibold text-on-surface">{title}</h2>
          <button 
            onClick={closeWithAnimation}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors border border-outline-variant/30"
          >
            <X size={18} />
          </button>
        </div>

        {/* Options */}
        <div className="p-4 flex flex-col gap-2.5 relative z-10">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => { opt.onClick(); closeWithAnimation(); }}
              className="flex items-center gap-4 p-3.5 bg-surface-container/50 hover:bg-surface-container rounded-2xl border border-outline-variant hover:border-primary/40 text-left w-full group transition-all duration-200 active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[#0e2e20] text-primary border border-primary/30 group-hover:scale-105 group-hover:border-primary/60 transition-all duration-200 flex-shrink-0 shadow-sm">
                {opt.icon}
              </div>
              <span className="font-display-hero text-[15px] text-on-surface font-semibold tracking-tight">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

