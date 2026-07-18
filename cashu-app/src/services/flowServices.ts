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
  TransactionDetails,
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
  TX_FEE_PERCENTAGE
} from "../constants.local";

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

export const calculateQuote = async (
  rwfAmount: string,
  momoPhoneNumber: string,
  activeTab: AppTab,
  mintUrl: string,
  setPhase: (phase: AppPhase) => void,
  setError: (error: string) => void,
  setTransaction: (tx: TransactionDetails | null) => void,
  setHistory: React.Dispatch<React.SetStateAction<TransactionDetails[]>>
) => {
  const amount = parseFloat(rwfAmount);
  if (isNaN(amount) || amount < 100) {
    throw new Error("Minimum amount is 100 RWF.");
  }
  if (amount > 200000) {
    throw new Error("Maximum amount is 200,000 RWF.");
  }
  if (!/^07[89]\d{7}$/.test(momoPhoneNumber)) {
    throw new Error("Phone number must start with 078 or 079 and be exactly 10 digits.");
  }

  setPhase(AppPhase.FETCHING_RATE);

  try {
    const rwfToSatsRate = await fetchCurrentRate();

    const feeRwf = Math.ceil(amount * TX_FEE_PERCENTAGE);
    const totalRwfToPay = amount + feeRwf;
    const txId = `tx_${Date.now()}`;

    setPhase(AppPhase.INITIATING_PAYMENT);

    const netSats = Math.floor(amount * rwfToSatsRate);

    // 1. Generate lightning invoice using Tauri backend
    let invoice = "";
    let quoteId = "";
    try {
      const res: any = await invoke('receive_lightning', { mintUrl, amount: netSats });
      invoice = res.invoice as string;
      quoteId = res.quote_id as string;
    } catch (e: any) {
      throw new Error(`Failed to create lightning invoice: ${e}`);
    }

    // 2. Initiate MoMo payment
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

    const newTransaction: TransactionDetails = {
      id: txId,
      direction: "RWF_TO_SATS",
      rwfAmount: totalRwfToPay,
      satsAmount: netSats,
      fee: feeRwf,
      rate: rwfToSatsRate,
      invoice: invoice,
      momoPhoneNumber,
      momoReferenceId: momoResponse.referenceId,
      mintQuoteId: quoteId,
      ecashToken: null,
      paymentHash: null,
      payoutReferenceId: null,
      status: "PENDING",
      timestamp: Date.now(),
      currentPhase: AppPhase.PENDING_PAYMENT,
      currentTab: activeTab,
    };

    setTransaction(newTransaction);
    setHistory(prev => [newTransaction, ...prev]);
    setPhase(AppPhase.PENDING_PAYMENT);
  } catch (err: any) {
    console.error("Quote error:", err);
    const errorMessage = typeof err === 'string' ? err : (err?.message || "Failed to fetch quote. Please try again.");
    setError(errorMessage);
    setPhase(AppPhase.IDLE);
  }
};

export const handleFulfillOrder = async (
  tx: TransactionDetails,
  activeTab: AppTab,
  setPhase: (phase: AppPhase) => void,
  setTransaction: (tx: TransactionDetails | null) => void,
  setHistory: React.Dispatch<React.SetStateAction<TransactionDetails[]>>,
  setError: (error: string) => void
) => {
  let currentTx = { ...tx };
  try {
    setPhase(AppPhase.PAYING_INVOICE);

    // Ask Gateway to pay the generated Lightning invoice
    const { success, message } = await payLightningInvoice(currentTx.invoice!);
    if (!success) throw new Error(message || "Gateway failed to pay the Lightning invoice.");

    setPhase(AppPhase.FULFILLING);

    // Now that the invoice is paid, we MUST tell the Tauri wallet to mint the ecash!
    let mintSuccess = false;
    let mintErrMessage = "";

    for (let i = 0; i < 3; i++) {
      try {
        // Wait 2 seconds before asking the mint to give it time to sync with the Lightning node
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Use check_transaction_status because it handles ReceiveLightning transactions and actually mints the tokens!
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

    currentTx = {
      ...currentTx,
      fulfillmentStep: FulfillmentStep.COMPLETED,
      status: "COMPLETED" as const,
      timestamp: Date.now(),
      currentPhase: AppPhase.READY_TO_CLAIM,
      currentTab: activeTab,
    };

    setHistory((prev) => [
      { ...currentTx },
      ...prev.filter((t) => t.id !== currentTx.id),
    ]);
    setTransaction(currentTx);
    setPhase(AppPhase.READY_TO_CLAIM);

  } catch (err: any) {
    console.error("Fulfillment error:", err);
    setError(err.message || "Failed to fulfill order. Please try again.");
    setPhase(AppPhase.RETRYABLE_ERROR);
    setTransaction(
      tx ? { ...tx, currentPhase: AppPhase.RETRYABLE_ERROR, currentTab: activeTab } : null
    );
  }
};

export const startPaymentVerification = async (
  transaction: TransactionDetails | null,
  activeTab: AppTab,
  setPhase: (phase: AppPhase) => void,
  setTransaction: (tx: TransactionDetails | null) => void,
  setHistory: React.Dispatch<React.SetStateAction<TransactionDetails[]>>,
  setError: (error: string) => void,
  stopPolling: () => void,
  pollingIntervalRef: React.MutableRefObject<any>,
  pollingTimeoutRef: React.MutableRefObject<any>
) => {
  if (!transaction?.momoReferenceId) return;

  stopPolling();
  setPhase(AppPhase.VERIFYING_PAYMENT);

  const handlePollingResult = (status: MomoStatus, message?: string) => {
    stopPolling();

    if (status === "SUCCESSFUL") {
      if (transaction) {
        const txWithFulfillment = {
          ...transaction,
          fulfillmentStep: FulfillmentStep.AWAITING_FULFILLMENT,
          currentPhase: AppPhase.VERIFYING_PAYMENT,
          currentTab: activeTab,
        };
        setTransaction(txWithFulfillment);
        handleFulfillOrder(txWithFulfillment, activeTab, setPhase, setTransaction, setHistory, setError);
      }
    } else if (status === "FAILED") {
      setError(message || "Your payment failed or was rejected.");
      const failedTx = transaction ? {
        ...transaction,
        status: "FAILED" as const,
        timestamp: Date.now(),
        currentPhase: AppPhase.PAYMENT_FAILED,
        currentTab: activeTab,
      } : null;
      if (failedTx) setHistory((prev: any) => [failedTx, ...prev.filter((t: any) => t.id !== failedTx.id)]);
      setPhase(AppPhase.PAYMENT_FAILED);
    }
  };

  try {
    const res = await checkMomoPaymentStatus(transaction.id);
    if (res.status === "SUCCESSFUL" || res.status === "FAILED") {
      handlePollingResult(res.status, res.message);
      return;
    }

    if (!pollingIntervalRef.current) {
      pollingIntervalRef.current = setInterval(async () => {
        if (transaction?.momoReferenceId) {
          const { status, message } = await checkMomoPaymentStatus(transaction.id);
          if (status === "SUCCESSFUL" || status === "FAILED") {
            handlePollingResult(status, message);
          }
        }
      }, POLLING_INTERVAL_MS);
    }
  } catch (e) {
    setError("Failed to check Momo payment status initially. Please retry.");
    setPhase(AppPhase.RETRYABLE_ERROR);
  }

  pollingTimeoutRef.current = setTimeout(() => {
    stopPolling();
    if (transaction?.currentPhase === AppPhase.VERIFYING_PAYMENT) {
      setError("Payment verification timed out. Please try again.");
      setPhase(AppPhase.PAYMENT_FAILED);
    }
  }, POLLING_TIMEOUT_MS);
};

export const calculateSendQuote = async (
  rwfAmount: string,
  momoPhoneNumber: string,
  activeTab: AppTab,
  _mintUrl: string,
  setPhase: (phase: AppPhase) => void,
  setError: (error: string) => void,
  setTransaction: (tx: TransactionDetails | null) => void,
  setHistory: React.Dispatch<React.SetStateAction<TransactionDetails[]>>
) => {
  const amount = parseFloat(rwfAmount);
  if (isNaN(amount) || amount < 100) {
    throw new Error("Minimum amount is 100 RWF.");
  }
  if (amount > 200000) {
    throw new Error("Maximum amount is 200,000 RWF.");
  }
  if (!/^07[89]\d{7}$/.test(momoPhoneNumber)) {
    throw new Error("Phone number must start with 078 or 079 and be exactly 10 digits.");
  }

  setPhase(AppPhase.GENERATING_INVOICE);

  try {
    const rwfToSatsRate = await fetchCurrentRate();

    // Gateway fee calculation (assume 3%)
    const feeRwf = Math.ceil(amount * 0.03);
    const totalRwfNeeded = amount + feeRwf;

    const netSats = Math.floor(totalRwfNeeded * rwfToSatsRate);
    const txId = `tx_${Date.now()}`;

    // Generate an invoice from the proxy gateway for netSats
    const { paymentRequest, paymentHash } = await createLightningInvoice(netSats);

    const newTransaction: TransactionDetails = {
      id: txId,
      direction: "SATS_TO_RWF",
      rwfAmount: amount, // The user receives `amount`
      satsAmount: netSats, // We pay `netSats`
      fee: feeRwf,
      rate: rwfToSatsRate,
      invoice: paymentRequest,
      momoPhoneNumber,
      momoReferenceId: null,
      mintQuoteId: null,
      ecashToken: null,
      paymentHash: paymentHash,
      payoutReferenceId: null,
      status: "PENDING",
      timestamp: Date.now(),
      currentPhase: AppPhase.AWAITING_INVOICE_PAYMENT,
      currentTab: activeTab,
    };

    setTransaction(newTransaction);
    setHistory(prev => [newTransaction, ...prev]);
    setPhase(AppPhase.AWAITING_INVOICE_PAYMENT);
  } catch (err: any) {
    console.error("Quote error:", err);
    const errorMessage = typeof err === 'string' ? err : (err?.message || "Failed to fetch quote. Please try again.");
    setError(errorMessage);
    setPhase(AppPhase.IDLE);
  }
};

export const executeSendPayment = async (
  transaction: TransactionDetails,
  mintUrl: string,
  activeTab: AppTab,
  setPhase: (phase: AppPhase) => void,
  setTransaction: (tx: TransactionDetails | null) => void,
  setHistory: React.Dispatch<React.SetStateAction<TransactionDetails[]>>,
  setError: (error: string) => void
) => {
  let currentTx = { ...transaction };
  try {
    setPhase(AppPhase.PAYING_INVOICE);

    try {
      if (mintUrl) {
        await invoke('pay_invoice', { invoice: currentTx.invoice!, mintUrl });
      } else {
        await invoke('pay_invoice', { invoice: currentTx.invoice! });
      }
    } catch (e: any) {
      throw new Error(`Failed to pay invoice from wallet: ${e}`);
    }

    // Wait briefly for gateway to detect payment
    await new Promise(resolve => setTimeout(resolve, 3000));

    currentTx = {
      ...currentTx,
      currentPhase: AppPhase.INITIATING_PAYOUT,
      currentTab: activeTab,
    };

    setTransaction(currentTx);
    setHistory((prev) => [{ ...currentTx }, ...prev.filter((t) => t.id !== currentTx.id)]);
    setPhase(AppPhase.INITIATING_PAYOUT);

  } catch (err: any) {
    console.error("Payment error:", err);
    setError(err.message || "Failed to pay invoice. Please try again.");
    setPhase(AppPhase.RETRYABLE_ERROR);
    setTransaction({ ...currentTx, currentPhase: AppPhase.RETRYABLE_ERROR, currentTab: activeTab });
  }
};

export const initiateAndVerifyPayout = async (
  transaction: TransactionDetails | null,
  activeTab: AppTab,
  setPhase: (phase: AppPhase) => void,
  setTransaction: (tx: TransactionDetails | null) => void,
  setHistory: React.Dispatch<React.SetStateAction<TransactionDetails[]>>,
  setError: (error: string) => void,
  stopPolling: () => void,
  pollingIntervalRef: React.MutableRefObject<any>,
  pollingTimeoutRef: React.MutableRefObject<any>
) => {
  if (!transaction) return;

  stopPolling();
  setPhase(AppPhase.INITIATING_PAYOUT);

  try {
    const payoutRes = await initiateMomoPayout(
      transaction.id,
      transaction.rwfAmount,
      transaction.satsAmount,
      transaction.momoPhoneNumber
    );

    if (!payoutRes.success || !payoutRes.referenceId) {
      throw new Error(payoutRes.message || "Failed to initiate MoMo payout.");
    }

    let currentTx = {
      ...transaction,
      payoutReferenceId: payoutRes.referenceId,
      currentPhase: AppPhase.VERIFYING_PAYOUT,
      currentTab: activeTab,
    };

    setTransaction(currentTx);
    setHistory(prev => [{ ...currentTx }, ...prev.filter(t => t.id !== currentTx.id)]);
    setPhase(AppPhase.VERIFYING_PAYOUT);

    const handlePollingResult = (status: MomoStatus, message?: string) => {
      stopPolling();

      if (status === "SUCCESSFUL") {
        currentTx = {
          ...currentTx,
          status: "COMPLETED",
          fulfillmentStep: FulfillmentStep.COMPLETED,
          timestamp: Date.now(),
          currentPhase: AppPhase.READY_TO_CLAIM, // Uses READY_TO_CLAIM for success screen
          currentTab: activeTab,
        };
        setTransaction(currentTx);
        setHistory((prev) => [{ ...currentTx }, ...prev.filter((t) => t.id !== currentTx.id)]);
        setPhase(AppPhase.READY_TO_CLAIM);
      } else if (status === "FAILED") {
        setError(message || "MoMo payout failed or was rejected.");
        currentTx = {
          ...currentTx,
          status: "FAILED",
          timestamp: Date.now(),
          currentPhase: AppPhase.PAYMENT_FAILED,
          currentTab: activeTab,
        };
        setTransaction(currentTx);
        setHistory((prev) => [{ ...currentTx }, ...prev.filter((t) => t.id !== currentTx.id)]);
        setPhase(AppPhase.PAYMENT_FAILED);
      }
    };

    if (!pollingIntervalRef.current) {
      pollingIntervalRef.current = setInterval(async () => {
        const { status, message } = await checkMomoPayoutStatus(currentTx.id);
        if (status === "SUCCESSFUL" || status === "FAILED") {
          handlePollingResult(status, message);
        }
      }, POLLING_INTERVAL_MS);
    }

    pollingTimeoutRef.current = setTimeout(() => {
      stopPolling();
      if (currentTx.currentPhase === AppPhase.VERIFYING_PAYOUT) {
        setError("Payout verification timed out. It might still complete later.");
        setPhase(AppPhase.PAYMENT_FAILED);
      }
    }, POLLING_TIMEOUT_MS);

  } catch (err: any) {
    setError(err.message || "Failed to initiate MoMo payout.");
    setPhase(AppPhase.RETRYABLE_ERROR);
    setTransaction({ ...transaction, currentPhase: AppPhase.RETRYABLE_ERROR, currentTab: activeTab });
  }
};
