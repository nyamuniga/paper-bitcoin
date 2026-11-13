import {
  initiateMomoPaymentRequest,
  checkMomoPaymentStatus,
  initiateMomoPayout,
  checkMomoPayoutStatus
} from "./momoService";
import {
  payLightningInvoice,
  createLightningInvoice,
} from "./lightningService";
import {
  AppPhase,
  FulfillmentStep,
} from "../types/momo";
import type { AppTab } from '../types/momo';
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
  POLLING_TIMEOUT_MS,
  MOMO_API_BASE_URL
} from "../constants";
import { useTransactionStore } from "../store/transactionStore";
import { useWalletStore } from "../store/wallet";
import { useAddressBookStore } from "../store/addressBookStore";
import { withDeadline } from './proxyRequest';
import { buildMomoReview, assertMomoReviewApproved } from './momoReview';
import type { MomoReview } from './momoReview';
import { MOMO_RECOVERY_MESSAGE } from './momoRecovery';

const recoveryChecks = new Set<string>();
const fulfillmentChecks = new Set<string>();
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

export const fetchProxyBlinkBalance = async (): Promise<number> => {
  try {
    return await withDeadline(async signal => {
      const response = await fetch(`${MOMO_API_BASE_URL}/payment/balance`, {signal});
      if (!response.ok) return 0;
      const data = await response.json();

      const wallets = data?.data?.me?.defaultAccount?.wallets || [];
      const btcWallet = wallets.find((w: any) => w.walletCurrency === 'BTC');

      return btcWallet ? btcWallet.balance : 0;
    });
  } catch (error) {
    console.error("Failed to fetch proxy blink balance", error);
    return 0;
  }
};

async function reviewedMomoRate(approved: MomoReview | undefined, direction: 'RWF_TO_SATS' | 'SATS_TO_RWF', amount: number, phone: string, mint: string) {
  if (!approved) return undefined;
  const rate = await fetchCurrentRate();
  const current = buildMomoReview({ direction, amount, phone, mint, rate, spread: SPREAD,
    fixedFee: MOMO_WITHDRAWAL_FIXED_FEE, networkReserve: ECASH_LIGHTNING_FEE });
  assertMomoReviewApproved(approved, current);
  return rate;
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

  const reviewedRate = approved ? await reviewedMomoRate(approved, 'RWF_TO_SATS', amount, momoPhoneNumber, mintUrl) : undefined;
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
    const rwfToSatsRate = reviewedRate ?? await fetchCurrentRate();

    const feeRwf = 0;
    const totalRwfToPay = amount;

    store.updateTransactionPhase(AppPhase.INITIATING_PAYMENT);

    // Apply 5% spread: give 5% fewer sats (absorbs 2.3% MTN fee and yields 2.7% profit)
    const netSats = Math.floor(amount * (1 - SPREAD) * rwfToSatsRate);

    let invoice = "";
    let quoteId = "";
    try {
      const res: any = await withDeadline(() => invoke('receive_lightning', { mintUrl, amount: netSats }));
      invoice = res.invoice as string;
      quoteId = res.quote_id as string;
    } catch (e: any) {
      throw new Error(`Failed to create lightning invoice: ${e}`);
    }

    store.updateTransaction({
      rwfAmount: totalRwfToPay,
      satsAmount: netSats,
      fee: feeRwf,
      rate: rwfToSatsRate * (1 - SPREAD),
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
      if (momoResponse.submission === 'rejected') store.updateTransaction({momoSubmission:'rejected'});
      throw new Error(momoResponse.message || "Failed to initiate Momo payment.");
    }

    store.updateTransaction({
      rwfAmount: totalRwfToPay,
      satsAmount: netSats,
      fee: feeRwf,
      rate: rwfToSatsRate * (1 - SPREAD),
      invoice: invoice,
      momoReferenceId: momoResponse.referenceId,
      mintQuoteId: quoteId,
      currentPhase: AppPhase.PENDING_PAYMENT,
      momoSubmission: 'accepted',
    });
    if (useTransactionStore.getState().activeTransaction) {
      store.moveToHistory(useTransactionStore.getState().activeTransaction!);
    }
  } catch (err: any) {
    const errorMessage = typeof err === 'string' ? err : (err?.message || "Failed to fetch quote. Please try again.");
    store.setError(errorMessage);
    const ambiguous = useTransactionStore.getState().activeTransaction?.momoSubmission === 'submitting';
    store.updateTransaction({status:ambiguous ? 'PENDING' : 'FAILED', currentPhase:ambiguous ? AppPhase.RECOVERY_REQUIRED : AppPhase.PAYMENT_FAILED, recoveryMessage:errorMessage});
    store.moveToHistory(useTransactionStore.getState().activeTransaction!);
  }
};

export const handleFulfillOrder = async (id?: string) => {
  const store = useTransactionStore.getState();
  const currentTx = findTransaction(id);
  if (!currentTx || fulfillmentChecks.has(currentTx.id)) return;
  fulfillmentChecks.add(currentTx.id);

  try {
    store.updateTransactionById(currentTx.id, {currentPhase:AppPhase.PAYING_INVOICE});

    // A previous app session may already have paid/claimed this exact invoice.
    const existing = await withDeadline(() => invoke<string>('check_transaction_status', {txId:currentTx!.mintQuoteId}), 20000);
    if (existing !== 'Success') {
      const { success, message } = await payLightningInvoice(currentTx.invoice!);
      if (!success) throw new Error(message || "Gateway failed to pay the Lightning invoice.");
    }

    store.updateTransactionById(currentTx.id, {currentPhase:AppPhase.FULFILLING});

    let mintSuccess = existing === 'Success';
    let mintErrMessage = "";
    // Was: 30 s total, 5 s/attempt, 15 attempts.
    const MINT_MAX_ATTEMPTS = 20;
    const mintDeadline = Date.now() + 90000;

    for (let i = 0; i < MINT_MAX_ATTEMPTS && !mintSuccess && Date.now() < mintDeadline; i++) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const status = await withDeadline(
          () => invoke<string>('check_transaction_status', { txId: currentTx!.mintQuoteId }),
          20000 // was 5000
        );
        if (status === 'Success') {
          mintSuccess = true;
          break;
        } else {
          mintErrMessage = `Status returned: ${status}`;
        }
      } catch (mintErr: any) {
        console.warn(`Mint attempt ${i + 1} failed:`, mintErr);
        mintErrMessage = mintErr.toString();
      }
    }

    if (!mintSuccess) {
      throw new Error(`Payment succeeded but failed to mint eCash. Please retry from History. Error: ${mintErrMessage}`);
    }

    store.updateTransactionById(currentTx.id, {
      fulfillmentStep: FulfillmentStep.COMPLETED,
      status: "COMPLETED",
      timestamp: Date.now(),
      currentPhase: AppPhase.READY_TO_CLAIM
    });

    useWalletStore.getState().refreshWallet();

    if (currentTx.momoPhoneNumber) {
      try {
        useAddressBookStore.getState().recordSuccessfulUse('momo', currentTx.momoPhoneNumber, {
          network: currentTx.momoPhoneNumber.startsWith('078') || currentTx.momoPhoneNumber.startsWith('079') ? 'mtn' : undefined,
          currency: 'RWF',
        });
      } catch (e) {
        console.warn('Failed to record address book contact:', e);
      }
    }
  } catch (err: any) {
    console.error("Fulfillment error:", err);
    if (useTransactionStore.getState().activeTransaction?.id === currentTx.id) store.setError(err.message || "Failed to fulfill order. Please try again.");
    store.updateTransactionById(currentTx.id, { currentPhase: AppPhase.RECOVERY_REQUIRED, recoveryMessage:err.message || MOMO_RECOVERY_MESSAGE });
  } finally {
    fulfillmentChecks.delete(currentTx.id);
  }
};

export const startPaymentVerification = async (
  stopPolling: () => void,
  pollingIntervalRef: React.MutableRefObject<any>,
  pollingTimeoutRef: React.MutableRefObject<any>,
  isCurrent: () => boolean = () => true
) => {
  const store = useTransactionStore.getState();
  const transaction = store.activeTransaction;
  if (!transaction) return;

  stopPolling();
  store.updateTransactionPhase(AppPhase.VERIFYING_PAYMENT);

  const handlePollingResult = (status: 'SUCCESSFUL' | 'FAILED', message?: string) => {
    if (!isCurrent()) return;
    stopPolling();
    const currentTx = useTransactionStore.getState().activeTransaction;
    if (!currentTx) return;

    if (status === "SUCCESSFUL") {
      store.updateTransaction({
        fulfillmentStep: FulfillmentStep.AWAITING_FULFILLMENT,
        currentPhase: AppPhase.VERIFYING_PAYMENT
      });
      handleFulfillOrder();
    } else if (status === "FAILED") {
      store.setError(message || "Your payment failed or was rejected.");
      store.updateTransaction({
        status: "FAILED",
        timestamp: Date.now(),
        currentPhase: AppPhase.PAYMENT_FAILED
      });
      store.moveToHistory(useTransactionStore.getState().activeTransaction!);
    }
  };

  try {
    const res = await checkMomoPaymentStatus(transaction.id);
    if (!isCurrent()) return;
    if (res.status === "SUCCESSFUL" || res.status === "FAILED") {
      handlePollingResult(res.status, res.message);
      return;
    }
  } catch (e) {
    if (!isCurrent()) return;
    // Was: give up → RECOVERY_REQUIRED. Now: fall through to polling —
    // a single timeout on a bad link is not a real failure.
    console.warn('Initial payment status check failed; continuing to poll:', e);
  }

  if (!pollingIntervalRef.current) {
    const pollMomo = async () => {
      if (!isCurrent()) return;
      try {
        const tx = useTransactionStore.getState().activeTransaction;
        if (tx) {
          const { status, message } = await checkMomoPaymentStatus(tx.id);
          if (!isCurrent()) return;
          if (status === "SUCCESSFUL" || status === "FAILED") {
            handlePollingResult(status, message);
            return; // stop polling
          }
        }
      } catch (pollErr) {
        // Was: uncaught → loop silently died and POLLING_TIMEOUT_MS
        // then flagged a false RECOVERY_REQUIRED. Now: log and retry.
        console.warn('Payment status poll failed; will retry:', pollErr);
        if (!isCurrent()) return;
      }
      pollingIntervalRef.current = setTimeout(pollMomo, POLLING_INTERVAL_MS);
    };
    pollingIntervalRef.current = setTimeout(pollMomo, POLLING_INTERVAL_MS);
  }

  pollingTimeoutRef.current = setTimeout(() => {
    if (!isCurrent()) return;
    stopPolling();
    if (useTransactionStore.getState().activeTransaction?.currentPhase === AppPhase.VERIFYING_PAYMENT) {
      store.setError(null);
      store.updateTransaction({ currentPhase: AppPhase.RECOVERY_REQUIRED, recoveryMessage:'The provider has not confirmed payment yet. Check status before starting another top-up.' });
      if (useTransactionStore.getState().activeTransaction) {
        store.moveToHistory(useTransactionStore.getState().activeTransaction!);
      }
    }
  }, POLLING_TIMEOUT_MS);
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

  const reviewedRate = approved ? await reviewedMomoRate(approved, 'SATS_TO_RWF', amount, momoPhoneNumber, mintUrl) : undefined;
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
    const rwfToSatsRate = reviewedRate ?? await fetchCurrentRate();

    const feeRwf = 0;
    // Total RWF equivalent in sats to charge user: covers amount + 120 RWF MTN payout fee + 5% spread margin
    const totalRwfNeeded = amount + MOMO_WITHDRAWAL_FIXED_FEE + Math.ceil(amount * SPREAD);

    const netSats = Math.ceil(totalRwfNeeded * rwfToSatsRate);

    const { paymentRequest, paymentHash } = await createLightningInvoice(netSats);

    store.updateTransaction({
      satsAmount: netSats,
      fee: feeRwf,
      rate: rwfToSatsRate,
      invoice: paymentRequest,
      paymentHash: paymentHash,
      currentPhase: AppPhase.AWAITING_INVOICE_PAYMENT,
    });
  } catch (err: any) {
    console.error("Quote error:", err);
    const errorMessage = typeof err === 'string' ? err : (err?.message || "Failed to fetch quote. Please try again.");
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
          await withDeadline(() => invoke('pay_invoice', { invoice: currentTx!.invoice!, mintUrl: currentTx!.mintUrl }));
        } else {
          await withDeadline(() => invoke('pay_invoice', { invoice: currentTx!.invoice! }));
        }
        store.updateTransaction({ invoicePaid: true });
      } catch (e: any) {
        throw new Error(`Failed to pay invoice from wallet: ${e}`);
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    store.updateTransaction({
      currentPhase: AppPhase.INITIATING_PAYOUT
    });

  } catch (err: any) {
    console.error("Payment error:", err);
    store.setError(err.message || "Failed to pay invoice. Please try again.");
    store.updateTransaction({ currentPhase: AppPhase.RECOVERY_REQUIRED, recoveryMessage:'We could not confirm whether the Bitcoin funding payment completed. Check status before trying again. Do not pay the invoice again.' });
  }
};

export const initiateAndVerifyPayout = async (
  stopPolling: () => void,
  pollingIntervalRef: React.MutableRefObject<any>,
  pollingTimeoutRef: React.MutableRefObject<any>,
  isCurrent: () => boolean = () => true
) => {
  const store = useTransactionStore.getState();
  const transaction = store.activeTransaction;
  if (!transaction) return;

  stopPolling();
  try {
    // Check if payout was already initiated
    let referenceId = transaction.payoutReferenceId;

    if (!referenceId) {
      if (!transaction.invoicePaid) {
        store.updateTransaction({currentPhase:AppPhase.RECOVERY_REQUIRED, recoveryMessage:'The funding payment has not been confirmed. Contact support before retrying this cashout.'});
        return;
      }
      if (transaction.momoSubmission !== 'not_started') {
        store.updateTransaction({currentPhase:AppPhase.RECOVERY_REQUIRED, recoveryMessage:MOMO_RECOVERY_MESSAGE});
        return;
      }
      store.updateTransaction({momoSubmission:'submitting'});
      const payoutRes = await initiateMomoPayout(
        transaction.id,
        transaction.rwfAmount,
        transaction.satsAmount,
        transaction.momoPhoneNumber
      );
      if (!isCurrent()) return;

      if (!payoutRes.success || !payoutRes.referenceId) {
        if (payoutRes.submission === 'rejected') store.updateTransaction({momoSubmission:'rejected'});
        throw new Error(payoutRes.message || "Failed to initiate MoMo payout.");
      }
      referenceId = payoutRes.referenceId;

      store.updateTransaction({
        payoutReferenceId: referenceId,
        momoSubmission: 'accepted',
        currentPhase: AppPhase.VERIFYING_PAYOUT
      });
    } else {
      store.updateTransactionPhase(AppPhase.VERIFYING_PAYOUT);
    }

    const handlePollingResult = (status: 'SUCCESSFUL' | 'FAILED', message?: string) => {
      if (!isCurrent()) return;
      stopPolling();
      const currentTx = useTransactionStore.getState().activeTransaction;
      if (!currentTx) return;

      if (status === "SUCCESSFUL") {
        store.updateTransaction({
          status: "COMPLETED",
          fulfillmentStep: FulfillmentStep.COMPLETED,
          timestamp: Date.now(),
          currentPhase: AppPhase.READY_TO_CLAIM
        });
        store.moveToHistory(useTransactionStore.getState().activeTransaction!);
        useWalletStore.getState().refreshWallet();

        if (currentTx.momoPhoneNumber) {
          try {
            useAddressBookStore.getState().recordSuccessfulUse('momo', currentTx.momoPhoneNumber, {
              network: currentTx.momoPhoneNumber.startsWith('078') || currentTx.momoPhoneNumber.startsWith('079') ? 'mtn' : undefined,
              currency: 'RWF',
            });
          } catch (e) {
            console.warn('Failed to record address book contact:', e);
          }
        }
      } else if (status === "FAILED") {
        store.setError(message || "MoMo payout failed or was rejected.");
        store.updateTransaction({ currentPhase:AppPhase.RECOVERY_REQUIRED, recoveryMessage:'The Mobile Money payout failed after funding. Contact support with this transaction ID to resolve it; do not pay again.' });
        store.moveToHistory(useTransactionStore.getState().activeTransaction!);
      }
    };

    if (!pollingIntervalRef.current) {
      const pollPayout = async () => {
        if (!isCurrent()) return;
        try {
          const tx = useTransactionStore.getState().activeTransaction;
          if (tx) {
            const { status, message } = await checkMomoPayoutStatus(tx.id);
            if (!isCurrent()) return;
            if (status === "SUCCESSFUL" || status === "FAILED") {
              handlePollingResult(status, message);
              return; // stop polling
            }
          }
        } catch (pollErr) {
          console.warn('Payout status poll failed; will retry:', pollErr);
          if (!isCurrent()) return;
        }
        pollingIntervalRef.current = setTimeout(pollPayout, POLLING_INTERVAL_MS);
      };
      pollingIntervalRef.current = setTimeout(pollPayout, POLLING_INTERVAL_MS);
    }

    pollingTimeoutRef.current = setTimeout(() => {
      if (!isCurrent()) return;
      stopPolling();
      if (useTransactionStore.getState().activeTransaction?.currentPhase === AppPhase.VERIFYING_PAYOUT) {
        store.setError(null);
        store.updateTransaction({currentPhase:AppPhase.RECOVERY_REQUIRED, recoveryMessage:'The payout has not been confirmed yet. Check status before trying another cashout.'});
      }
    }, POLLING_TIMEOUT_MS);

  } catch (err: any) {
    store.setError(err.message || "Failed to initiate MoMo payout.");
    store.updateTransaction({currentPhase:AppPhase.RECOVERY_REQUIRED, recoveryMessage:err.message || MOMO_RECOVERY_MESSAGE});
    store.moveToHistory(useTransactionStore.getState().activeTransaction!);
  }
};

