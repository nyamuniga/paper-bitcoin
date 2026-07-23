import React from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

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
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm transition-opacity" onClick={onClose}>
      <div 
        onClick={e => e.stopPropagation()}
        className="bg-surface-container-high rounded-t-[2rem] sm:rounded-3xl w-full max-w-[480px] border-t border-x sm:border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col relative animate-slide-up sm:animate-fade-in pb-8 sm:pb-4"
      >
        <div className="absolute inset-0 texture-overlay opacity-20 pointer-events-none"></div>
        
        {/* Drag Handle */}
        <div className="w-full flex justify-center pt-3 pb-1 relative z-10 sm:hidden">
          <div className="w-12 h-1.5 bg-outline-variant/30 rounded-full"></div>
        </div>
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 relative z-10">
          <h2 className="text-headline-sm font-headline-sm text-on-surface">{title}</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Options */}
        <div className="p-4 flex flex-col gap-2 relative z-10">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => { opt.onClick(); onClose(); }}
              className="flex items-center gap-4 p-4 hover:bg-surface-container-highest transition-colors rounded-2xl border border-transparent hover:border-outline-variant/10 text-left w-full group"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${opt.colorClass || 'bg-surface-container-highest text-on-surface'} group-hover:scale-110 transition-transform duration-200`}>
                {opt.icon}
              </div>
              <span className="text-body-lg font-body-lg text-on-surface font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
