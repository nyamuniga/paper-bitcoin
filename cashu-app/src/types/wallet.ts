/** Serialized WalletInfo returned by the native wallet_info command. */
export interface WalletInfoResponse {
  is_initialized: boolean;
  balance_sats: number;
  mnemonic: string | null;
  mint_balances: Record<string, number>;
}

/** Fields read by wallet refresh from each native get_transactions entry. */
export interface WalletTransactionSummary {
  id: string;
  status: 'Pending' | 'Success' | 'Failed' | 'FailedMintError';
  /** Unix timestamp in seconds. */
  timestamp: number;
}
