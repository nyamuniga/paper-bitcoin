import { invoke } from '@tauri-apps/api/core';

export interface OnchainSendEstimate {
  amount: number;
  ark_fee: number; // FixedFloat swap fee
  cashu_fee: number;
  total_cost: number;
  bridging_invoice: string;
  order_id?: string;
  order_token?: string;
}

export interface FixedFloatDepositResponse {
  address: string;
  amount_sats: number;
  quote_id: string;
  order_id: string;
  order_token: string;
}

export interface OnchainLimits {
  min_sats: number;
  max_sats: number;
}

let cachedLimits: { data: OnchainLimits; timestamp: number } | null = null;

export const getOnchainSendLimits = async (): Promise<OnchainLimits> => {
  // Cache for 60 seconds to avoid hitting API repeatedly
  if (cachedLimits && Date.now() - cachedLimits.timestamp < 60_000) {
    return cachedLimits.data;
  }
  try {
    const limits = await invoke<OnchainLimits>('fixedfloat_get_limits');
    cachedLimits = { data: limits, timestamp: Date.now() };
    return limits;
  } catch (error) {
    console.warn('Failed to fetch on-chain limits from FixedFloat, using standard defaults:', error);
    return { min_sats: 12_500, max_sats: 150_000_000 };
  }
};

export const getCredentialsStatus = async (): Promise<boolean> => {
  try {
    return await invoke<boolean>('fixedfloat_get_credentials_status');
  } catch {
    return false;
  }
};

export const setCredentials = async (key: string, secret: string): Promise<void> => {
  await invoke('fixedfloat_set_credentials', { key, secret });
};

export const fixedFloatIsSending = async (): Promise<boolean> => {
  try {
    return await invoke<boolean>('fixedfloat_is_sending');
  } catch {
    return false;
  }
};

export const estimateOnChainSendFixedFloat = async (
  address: string,
  amountSats: number,
  mintUrl: string
): Promise<OnchainSendEstimate> => {
  try {
    return await invoke<OnchainSendEstimate>('fixedfloat_estimate_onchain_send', {
      address,
      amountSats,
      mintUrl,
    });
  } catch (error) {
    console.error('Failed to estimate on-chain send via FixedFloat:', error);
    throw error;
  }
};

export const executeOnChainSendFixedFloat = async (
  bridgingInvoice: string,
  address: string,
  amountSats: number,
  mintUrl: string,
  orderId?: string,
  orderToken?: string
): Promise<string> => {
  try {
    return await invoke<string>('fixedfloat_execute_onchain_send', {
      bridgingInvoice,
      address,
      amountSats,
      mintUrl,
      orderId: orderId ?? null,
      orderToken: orderToken ?? null,
    });
  } catch (error) {
    console.error('Failed to execute on-chain send via FixedFloat:', error);
    throw error;
  }
};

export const getDepositAddressFixedFloat = async (
  amountSats: number,
  mintUrl: string
): Promise<FixedFloatDepositResponse> => {
  try {
    return await invoke<FixedFloatDepositResponse>('fixedfloat_get_deposit_address', {
      amountSats,
      mintUrl,
    });
  } catch (error) {
    console.error('Failed to get deposit address via FixedFloat:', error);
    throw error;
  }
};
