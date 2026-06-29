import React from 'react';
import { Shield, ShieldAlert } from 'lucide-react';

interface VaultStatusPanelProps {
  isBackedUp: boolean;
  setIsBackedUp: (val: boolean) => void;
}

export const VaultStatusPanel: React.FC<VaultStatusPanelProps> = ({ isBackedUp }) => {
  return (
    <section className="bg-surface-container-high rounded-xl p-6 border border-outline-variant/30 flex justify-between items-center">
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${isBackedUp ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-amber-500/20 border-amber-500/30'}`}>
          {isBackedUp ? <Shield className="w-5 h-5 text-emerald-400" /> : <ShieldAlert className="w-5 h-5 text-amber-500" />}
        </div>
        <div>
          <h2 className="text-body-md font-body-md font-bold text-on-surface mb-1">Local Vault Status</h2>
          <p className="text-sm text-on-surface-variant">{isBackedUp ? 'Wallet data is secure and backed up locally.' : 'Wallet data not backed up!'}</p>
        </div>
      </div>
    </section>
  );
};
