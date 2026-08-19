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
