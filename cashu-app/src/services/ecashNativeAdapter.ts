import { invoke } from '@tauri-apps/api/core';

export interface PreparedEcashPayment {
  token: string;
  token_v3?: string;
  tx_id: string;
  mint_url: string;
}

export interface EcashPaymentQuote {
  token_amount: number;
  receiver_fee: number;
  sender_fee: number;
  total: number;
}

export interface SendEcashRequestResult {
  token_v4: string;
  token_v3: string;
  tx_id: string;
}

export async function resumeEcashPayment(request: string): Promise<PreparedEcashPayment | null> {
  return invoke<PreparedEcashPayment | null>('ecash_resume_payment', { request });
}

export async function getEcashPaymentQuote(mintUrl: string, amount: number): Promise<EcashPaymentQuote> {
  return invoke<EcashPaymentQuote>('ecash_payment_quote', { mintUrl, amount });
}

export async function sendEcashRequestPayment(params: {
  mintUrl: string;
  amount: number;
  pubkey?: string;
  paymentRequest: string;
  paymentMaxTotal: number;
}): Promise<SendEcashRequestResult> {
  return invoke<SendEcashRequestResult>('send_ecash', params);
}

export async function validateEcashPayment(token: string, amount: number): Promise<void> {
  await invoke<void>('ecash_validate_payment', { token, amount });
}

export async function saveEcashForLater(tokenString: string): Promise<void> {
  await invoke<void>('save_ecash_for_later', { tokenString });
}
