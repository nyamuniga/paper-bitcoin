import type { AppPhase } from '../types/momo';
import { useTransactionStore } from '../store/transactionStore';
import { startPaymentVerification, startPayoutVerification, executeSendPayment } from './flowServices';
import { checkMomoPaymentStatus, checkMomoPayoutStatus, initiateMomoPayout } from './momoService';
import { startPayoutInitiation } from './payoutInitiation';
import { momoTransactionAccess } from './momoTransactionAccess';
import { startMomoTransactionProcessing } from './momoProcessing';
import { timeoutScheduler } from './scheduler';

export const startActiveMomoProcessing = (transactionId: string, phase: AppPhase | undefined, refreshWallet: () => Promise<void>) =>
  startMomoTransactionProcessing({
    transactionId,
    phase,
    isActive: id => useTransactionStore.getState().activeTransaction?.id === id,
    operations: {
      verifyCashIn: (id, isCurrent) => startPaymentVerification({
        transactionId: id, transactions: momoTransactionAccess, checkPaymentStatus: checkMomoPaymentStatus,
        scheduler: timeoutScheduler, isCurrent,
      }),
      initiatePayout: (id, isCurrent) => startPayoutInitiation({
        transactionId: id, transactions: momoTransactionAccess, submitPayout: initiateMomoPayout, isCurrent,
      }),
      verifyPayout: (id, isCurrent) => startPayoutVerification({
        transactionId: id, transactions: momoTransactionAccess, checkPayoutStatus: checkMomoPayoutStatus,
        scheduler: timeoutScheduler, isCurrent,
      }),
      payFundingInvoice: executeSendPayment,
      refreshWallet,
    },
  });
