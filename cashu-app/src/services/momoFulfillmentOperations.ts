import { invoke } from '@tauri-apps/api/core';
import { payLightningInvoice } from './lightningService';
import { withDeadline } from './proxyRequest';
import type { MomoFulfillmentOperations } from './momoFulfillment';

export const momoFulfillmentOperations: MomoFulfillmentOperations = {
  payInvoice: payLightningInvoice,
  checkMintStatus: quoteId => withDeadline(
    () => invoke<string>('check_transaction_status', { txId: quoteId }),
    20000,
  ),
  wait: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  now: () => Date.now(),
};
