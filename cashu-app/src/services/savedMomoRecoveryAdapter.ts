import { useTransactionStore } from '../store/transactionStore';
import { checkMomoRecovery } from './flowServices';
import { startSavedMomoRecovery } from './momoProcessing';
import { timeoutScheduler } from './scheduler';

export const startSavedMomoProcessing = () => startSavedMomoRecovery({
  getTransactions: useTransactionStore.getState,
  recover: checkMomoRecovery,
  scheduler: timeoutScheduler,
  now: () => Date.now(),
  reportError: () => console.error('Could not reconcile a saved Mobile Money transfer.'),
});
