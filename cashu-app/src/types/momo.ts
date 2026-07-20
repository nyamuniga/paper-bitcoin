export type AppTab = "ecash" | "lightning" | "receive" | undefined;

export enum AppPhase {
  IDLE = "IDLE",
  FETCHING_RATE = "FETCHING_RATE",
  INITIATING_PAYMENT = "INITIATING_PAYMENT",
  PENDING_PAYMENT = "PENDING_PAYMENT", 
  VERIFYING_PAYMENT = "VERIFYING_PAYMENT", 
  PAYMENT_FAILED = "PAYMENT_FAILED", 
  FULFILLING = "FULFILLING", 
  PAYING_INVOICE = "PAYING_INVOICE", 
  MINTING = "MINTING", 
  READY_TO_CLAIM = "READY_TO_CLAIM", 
  AWAITING_USER_INVOICE = "AWAITING_USER_INVOICE", 
  SENDING_SATS = "SENDING_SATS", 
  SATS_SENT = "SATS_SENT", 
  GENERATING_INVOICE = "GENERATING_INVOICE", 
  AWAITING_INVOICE_PAYMENT = "AWAITING_INVOICE_PAYMENT", 
  INITIATING_PAYOUT = "INITIATING_PAYOUT", 
  VERIFYING_PAYOUT = "VERIFYING_PAYOUT", 
  PAYOUT_COMPLETE = "PAYOUT_COMPLETE", 
  PAYOUT_FAILED = "PAYOUT_FAILED",
  RETRYABLE_ERROR = "RETRYABLE_ERROR", 
  EXPIRED = "EXPIRED", 
  // On-Chain Specific Phases
  GENERATING_ONCHAIN_INVOICE = "GENERATING_ONCHAIN_INVOICE",
  PAYING_ONCHAIN_INVOICE = "PAYING_ONCHAIN_INVOICE",
  EXECUTING_ONCHAIN_PAYOUT = "EXECUTING_ONCHAIN_PAYOUT",
  ONCHAIN_PAYOUT_FAILED = "ONCHAIN_PAYOUT_FAILED",
  ONCHAIN_PAYOUT_COMPLETE = "ONCHAIN_PAYOUT_COMPLETE",
  // On-Chain Receive Phases
  GENERATING_ONCHAIN_ADDRESS = "GENERATING_ONCHAIN_ADDRESS",
  AWAITING_ONCHAIN_DEPOSIT = "AWAITING_ONCHAIN_DEPOSIT",
  DEPOSIT_CONFIRMED = "DEPOSIT_CONFIRMED",
  GENERATING_MINT_INVOICE = "GENERATING_MINT_INVOICE",
  PAYING_MINT_INVOICE = "PAYING_MINT_INVOICE",
  ISSUING_ECASH = "ISSUING_ECASH",
}

export enum MomoStatus {
  PENDING = "PENDING",
  SUCCESSFUL = "SUCCESSFUL",
  FAILED = "FAILED",
}

export enum FulfillmentStep {
  NONE = "NONE",
  AWAITING_MINT_PAYMENT = "AWAITING_MINT_PAYMENT", 
  AWAITING_MINT_TOKENS = "AWAITING_MINT_TOKENS", 
  AWAITING_FULFILLMENT = "AWAITING_FULFILLMENT", 
  AWAITING_USER_INVOICE = "AWAITING_USER_INVOICE", 
  AWAITING_PAYOUT = "AWAITING_PAYOUT", 
  COMPLETED = "COMPLETED",
}

export type TransactionDirection = "RWF_TO_SATS" | "SATS_TO_RWF" | "ONCHAIN_SEND" | "ONCHAIN_RECEIVE";
export type TransactionStatus = "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";

export interface TransactionDetails {
  id: string;
  direction: TransactionDirection;
  rwfAmount: number;
  satsAmount: number;
  fee: number;
  rate: number;
  invoice: string; 
  momoPhoneNumber: string;
  momoReferenceId: string | null; 
  mintQuoteId: string | null; 
  ecashToken: string | null; 
  paymentHash: string | null; 
  payoutReferenceId: string | null; 
  status?: TransactionStatus; 
  timestamp?: number; 
  fulfillmentStep?: FulfillmentStep; 
  currentPhase?: AppPhase; 
  currentTab?: "ecash" | "lightning" | "receive"; 
  mintUrl?: string;
  onchainAddress?: string;
  txSuccessId?: string;
}
