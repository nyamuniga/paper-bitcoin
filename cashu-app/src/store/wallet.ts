import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface WalletState {
  isInitialized: boolean;
  isLoading: boolean;
  balanceSats: number;
  mintBalances: Record<string, number>;
  pendingTxs: number;
  hasUnreadTxs: boolean;
  latestTxId: string | null;
  lastUpdate: number;
  setInitialized: (val: boolean) => void;
  setBalance: (sats: number) => void;
  setMintBalances: (balances: Record<string, number>) => void;
  refreshWallet: () => Promise<void>;
  clearWalletState: () => void;
  markHistorySeen: () => void;
}

const LAST_SEEN_TX_ID_KEY = 'bitnotes_last_seen_tx_id';
const LAST_SEEN_TX_TIME_KEY = 'bitnotes_last_seen_tx_time';

function getLastSeenTxInfo(): { id: string | null; time: number } {
  try {
    const id = localStorage.getItem(LAST_SEEN_TX_ID_KEY);
    const timeVal = localStorage.getItem(LAST_SEEN_TX_TIME_KEY);
    const time = timeVal ? parseInt(timeVal, 10) || 0 : 0;
    return { id, time };
  } catch {
    return { id: null, time: 0 };
  }
}

function setLastSeenTxInfo(id: string | null, time: number): void {
  try {
    if (id) {
      localStorage.setItem(LAST_SEEN_TX_ID_KEY, id);
    }
    localStorage.setItem(LAST_SEEN_TX_TIME_KEY, time.toString());
  } catch (e) {
    console.error('Failed to save last seen tx info', e);
  }
}

let currentRefreshSeq = 0;

export const useWalletStore = create<WalletState>()((set, get) => ({
  isInitialized: false,
  isLoading: false,
  balanceSats: 0,
  mintBalances: {},
  pendingTxs: 0,
  hasUnreadTxs: false,
  latestTxId: null,
  lastUpdate: 0,
  setInitialized: (val) => set({ isInitialized: val }),
  setBalance: (sats) => set({ balanceSats: sats }),
  setMintBalances: (balances) => set({ mintBalances: balances }),
  clearWalletState: () => {
    currentRefreshSeq++;
    set({
      isInitialized: false,
      isLoading: false,
      balanceSats: 0,
      mintBalances: {},
      pendingTxs: 0,
      hasUnreadTxs: false,
      latestTxId: null,
    });
  },
  markHistorySeen: () => {
    const state = get();
    setLastSeenTxInfo(state.latestTxId, Date.now());
    set({ hasUnreadTxs: false });
  },
  refreshWallet: async () => {
    const seq = currentRefreshSeq;
    set((state) => ({ isLoading: state.lastUpdate === 0 }));
    try {
      const res: any = await invoke('wallet_info');
      
      let pendingCount = 0;
      let hasUnread = false;
      let newestTxId: string | null = null;

      if (res.is_initialized) {
        try {
          const txs: any[] = await invoke('get_transactions');
          pendingCount = txs.filter((t: any) => t.status === 'Pending').length;

          const { id: lastSeenId, time: lastSeenTime } = getLastSeenTxInfo();
          const isFirstRun = localStorage.getItem(LAST_SEEN_TX_TIME_KEY) === null;
          const isCurrentlyViewingHistory = typeof window !== 'undefined' && window.location.pathname === '/history';

          if (txs.length > 0) {
            const newestTx = txs[0];
            newestTxId = newestTx.id;
            const newestTime = (newestTx.timestamp || 0) * 1000;

            if (isFirstRun || isCurrentlyViewingHistory) {
              setLastSeenTxInfo(newestTx.id, Math.max(newestTime, Date.now()));
              hasUnread = false;
            } else {
              // Unread if newest transaction is newer than lastSeenTime and its ID is not lastSeenId
              hasUnread = newestTime > lastSeenTime && newestTx.id !== lastSeenId;
            }
          } else {
            if (isFirstRun) {
              setLastSeenTxInfo(null, Date.now());
            }
            hasUnread = false;
          }
        } catch (e) {
          console.error("Failed to load txs", e);
        }
      }

      if (seq !== currentRefreshSeq) return;

      set({
        isInitialized: res.is_initialized,
        isLoading: false,
        balanceSats: res.balance_sats,
        mintBalances: res.mint_balances,
        pendingTxs: pendingCount,
        hasUnreadTxs: hasUnread,
        latestTxId: newestTxId,
        lastUpdate: Date.now(),
      });
    } catch (e) {
      if (seq !== currentRefreshSeq) return;
      console.error("Failed to refresh wallet (likely locked):", e);
      set({
        isInitialized: false,
        isLoading: false,
        balanceSats: 0,
        mintBalances: {},
        pendingTxs: 0,
        hasUnreadTxs: false,
        latestTxId: null,
        lastUpdate: Date.now(),
      });
    }
  },
}));
