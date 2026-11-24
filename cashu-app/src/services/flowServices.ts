import {
  initiateMomoPaymentRequest,
  checkMomoPaymentStatus,
  checkMomoPayoutStatus
} from "./momoService";
import {
  createLightningInvoice,
} from "./lightningService";
import {
  AppPhase,
  FulfillmentStep,
} from "../types/momo";
import type { AppTab, MomoPaymentStatusResult, MomoTransactionAccess } from '../types/momo';
import { invoke } from '@tauri-apps/api/core';
import { fetch } from '@tauri-apps/plugin-http';

import {
  EXCHANGE_RATE_API_URL,
  SATS_PER_BTC,
  SPREAD,
  MOMO_WITHDRAWAL_FIXED_FEE,
  ECASH_LIGHTNING_FEE,
  RWF_USD_PEG,
  POLLING_INTERVAL_MS,
  POLLING_TIMEOUT_MS
} from "../constants.local";
import { useTransactionStore } from "../store/transactionStore";
import { useWalletStore } from "../store/wallet";
import { useAddressBookStore } from "../store/addressBookStore";
import { withDeadline } from './proxyRequest';
import { buildMomoReview, assertMomoReviewApproved } from './momoReview';
import type { MomoReview } from './momoReview';
import { MOMO_RECOVERY_MESSAGE } from './momoRecovery';
import type { Scheduler } from './scheduler';
import { fulfillMomoTransaction } from './momoFulfillment';
import { momoFulfillmentOperations } from './momoFulfillmentOperations';
import { momoTransactionAccess } from './momoTransactionAccess';

const recoveryChecks = new Set<string>();
const findTransaction = (id?: string) => {
  const {activeTransaction, history} = useTransactionStore.getState();
  return id ? (activeTransaction?.id === id ? activeTransaction : history.find(tx => tx.id === id)) : activeTransaction;
};

export const checkMomoRecovery = async (id?: string) => {
  const store = useTransactionStore.getState();
  const tx = findTransaction(id);
  if (!tx || !['RWF_TO_SATS', 'SATS_TO_RWF'].includes(tx.direction) || tx.status === 'COMPLETED' || recoveryChecks.has(tx.id)) return;
  recoveryChecks.add(tx.id);
  try {
    const result = tx.direction === 'RWF_TO_SATS'
      ? await checkMomoPaymentStatus(tx.id) : await checkMomoPayoutStatus(tx.id);
    const current = findTransaction(tx.id);
    if (!current || current.currentPhase !== tx.currentPhase) return;
    if (result.status === 'SUCCESSFUL') {
      if (tx.direction === 'RWF_TO_SATS') {
        await handleFulfillOrder(tx.id);
      } else {
        store.updateTransactionById(tx.id, {status:'COMPLETED', fulfillmentStep:FulfillmentStep.COMPLETED, currentPhase:AppPhase.READY_TO_CLAIM});
        void useWalletStore.getState().refreshWallet();
      }
    } else if (result.status === 'FAILED' && tx.direction === 'RWF_TO_SATS') {
      store.updateTransactionById(tx.id, {status:'FAILED', currentPhase:AppPhase.PAYMENT_FAILED, recoveryMessage:result.message});
    } else {
      store.updateTransactionById(tx.id, {currentPhase:AppPhase.RECOVERY_REQUIRED,
        recoveryMessage:tx.direction === 'SATS_TO_RWF' && result.status === 'FAILED'
          ? 'The Mobile Money payout failed. Your Bitcoin may already have funded this cashout. Contact support with this transaction ID to resolve it; do not pay again.'
          : result.message || MOMO_RECOVERY_MESSAGE});
    }
  } finally {
    recoveryChecks.delete(tx.id);
  }
};

export const fetchCurrentRate = async (): Promise<number> => {
  return withDeadline(async signal => {
    const response = await fetch(EXCHANGE_RATE_API_URL, {signal});
    if (!response.ok) throw new Error("Failed to fetch exchange rate.");
    const data = await response.json();
    const btcPriceInUsdRaw = data?.USD?.last;
    if (!btcPriceInUsdRaw) throw new Error("Could not retrieve a valid USD/BTC exchange rate.");

    const btcPriceInRwf = btcPriceInUsdRaw * RWF_USD_PEG;
    return SATS_PER_BTC / btcPriceInRwf;
  });
};

async function currentMomoQuote(direction: MomoReview['direction'], amount: number, phone: string, mint: string, approved?: MomoReview): Promise<MomoReview> {
  const rate = await fetchCurrentRate();
  const current = buildMomoReview({ direction, amount, phone, mint, rate, spread: SPREAD,
    fixedFee: MOMO_WITHDRAWAL_FIXED_FEE, networkReserve: ECASH_LIGHTNING_FEE });
  if (approved) assertMomoReviewApproved(approved, current);
  return current;
}

export const calculateQuote = async (
  rwfAmount: string,
  momoPhoneNumber: string,
  activeTab: AppTab,
  mintUrl: string,
  approved?: MomoReview
) => {
  const store = useTransactionStore.getState();
  if (store.activeTransaction?.status === 'PENDING' && store.activeTransaction.currentPhase !== AppPhase.IDLE) return;
  const amount = parseFloat(rwfAmount);
  if (isNaN(amount) || amount < 100) {
    store.setError("Minimum amount is 100 RWF.");
    return;
  }
  if (amount > 200000) {
    store.setError("Maximum amount is 200,000 RWF.");
    return;
  }
  if (!/^07[89]\d{7}$/.test(momoPhoneNumber)) {
    store.setError("Phone number must start with 078 or 079 and be exactly 10 digits.");
    return;
  }

  const reviewedQuote = approved ? await currentMomoQuote('RWF_TO_SATS', amount, momoPhoneNumber, mintUrl, approved) : undefined;
  // Claim the foreground transaction synchronously after the asynchronous rate check.
  if (approved && store.activeTransaction?.status === 'PENDING' && store.activeTransaction.currentPhase !== AppPhase.IDLE) {
    throw new Error('Another transfer is already in progress.');
  }
  const txId = crypto.randomUUID();
  store.setActiveTransaction({
    id: txId,
    direction: "RWF_TO_SATS",
    rwfAmount: amount,
    satsAmount: 0,
    fee: 0,
    rate: 0,
    invoice: "",
    momoPhoneNumber,
    momoReferenceId: "",
    mintQuoteId: "",
    ecashToken: null,
    paymentHash: null,
    payoutReferenceId: null,
    status: "PENDING",
    timestamp: Date.now(),
    currentPhase: AppPhase.FETCHING_RATE,
    momoSubmission: 'not_started',
    currentTab: activeTab,
    mintUrl: mintUrl
  });

  try {
    const quote = reviewedQuote ?? await currentMomoQuote('RWF_TO_SATS', amount, momoPhoneNumber, mintUrl);
    const feeRwf = 0;
    const totalRwfToPay = quote.amount;
    const netSats = quote.sats;

    store.updateTransactionPhase(AppPhase.INITIATING_PAYMENT);

    let invoice = "";
    let quoteId = "";
    try {
      const res = await withDeadline(() => invoke<{ quote_id: string; invoice: string; amount: number }>('receive_lightning', { mintUrl, amount: netSats }));
      invoice = res.invoice as string;
      quoteId = res.quote_id as string;
    } catch (e: unknown) {
      throw new Error(`Failed to create lightning invoice: ${e}`);
    }

    store.updateTransaction({
      rwfAmount: totalRwfToPay,
      satsAmount: netSats,
      fee: feeRwf,
      rate: quote.rate * (1 - quote.spread),
      invoice: invoice,
      mintQuoteId: quoteId,
    });
    if (useTransactionStore.getState().activeTransaction) {
      store.moveToHistory(useTransactionStore.getState().activeTransaction!);
    }

    store.updateTransaction({momoSubmission:'submitting'});
    const momoResponse = await initiateMomoPaymentRequest(
      txId,
      netSats,
      activeTab || 'ecash',
      totalRwfToPay,
      momoPhoneNumber,
    );
    if (!momoResponse.success || !momoResponse.referenceId) {
      if (!momoResponse.success && momoResponse.submission === 'rejected') store.updateTransaction({momoSubmission:'rejected'});
      throw new Error(momoResponse.message || "Failed to initiate Momo payment.");
    }

    store.updateTransaction({
      rwfAmount: totalRwfToPay,
      satsAmount: netSats,
      fee: feeRwf,
      rate: quote.rate * (1 - quote.spread),
      invoice: invoice,
      momoReferenceId: momoResponse.referenceId,
      mintQuoteId: quoteId,
      currentPhase: AppPhase.PENDING_PAYMENT,
      momoSubmission: 'accepted',
    });
    if (useTransactionStore.getState().activeTransaction) {
      store.moveToHistory(useTransactionStore.getState().activeTransaction!);
    }
  } catch (err: unknown) {
    const errorMessage = typeof err === 'string' ? err : (err instanceof Error ? err.message : "Failed to fetch quote. Please try again.");
    store.setError(errorMessage);
    const ambiguous = useTransactionStore.getState().activeTransaction?.momoSubmission === 'submitting';
    store.updateTransaction({status:ambiguous ? 'PENDING' : 'FAILED', currentPhase:ambiguous ? AppPhase.RECOVERY_REQUIRED : AppPhase.PAYMENT_FAILED, recoveryMessage:errorMessage});
    store.moveToHistory(useTransactionStore.getState().activeTransaction!);
  }
};

export const handleFulfillOrder = async (id?: string) => {
  const transaction = findTransaction(id);
  if (!transaction) return;
  await fulfillMomoTransaction({
    transactionId: transaction.id,
    transactions: momoTransactionAccess,
    operations: momoFulfillmentOperations,
    onCompleted: completed => {
      useWalletStore.getState().refreshWallet();
      if (completed.momoPhoneNumber) {
        try {
          useAddressBookStore.getState().recordSuccessfulUse('momo', completed.momoPhoneNumber, {
            network: completed.momoPhoneNumber.startsWith('078') || completed.momoPhoneNumber.startsWith('079') ? 'mtn' : undefined,
            currency: 'RWF',
          });
        } catch (error) {
          console.warn('Failed to record address book contact:', error);
        }
      }
    },
  });
};

export const startPaymentVerification = ({ transactionId, transactions, checkPaymentStatus, scheduler, isCurrent = () => true }: {
  transactionId: string;
  transactions: MomoTransactionAccess;
  checkPaymentStatus: (transactionId: string) => Promise<MomoPaymentStatusResult>;
  scheduler: Scheduler;
  isCurrent?: () => boolean;
}) => {
  const transaction = transactions.findById(transactionId);
  if (!transactionId || !transaction || transaction.id !== transactionId || !isCurrent()
    || transaction.direction !== 'RWF_TO_SATS' || transaction.status !== 'PENDING'
    || (transaction.currentPhase !== AppPhase.PENDING_PAYMENT && transaction.currentPhase !== AppPhase.VERIFYING_PAYMENT)) return;

  let stopped = false;
  let cancelPoll: (() => void) | undefined;
  let cancelDeadline: (() => void) | undefined;
  const stop = () => {
    stopped = true;
    cancelPoll?.();
    cancelDeadline?.();
    cancelPoll = undefined;
    cancelDeadline = undefined;
  };
  const current = () => {
    if (stopped) return false;
    const target = transactions.findById(transactionId);
    if (!isCurrent() || !target || target.id !== transactionId || target.direction !== 'RWF_TO_SATS'
      || target.status !== 'PENDING' || target.currentPhase !== AppPhase.VERIFYING_PAYMENT) {
      stop();
      return false;
    }
    return true;
  };
  transactions.updateById(transactionId, { currentPhase: AppPhase.VERIFYING_PAYMENT });

  const handlePollingResult = (status: 'SUCCESSFUL' | 'FAILED', message?: string) => {
    if (!current()) return;
    stop();
    if (status === "SUCCESSFUL") {
      transactions.updateById(transactionId, {
        fulfillmentStep: FulfillmentStep.AWAITING_FULFILLMENT,
        currentPhase: AppPhase.VERIFYING_PAYMENT
      });
      handleFulfillOrder(transactionId);
    } else if (status === "FAILED") {
      const error = message || "Your payment failed or was rejected.";
      transactions.setErrorFor(transactionId, error);
      transactions.updateById(transactionId, {
        status: "FAILED",
        recoveryMessage: error,
        timestamp: Date.now(),
        currentPhase: AppPhase.PAYMENT_FAILED
      });
    }
  };

  const pollMomo = async () => {
    if (!current()) return;
    try {
      const { status, message } = await checkPaymentStatus(transactionId);
      if (!current()) return;
      if (status === "SUCCESSFUL" || status === "FAILED") {
        handlePollingResult(status, message);
        return;
      }
    } catch (pollErr) {
      console.warn('Payment status poll failed; will retry:', pollErr);
    }
    if (current()) cancelPoll = scheduler.schedule(pollMomo, POLLING_INTERVAL_MS);
  };

  const checkInitialStatus = async () => {
    try {
      const res = await checkPaymentStatus(transactionId);
      if (!current()) return;
      if (res.status === "SUCCESSFUL" || res.status === "FAILED") {
        handlePollingResult(res.status, res.message);
        return;
      }
    } catch (error) {
      if (!current()) return;
      // A transient connection error does not establish that payment failed.
      console.warn('Initial payment status check failed; continuing to poll:', error);
    }
    if (!current()) return;
    cancelPoll = scheduler.schedule(pollMomo, POLLING_INTERVAL_MS);
    cancelDeadline = scheduler.schedule(() => {
      if (!current()) return;
      stop();
      transactions.setErrorFor(transactionId, null);
      transactions.updateById(transactionId, { currentPhase: AppPhase.RECOVERY_REQUIRED, recoveryMessage:'The provider has not confirmed payment yet. Check status before starting another top-up.' });
    }, POLLING_TIMEOUT_MS);
  };

  // Return ownership immediately, including while the first provider request is pending.
  void checkInitialStatus();
  return stop;
};

export const calculateSendQuote = async (
  rwfAmount: string,
  momoPhoneNumber: string,
  activeTab: AppTab,
  mintUrl: string,
  approved?: MomoReview
) => {
  const store = useTransactionStore.getState();
  if (store.activeTransaction?.status === 'PENDING' && store.activeTransaction.currentPhase !== AppPhase.IDLE) return;
  const amount = parseFloat(rwfAmount);
  if (isNaN(amount) || amount < 100) {
    store.setError("Minimum amount is 100 RWF.");
    return;
  }
  if (amount > 200000) {
    store.setError("Maximum amount is 200,000 RWF.");
    return;
  }
  if (!/^07[89]\d{7}$/.test(momoPhoneNumber)) {
    store.setError("Phone number must start with 078 or 079 and be exactly 10 digits.");
    return;
  }

  const reviewedQuote = approved ? await currentMomoQuote('SATS_TO_RWF', amount, momoPhoneNumber, mintUrl, approved) : undefined;
  // Claim the foreground transaction synchronously after the asynchronous rate check.
  if (approved && store.activeTransaction?.status === 'PENDING' && store.activeTransaction.currentPhase !== AppPhase.IDLE) {
    throw new Error('Another transfer is already in progress.');
  }
  const txId = crypto.randomUUID();
  store.setActiveTransaction({
    id: txId,
    direction: "SATS_TO_RWF",
    rwfAmount: amount,
    satsAmount: 0,
    fee: 0,
    rate: 0,
    invoice: "",
    momoPhoneNumber,
    momoReferenceId: null,
    mintQuoteId: null,
    ecashToken: null,
    paymentHash: null,
    payoutReferenceId: null,
    status: "PENDING",
    timestamp: Date.now(),
    currentPhase: AppPhase.GENERATING_INVOICE,
    momoSubmission: 'not_started',
    currentTab: activeTab,
    mintUrl: mintUrl
  });

  try {
    const quote = reviewedQuote ?? await currentMomoQuote('SATS_TO_RWF', amount, momoPhoneNumber, mintUrl);
    const feeRwf = 0;
    // The wallet budget includes the reserve; the funding invoice must not include it again.
    const netSats = quote.fundingSats;

    const { paymentRequest, paymentHash } = await createLightningInvoice(netSats);

    store.updateTransaction({
      satsAmount: netSats,
      fee: feeRwf,
      rate: quote.rate,
      invoice: paymentRequest,
      paymentHash: paymentHash,
      currentPhase: AppPhase.AWAITING_INVOICE_PAYMENT,
    });
  } catch (err: unknown) {
    console.error("Quote error:", err);
    const errorMessage = typeof err === 'string' ? err : (err instanceof Error ? err.message : "Failed to fetch quote. Please try again.");
    store.setError(errorMessage);
    store.updateTransaction({status:'FAILED', currentPhase:AppPhase.PAYMENT_FAILED, recoveryMessage:errorMessage});
    store.moveToHistory(useTransactionStore.getState().activeTransaction!);
  }
};

export const executeSendPayment = async () => {
  const store = useTransactionStore.getState();
  let currentTx = store.activeTransaction;
  if (!currentTx || currentTx.currentPhase !== AppPhase.AWAITING_INVOICE_PAYMENT) return;

  try {
    store.updateTransactionPhase(AppPhase.PAYING_INVOICE);

    if (!currentTx.invoicePaid) {
      try {
        if (currentTx.mintUrl) {
          await withDeadline(() => invoke<void>('pay_invoice', { invoice: currentTx!.invoice!, mintUrl: currentTx!.mintUrl }));
        } else {
          await withDeadline(() => invoke<void>('pay_invoice', { invoice: currentTx!.invoice! }));
        }
        store.updateTransaction({ invoicePaid: true });
      } catch (e: unknown) {
        throw new Error(`Failed to pay invoice from wallet: ${e}`);
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    store.updateTransaction({
      currentPhase: AppPhase.INITIATING_PAYOUT
    });

  } catch (err: unknown) {
    console.error("Payment error:", err);
    store.setError((err instanceof Error ? err.message : String(err)) || "Failed to pay invoice. Please try again.");
    store.updateTransaction({ currentPhase: AppPhase.RECOVERY_REQUIRED, recoveryMessage:'We could not confirm whether the Bitcoin funding payment completed. Check status before trying again. Do not pay the invoice again.' });
  }
};

export const startPayoutVerification = ({ transactionId, transactions, checkPayoutStatus, scheduler, isCurrent = () => true }: {
  transactionId: string;
  transactions: MomoTransactionAccess;
  checkPayoutStatus: (transactionId: string) => Promise<MomoPaymentStatusResult>;
  scheduler: Scheduler;
  isCurrent?: () => boolean;
}) => {
  const transaction = transactions.findById(transactionId);
  if (!transactionId || !transaction || transaction.id !== transactionId || !isCurrent()
    || transaction.direction !== 'SATS_TO_RWF' || transaction.status !== 'PENDING'
    || transaction.currentPhase !== AppPhase.VERIFYING_PAYOUT) return;

  let stopped = false;
  let cancelPoll: (() => void) | undefined;
  let cancelDeadline: (() => void) | undefined;
  const stop = () => {
    stopped = true;
    cancelPoll?.();
    cancelDeadline?.();
    cancelPoll = undefined;
    cancelDeadline = undefined;
  };
  const current = () => {
    if (stopped) return;
    const target = transactions.findById(transactionId);
    if (!isCurrent() || !target || target.id !== transactionId || target.direction !== 'SATS_TO_RWF'
      || target.status !== 'PENDING' || target.currentPhase !== AppPhase.VERIFYING_PAYOUT) {
      stop();
      return;
    }
    return target;
  };
  const recover = (recoveryMessage: string, error?: string | null) => {
    if (!current()) return;
    stop();
    if (error !== undefined) transactions.setErrorFor(transactionId, error);
    transactions.updateById(transactionId, { currentPhase: AppPhase.RECOVERY_REQUIRED, recoveryMessage });
  };
  const handlePollingResult = (status: 'SUCCESSFUL' | 'FAILED', message?: string) => {
    const target = current();
    if (!target) return;
    if (status === 'FAILED') {
      recover('The Mobile Money payout failed after funding. Contact support with this transaction ID to resolve it; do not pay again.', message || 'MoMo payout failed or was rejected.');
      return;
    }
    stop();
    transactions.updateById(transactionId, {
      status: 'COMPLETED',
      fulfillmentStep: FulfillmentStep.COMPLETED,
      timestamp: Date.now(),
      currentPhase: AppPhase.READY_TO_CLAIM,
    });
    useWalletStore.getState().refreshWallet();
    if (target.momoPhoneNumber) {
      try {
        useAddressBookStore.getState().recordSuccessfulUse('momo', target.momoPhoneNumber, {
          network: target.momoPhoneNumber.startsWith('078') || target.momoPhoneNumber.startsWith('079') ? 'mtn' : undefined,
          currency: 'RWF',
        });
      } catch (error) {
        console.warn('Failed to record address book contact:', error);
      }
    }
  };
  const pollPayout = async () => {
    if (!current()) return;
    try {
      const { status, message } = await checkPayoutStatus(transactionId);
      if (!current()) return;
      if (status === 'SUCCESSFUL' || status === 'FAILED') {
        handlePollingResult(status, message);
        return;
      }
    } catch (error) {
      console.warn('Payout status poll failed; will retry:', error);
    }
    if (current()) cancelPoll = scheduler.schedule(pollPayout, POLLING_INTERVAL_MS);
  };
  if (!transaction.payoutReferenceId) {
    recover(transaction.invoicePaid ? MOMO_RECOVERY_MESSAGE : 'The funding payment has not been confirmed. Contact support before retrying this cashout.');
  } else {
    cancelPoll = scheduler.schedule(pollPayout, POLLING_INTERVAL_MS);
    cancelDeadline = scheduler.schedule(() => {
      recover('The payout has not been confirmed yet. Check status before trying another cashout.', null);
    }, POLLING_TIMEOUT_MS);
  }
  return stop;
};
