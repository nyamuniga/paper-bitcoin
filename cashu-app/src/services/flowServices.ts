import {
  initiateMomoPaymentRequest,
  checkMomoPaymentStatus,
  initiateMomoPayout,
  checkMomoPayoutStatus
} from "./momoService";
import {
  payLightningInvoice,
  createLightningInvoice
} from "./lightningService";
import {
  AppPhase,
  MomoStatus,
  FulfillmentStep,
  AppTab
} from "../types/momo";
import { invoke } from '@tauri-apps/api/core';
import { fetch } from '@tauri-apps/plugin-http';

import {
  EXCHANGE_RATE_API_URL,
  SATS_PER_BTC,
  SPREAD,
  RWF_USD_PEG,
  POLLING_INTERVAL_MS,
  POLLING_TIMEOUT_MS,
  TX_FEE_PERCENTAGE,
  MOMO_API_BASE_URL
} from "../constants.local";
import { useTransactionStore } from "../store/transactionStore";
import { useWalletStore } from "../store/wallet";

export const fetchCurrentRate = async (): Promise<number> => {
  const response = await fetch(EXCHANGE_RATE_API_URL);
  if (!response.ok) throw new Error("Failed to fetch exchange rate.");
  const data = await response.json();
  const btcPriceInUsdRaw = data?.USD?.last;
  if (!btcPriceInUsdRaw) throw new Error("Could not retrieve a valid USD/BTC exchange rate.");

  const btcPriceInUsd = btcPriceInUsdRaw * (1 + SPREAD);
  const btcPriceInRwf = btcPriceInUsd * RWF_USD_PEG;
  return SATS_PER_BTC / btcPriceInRwf;
};

export const fetchProxyBlinkBalance = async (): Promise<number> => {
  try {
    const response = await fetch(`${MOMO_API_BASE_URL}/payment/balance`);
    if (!response.ok) return 0;
    const data = await response.json();

    const wallets = data?.data?.me?.defaultAccount?.wallets || [];
    const btcWallet = wallets.find((w: any) => w.walletCurrency === 'BTC');

    return btcWallet ? btcWallet.balance : 0;
  } catch (error) {
    console.error("Failed to fetch proxy blink balance", error);
    return 0;
  }
};

export const calculateQuote = async (
  rwfAmount: string,
  momoPhoneNumber: string,
  activeTab: AppTab,
  mintUrl: string
) => {
  const store = useTransactionStore.getState();
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
    currentTab: activeTab,
    mintUrl: mintUrl
  });

  try {
    const rwfToSatsRate = await fetchCurrentRate();

    const feeRwf = Math.ceil(amount * TX_FEE_PERCENTAGE);
    const totalRwfToPay = amount + feeRwf;

    store.updateTransactionPhase(AppPhase.INITIATING_PAYMENT);

    const netSats = Math.floor(amount * rwfToSatsRate);

    let invoice = "";
    let quoteId = "";
    try {
      const res: any = await invoke('receive_lightning', { mintUrl, amount: netSats });
      invoice = res.invoice as string;
      quoteId = res.quote_id as string;
    } catch (e: any) {
      throw new Error(`Failed to create lightning invoice: ${e}`);
    }

    const momoResponse = await initiateMomoPaymentRequest(
      txId,
      netSats,
      activeTab || 'ecash',
      totalRwfToPay,
      momoPhoneNumber,
    );
    if (!momoResponse.success || !momoResponse.referenceId) {
      throw new Error(momoResponse.message || "Failed to initiate Momo payment.");
    }

    store.updateTransaction({
      rwfAmount: totalRwfToPay,
      satsAmount: netSats,
      fee: feeRwf,
      rate: rwfToSatsRate,
      invoice: invoice,
      momoReferenceId: momoResponse.referenceId,
      mintQuoteId: quoteId,
      currentPhase: AppPhase.PENDING_PAYMENT,
    });
  } catch (err: any) {
    console.error("Quote error:", err);
    const errorMessage = typeof err === 'string' ? err : (err?.message || "Failed to fetch quote. Please try again.");
    store.setError(errorMessage);
    store.updateTransactionPhase(AppPhase.IDLE);
  }
};

export const handleFulfillOrder = async () => {
  const store = useTransactionStore.getState();
  let currentTx = store.activeTransaction;
  if (!currentTx) return;

  try {
    store.updateTransactionPhase(AppPhase.PAYING_INVOICE);

    const { success, message } = await payLightningInvoice(currentTx.invoice!);
    if (!success) throw new Error(message || "Gateway failed to pay the Lightning invoice.");

    store.updateTransactionPhase(AppPhase.FULFILLING);

    let mintSuccess = false;
    let mintErrMessage = "";

    for (let i = 0; i < 15; i++) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const status = await invoke<string>('check_transaction_status', { txId: currentTx.mintQuoteId });
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

    store.updateTransaction({
      fulfillmentStep: FulfillmentStep.COMPLETED,
      status: "COMPLETED",
      timestamp: Date.now(),
      currentPhase: AppPhase.READY_TO_CLAIM
    });

    currentTx = useTransactionStore.getState().activeTransaction!;
    store.moveToHistory(currentTx);
    useWalletStore.getState().refreshWallet();
  } catch (err: any) {
    console.error("Fulfillment error:", err);
    store.setError(err.message || "Failed to fulfill order. Please try again.");
    store.updateTransaction({ currentPhase: AppPhase.RETRYABLE_ERROR });
  }
};

export const startPaymentVerification = async (
  stopPolling: () => void,
  pollingIntervalRef: React.MutableRefObject<any>,
  pollingTimeoutRef: React.MutableRefObject<any>
) => {
  const store = useTransactionStore.getState();
  const transaction = store.activeTransaction;
  if (!transaction?.momoReferenceId) return;

  stopPolling();
  store.updateTransactionPhase(AppPhase.VERIFYING_PAYMENT);

  const handlePollingResult = (status: MomoStatus, message?: string) => {
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
    if (res.status === "SUCCESSFUL" || res.status === "FAILED") {
      handlePollingResult(res.status, res.message);
      return;
    }

    if (!pollingIntervalRef.current) {
      const pollMomo = async () => {
        const tx = useTransactionStore.getState().activeTransaction;
        if (tx?.momoReferenceId) {
          const { status, message } = await checkMomoPaymentStatus(tx.id);
          if (status === "SUCCESSFUL" || status === "FAILED") {
            handlePollingResult(status, message);
            return; // stop polling
          }
        }
        pollingIntervalRef.current = setTimeout(pollMomo, POLLING_INTERVAL_MS);
      };
      pollingIntervalRef.current = setTimeout(pollMomo, POLLING_INTERVAL_MS);
    }
  } catch (e) {
    store.setError("Failed to check Momo payment status initially. Please retry.");
    store.updateTransactionPhase(AppPhase.RETRYABLE_ERROR);
  }

  pollingTimeoutRef.current = setTimeout(() => {
    stopPolling();
    if (useTransactionStore.getState().activeTransaction?.currentPhase === AppPhase.VERIFYING_PAYMENT) {
      store.setError("Payment verification timed out. Please try again.");
      store.updateTransactionPhase(AppPhase.PAYMENT_FAILED);
    }
  }, POLLING_TIMEOUT_MS);
};

export const calculateSendQuote = async (
  rwfAmount: string,
  momoPhoneNumber: string,
  activeTab: AppTab,
  mintUrl: string
) => {
  const store = useTransactionStore.getState();
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
    currentTab: activeTab,
    mintUrl: mintUrl
  });

  try {
    const rwfToSatsRate = await fetchCurrentRate();

    const feeRwf = Math.ceil(amount * 0.03);
    const totalRwfNeeded = amount + feeRwf;

    const netSats = Math.floor(totalRwfNeeded * rwfToSatsRate);

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
    store.updateTransactionPhase(AppPhase.IDLE);
  }
};

export const executeSendPayment = async () => {
  const store = useTransactionStore.getState();
  let currentTx = store.activeTransaction;
  if (!currentTx) return;

  try {
    store.updateTransactionPhase(AppPhase.PAYING_INVOICE);

    try {
      if (currentTx.mintUrl) {
        await invoke('pay_invoice', { invoice: currentTx.invoice!, mintUrl: currentTx.mintUrl });
      } else {
        await invoke('pay_invoice', { invoice: currentTx.invoice! });
      }
    } catch (e: any) {
      throw new Error(`Failed to pay invoice from wallet: ${e}`);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    store.updateTransaction({
      currentPhase: AppPhase.INITIATING_PAYOUT
    });

  } catch (err: any) {
    console.error("Payment error:", err);
    store.setError(err.message || "Failed to pay invoice. Please try again.");
    store.updateTransaction({ currentPhase: AppPhase.RETRYABLE_ERROR });
  }
};

export const initiateAndVerifyPayout = async (
  stopPolling: () => void,
  pollingIntervalRef: React.MutableRefObject<any>,
  pollingTimeoutRef: React.MutableRefObject<any>
) => {
  const store = useTransactionStore.getState();
  const transaction = store.activeTransaction;
  if (!transaction) return;

  stopPolling();
  store.updateTransactionPhase(AppPhase.INITIATING_PAYOUT);

  try {
    // Check if payout was already initiated
    let referenceId = transaction.payoutReferenceId;

    if (!referenceId) {
      const payoutRes = await initiateMomoPayout(
        transaction.id,
        transaction.rwfAmount,
        transaction.satsAmount,
        transaction.momoPhoneNumber
      );

      if (!payoutRes.success || !payoutRes.referenceId) {
        throw new Error(payoutRes.message || "Failed to initiate MoMo payout.");
      }
      referenceId = payoutRes.referenceId;

      store.updateTransaction({
        payoutReferenceId: referenceId,
        currentPhase: AppPhase.VERIFYING_PAYOUT
      });
    } else {
      store.updateTransactionPhase(AppPhase.VERIFYING_PAYOUT);
    }

    const handlePollingResult = (status: MomoStatus, message?: string) => {
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
      } else if (status === "FAILED") {
        store.setError(message || "MoMo payout failed or was rejected.");
        store.updateTransaction({
          status: "FAILED",
          timestamp: Date.now(),
          currentPhase: AppPhase.PAYMENT_FAILED
        });
        store.moveToHistory(useTransactionStore.getState().activeTransaction!);
      }
    };

    if (!pollingIntervalRef.current) {
      const pollPayout = async () => {
        const tx = useTransactionStore.getState().activeTransaction;
        if (tx) {
          const { status, message } = await checkMomoPayoutStatus(tx.id);
          if (status === "SUCCESSFUL" || status === "FAILED") {
            handlePollingResult(status, message);
            return; // stop polling
          }
        }
        pollingIntervalRef.current = setTimeout(pollPayout, POLLING_INTERVAL_MS);
      };
      pollingIntervalRef.current = setTimeout(pollPayout, POLLING_INTERVAL_MS);
    }

    pollingTimeoutRef.current = setTimeout(() => {
      stopPolling();
      if (useTransactionStore.getState().activeTransaction?.currentPhase === AppPhase.VERIFYING_PAYOUT) {
        store.setError("Payout verification timed out. It might still complete later.");
        store.updateTransactionPhase(AppPhase.PAYMENT_FAILED);
      }
    }, POLLING_TIMEOUT_MS);

  } catch (err: any) {
    store.setError(err.message || "Failed to initiate MoMo payout.");
    store.updateTransactionPhase(AppPhase.RETRYABLE_ERROR);
  }
};
