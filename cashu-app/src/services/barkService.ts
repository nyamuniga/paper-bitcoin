import { invoke } from '@tauri-apps/api/core';

export interface BarkBoardingResponse {
  address: string;
}

export const initBarkWallet = async (): Promise<void> => {
  try {
    await invoke('init_bark_wallet');
  } catch (error) {
    console.error("Failed to init Bark wallet:", error);
    throw error;
  }
};

export const getBarkBoardingAddress = async (): Promise<BarkBoardingResponse> => {
  try {
    return await invoke<BarkBoardingResponse>('bark_get_boarding_address');
  } catch (error) {
    console.error("Failed to get boarding address:", error);
    throw error;
  }
};

export const syncBarkVutxos = async (): Promise<void> => {
  try {
    await invoke('bark_sync_vutxos');
  } catch (error) {
    console.error("Failed to sync vUTXOs:", error);
    throw error;
  }
};

export const sendOnChainBark = async (address: string, amountSats: number): Promise<string> => {
  try {
    return await invoke<string>('bark_send_onchain', { address, amountSats });
  } catch (error) {
    console.error("Failed to send onchain via Bark:", error);
    throw error;
  }
};

export const getBarkBalance = async (): Promise<number> => {
  try {
    return await invoke<number>('bark_get_balance');
  } catch (error) {
    console.error("Failed to get Bark balance:", error);
    throw error;
  }
};

export const payLightningInvoiceBark = async (invoice: string): Promise<string> => {
  try {
    return await invoke<string>('bark_pay_lightning_invoice', { invoice });
  } catch (error) {
    console.error("Failed to pay Lightning invoice via Bark:", error);
    throw error;
  }
};

export interface OnchainSendEstimate {
  amount: number;
  ark_fee: number;
  cashu_fee: number;
  total_cost: number;
  bridging_invoice: string;
}

export const estimateOnChainSendBark = async (address: string, amountSats: number, mintUrl: string): Promise<OnchainSendEstimate> => {
  try {
    return await invoke<OnchainSendEstimate>('bark_estimate_onchain_send', { address, amountSats, mintUrl });
  } catch (error) {
    console.error("Failed to estimate on-chain send via Bark:", error);
    throw error;
  }
};

export const executeOnChainSendBark = async (bridgingInvoice: string, address: string, amountSats: number, mintUrl: string): Promise<string> => {
  try {
    return await invoke<string>('bark_execute_onchain_send', { bridgingInvoice, address, amountSats, mintUrl });
  } catch (error) {
    console.error("Failed to execute on-chain send via Bark:", error);
    throw error;
  }
};
