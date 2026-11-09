import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AppPhase } from '../types/momo';
import type { TransactionDetails } from '../types/momo';
import { canSaveMomoTransaction, recoverInterruptedMomo } from '../services/momoRecovery';

interface TransactionState {
  activeTransaction: TransactionDetails | null;
  history: TransactionDetails[];
  error: string | null;
  setActiveTransaction: (tx: TransactionDetails | null) => void;
  saveActiveTransaction: () => boolean;
  resumeTransaction: (id: string) => boolean;
  recoverTransactions: () => void;
  updateTransactionPhase: (phase: AppPhase) => void;
  updateTransaction: (updates: Partial<TransactionDetails>) => void;
  updateTransactionById: (id: string, updates: Partial<TransactionDetails>) => void;
  updateHistoryTransaction: (id: string, updates: Partial<TransactionDetails>) => void;
  moveToHistory: (tx: TransactionDetails) => void;
  clearHistory: () => void;
  setError: (err: string | null) => void;
  reset: () => void;
}

export const useTransactionStore = create<TransactionState>()(
  persist(
    (set) => ({
      activeTransaction: null,
      history: [],
      error: null,
      setActiveTransaction: (tx) => set({ activeTransaction: tx }),
      saveActiveTransaction: () => {
        let saved = false;
        set(state => {
          if (!canSaveMomoTransaction(state.activeTransaction)) return state;
          saved = true;
          const tx = recoverInterruptedMomo(state.activeTransaction);
          return {activeTransaction:null, error:null,
            history:tx ? [tx, ...state.history.filter(t => t.id !== tx.id)] : state.history};
        });
        return saved;
      },
      resumeTransaction: (id) => {
        let resumed = false;
        set(state => {
          if (state.activeTransaction) return state;
          const tx = state.history.find(t => t.id === id);
          if (!tx) return state;
          resumed = true;
          return {activeTransaction:tx, error:null};
        });
        return resumed;
      },
      recoverTransactions: () => set(state => {
        const active = recoverInterruptedMomo(state.activeTransaction);
        const history = state.history.map(tx => recoverInterruptedMomo(tx) ?? tx);
        return {activeTransaction:active,
          history:active ? [active,...history.filter(tx => tx.id !== active.id)] : history,
          error:active?.currentPhase === AppPhase.RECOVERY_REQUIRED ? null : state.error};
      }),
      updateTransactionPhase: (phase) =>
        set((state) =>
          state.activeTransaction
            ? { activeTransaction: { ...state.activeTransaction, currentPhase: phase } }
            : state
        ),
      updateTransaction: (updates) =>
        set((state) =>
          state.activeTransaction
            ? { activeTransaction: { ...state.activeTransaction, ...updates } }
            : state
        ),
      updateTransactionById: (id, updates) => set(state => {
        const tx = state.activeTransaction?.id === id ? state.activeTransaction : state.history.find(t => t.id === id);
        if (!tx) return state;
        const updated = {...tx, ...updates};
        return {
          activeTransaction:state.activeTransaction?.id === id ? updated : state.activeTransaction,
          history:state.history.some(t => t.id === id)
            ? state.history.map(t => t.id === id ? updated : t)
            : [updated,...state.history],
        };
      }),
      updateHistoryTransaction: (id, updates) =>
        set((state) => ({
          history: state.history.map(t => t.id === id ? { ...t, ...updates } : t)
        })),
      moveToHistory: (tx) =>
        set((state) => ({
          history: [tx, ...state.history.filter((t) => t.id !== tx.id)],
        })),
      clearHistory: () => set({ history: [] }),
      setError: (err) => set({ error: err }),
      reset: () => set({ activeTransaction: null, history: [], error: null }),
    }),
    {
      name: 'cashu-transaction-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.recoverTransactions();
      },
    }
  )
);
