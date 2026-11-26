/** Stable application codes for send_ecash; messages may change independently. */
export type SendEcashErrorCode =
  | 'INVALID_REQUEST'
  | 'WALLET_LOCKED'
  | 'INSUFFICIENT_FUNDS'
  | 'REVIEW_REQUIRED'
  | 'SERVICE_UNAVAILABLE'
  | 'OUTCOME_UNKNOWN'
  | 'INTERNAL_ERROR';

/** Rejection payload from send_ecash_v2; legacy send_ecash still rejects strings. */
export interface SendEcashError {
  code: SendEcashErrorCode;
  message: string;
  /** Transaction to reconcile, when known; durability is not guaranteed. Null is not a safe retry. */
  tx_id: string | null;
}

/** Successful response shared by send_ecash and send_ecash_v2. */
export interface SendEcashResult {
  token: string;
  token_v3: string;
  token_v4: string;
  tx_id: string;
}

/** Nearest amounts sendable offline from currently held proofs without a mint swap. */
export interface NearestOfflineAmounts {
  lower: number | null;
  higher: number | null;
}
