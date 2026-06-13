import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface WalletState {
  isInitialized: boolean;
  balanceSats: number;
  mintBalances: Record<string, number>;
  pendingTxs: number;
  setInitialized: (val: boolean) => void;
  setBalance: (sats: number) => void;
  setMintBalances: (balances: Record<string, number>) => void;
  refreshWallet: () => Promise<void>;
}

export const useWalletStore = create<WalletState>()((set) => ({
  isInitialized: false,
  balanceSats: 0,
  mintBalances: {},
  pendingTxs: 0,
  setInitialized: (val) => set({ isInitialized: val }),
  setBalance: (sats) => set({ balanceSats: sats }),
  setMintBalances: (balances) => set({ mintBalances: balances }),
  refreshWallet: async () => {
    try {
      const res: any = await invoke('wallet_info');
      
      let pendingCount = 0;
      if (res.is_initialized) {
        try {
          const txs: any[] = await invoke('get_transactions');
          pendingCount = txs.filter(t => t.status === 'Pending').length;
        } catch (e) {
          console.error("Failed to load txs", e);
        }
      }

      set({
        isInitialized: res.is_initialized,
        balanceSats: res.balance_sats,
        mintBalances: res.mint_balances,
        pendingTxs: pendingCount,
      });
    } catch (e) {
      console.error("Failed to refresh wallet:", e);
    }
  },
}));
