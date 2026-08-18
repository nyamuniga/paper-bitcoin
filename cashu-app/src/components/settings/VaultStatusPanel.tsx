import React from 'react';
import { Shield, ShieldAlert } from 'lucide-react';

interface VaultStatusPanelProps {
  isBackedUp: boolean;
  setIsBackedUp: (val: boolean) => void;
}

export const VaultStatusPanel: React.FC<VaultStatusPanelProps> = ({ isBackedUp }) => {
  return (
    <section className="bg-surface-container-high rounded-xl p-6 border border-outline-variant flex justify-between items-center">
      <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center border shrink-0 ${isBackedUp ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-primary/20 border-primary/30'}`}>
          {isBackedUp ? <Shield className="w-5 h-5 text-emerald-400" /> : <ShieldAlert className="w-5 h-5 text-primary" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-body-md font-body-md font-bold text-on-surface mb-0.5">Vault Status</h2>
          <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">{isBackedUp ? 'Encrypted & backed up' : 'Backup recommended'}</p>
        </div>
      </div>
    </section>
  );
};
