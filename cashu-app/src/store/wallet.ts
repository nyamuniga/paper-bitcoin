import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface WalletState {
  isInitialized: boolean;
  balanceSats: number;
  mintBalances: Record<string, number>;
  pendingTxs: number;
  lastUpdate: number;
  setInitialized: (val: boolean) => void;
  setBalance: (sats: number) => void;
  setMintBalances: (balances: Record<string, number>) => void;
  refreshWallet: () => Promise<void>;
  clearWalletState: () => void;
}

let currentRefreshSeq = 0;

export const useWalletStore = create<WalletState>()((set) => ({
  isInitialized: false,
  balanceSats: 0,
  mintBalances: {},
  pendingTxs: 0,
  lastUpdate: 0,
  setInitialized: (val) => set({ isInitialized: val }),
  setBalance: (sats) => set({ balanceSats: sats }),
  setMintBalances: (balances) => set({ mintBalances: balances }),
  clearWalletState: () => {
    currentRefreshSeq++;
    set({
      isInitialized: false,
      balanceSats: 0,
      mintBalances: {},
      pendingTxs: 0,
    });
  },
  refreshWallet: async () => {
    const seq = currentRefreshSeq;
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

      if (seq !== currentRefreshSeq) return;

      set({
        isInitialized: res.is_initialized,
        balanceSats: res.balance_sats,
        mintBalances: res.mint_balances,
        pendingTxs: pendingCount,
        lastUpdate: Date.now(),
      });
    } catch (e) {
      if (seq !== currentRefreshSeq) return;
      console.error("Failed to refresh wallet (likely locked):", e);
      set({
        isInitialized: false,
        balanceSats: 0,
        mintBalances: {},
        pendingTxs: 0,
        lastUpdate: Date.now(),
      });
    }
  },
}));
