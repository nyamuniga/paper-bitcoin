import { backendClock } from './backendPollingClock.boundaries';
import type { ReconciliationTransaction } from '../../src/services/walletReconciliation';
export { backendClock };
export const timeoutScheduler = backendClock.scheduler;
const listeners = new Set<(event: {type: string}) => void>();
export const reconciliationFixture = {
  transactions: [{id:'lightning',status:'Pending',mint_url:'https://mint.example.test',tx_type:{ReceiveLightning:{}}}] as ReconciliationTransaction[],
  checks: [] as {id: string; resolve: (status: ReconciliationTransaction['status']) => void; reject: () => void}[],
  spark: [] as {mint: string | undefined; resolve: (swept: boolean) => void; reject: () => void}[],
  manualResults: [] as {id: string; status: string}[], errors: [] as string[], native: [] as string[], refreshes: 0,
  subscriptions: 0, unsubscriptions: 0,
  emit: (type: string) => listeners.forEach(listener=>listener({type})),
};
export const invoke = async (command: string, args?: {txId: string}) => {
  reconciliationFixture.native.push(command);
  if(command==='get_transactions')return reconciliationFixture.transactions.map(transaction=>({...transaction}));
  if(command==='check_transaction_status'){
    const id=args?.txId;
    if(!id)throw new Error('The synthetic status check needs an ID');
    return new Promise<ReconciliationTransaction['status']>((resolve,reject)=>{
    reconciliationFixture.checks.push({id,resolve:status=>{
      const transaction=reconciliationFixture.transactions.find(transaction=>transaction.id===id);
      if(transaction)transaction.status=status;
      resolve(status);
    },reject:()=>reject(new Error('Synthetic native status failure'))});
    });
  }
  throw new Error('Payment submission is outside this fixture');
};
export const syncAndSweepSpark = (mint?: string) => new Promise<boolean>((resolve,reject)=>{
  reconciliationFixture.spark.push({mint,resolve,reject:()=>reject(new Error('Synthetic Spark failure'))});
});
export const subscribeToSparkEvents = (listener: (event: {type: string}) => void) => {
  reconciliationFixture.subscriptions++;listeners.add(listener);
  return ()=>{reconciliationFixture.unsubscriptions++;listeners.delete(listener);};
};
const wallet={refreshWallet:async()=>{reconciliationFixture.refreshes++;}};
export const useWalletStore=Object.assign((select:(value:typeof wallet)=>unknown)=>select(wallet),{getState:()=>wallet});
const forbidden=async()=>{throw new Error('Funding is outside this fixture');};
export const payLightningInvoice=forbidden, createLightningInvoice=forbidden, initiateMomoPaymentRequest=forbidden,
  initiateMomoPayout=forbidden, checkMomoPaymentStatus=forbidden, checkMomoPayoutStatus=forbidden, fetch=forbidden;
export const useAddressBookStore={getState:()=>({recordSuccessfulUse:()=>{}})};
export const EXCHANGE_RATE_API_URL='https://rate.example.test';
export const SATS_PER_BTC=100000000,SPREAD=0.021,MOMO_WITHDRAWAL_FIXED_FEE=120,ECASH_LIGHTNING_FEE=10,RWF_USD_PEG=1400,POLLING_INTERVAL_MS=5000,POLLING_TIMEOUT_MS=120000;
