import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { TransactionDetails, AppPhase } from '../types/momo';

interface TransactionState {
  activeTransaction: TransactionDetails | null;
  history: TransactionDetails[];
  error: string | null;
  setActiveTransaction: (tx: TransactionDetails | null) => void;
  updateTransactionPhase: (phase: AppPhase) => void;
  updateTransaction: (updates: Partial<TransactionDetails>) => void;
  updateHistoryTransaction: (id: string, updates: Partial<TransactionDetails>) => void;
  moveToHistory: (tx: TransactionDetails) => void;
  clearHistory: () => void;
  setError: (err: string | null) => void;
}

export const useTransactionStore = create<TransactionState>()(
  persist(
    (set) => ({
      activeTransaction: null,
      history: [],
      error: null,
      setActiveTransaction: (tx) => set({ activeTransaction: tx }),
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
    }),
    {
      name: 'cashu-transaction-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
