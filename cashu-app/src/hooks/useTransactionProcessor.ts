import { useEffect } from 'react';
import { useTransactionStore } from '../store/transactionStore';
import { useWalletStore } from '../store/wallet';
import { startActiveMomoProcessing } from '../services/momoProcessingAdapter';
import { startSavedMomoProcessing } from '../services/savedMomoRecoveryAdapter';
import { startWalletReconciliation } from '../services/walletReconciliationAdapter';

export const TransactionProcessor = () => {
  const { activeTransaction } = useTransactionStore();
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  useEffect(() => {
    if (!activeTransaction) return;
    return startActiveMomoProcessing(activeTransaction.id, activeTransaction.currentPhase, refreshWallet);
  }, [activeTransaction?.id, activeTransaction?.currentPhase, refreshWallet]);

  useEffect(() => startSavedMomoProcessing(), []);

  useEffect(() => startWalletReconciliation(refreshWallet), [refreshWallet]);

  return null;
};
