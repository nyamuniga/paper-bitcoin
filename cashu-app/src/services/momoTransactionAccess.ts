import { useTransactionStore } from '../store/transactionStore';
import type { MomoTransactionAccess } from '../types/momo';

export const momoTransactionAccess: MomoTransactionAccess = {
  findById(id) {
    const { activeTransaction, history } = useTransactionStore.getState();
    return activeTransaction?.id === id ? activeTransaction : history.find(transaction => transaction.id === id);
  },
  updateById(id, updates) {
    useTransactionStore.getState().updateTransactionById(id, updates);
  },
  setErrorFor(id, error) {
    useTransactionStore.getState().setErrorForTransaction(id, error);
  },
};
