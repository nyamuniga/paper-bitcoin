import { createElement } from 'react';
import type { OnchainSendEstimate } from '../../src/services/sparkService';
import type { LnurlPayParams } from '../../src/services/lnurlService';
export * from './bitcoinDestinationField.boundaries';

type Deferred<T> = { args: unknown[]; resolve: (value?: T) => void; reject: () => void; empty: () => void };
const deferred = <T,>(list: Deferred<T>[], args: unknown[], value: T): Promise<T | null> => new Promise((resolve,reject) => {
  list.push({args,resolve:result=>resolve(result??value),empty:()=>resolve(null),reject:()=>reject(new Error('Synthetic send failure'))});
});
export const params: LnurlPayParams = {callback:'https://lnurl.example.test',minSendable:1000,maxSendable:100000000,metadata:'[]',tag:'payRequest'};
export const sendFixture = {
  pastes:[] as Deferred<string>[], estimates:[] as Deferred<OnchainSendEstimate>[], executions:[] as Deferred<{txid:string}>[],
  resolutions:[] as Deferred<{params:LnurlPayParams;error:null}>[], invoices:[] as Deferred<{pr:string}>[],
  payments:[] as Deferred<boolean>[], refreshes:0, throwContact:false, errors:[] as string[], uses:[] as unknown[][],
};
export const estimate = (address:string,amount:number,mint:string) => deferred(sendFixture.estimates,[address,amount,mint],{
  amount,ark_fee:17,cashu_fee:5,total_cost:amount+22,bridging_invoice:'synthetic-send-only',
});
export const execute = (quote:OnchainSendEstimate,address:string,mint:string) => deferred(sendFixture.executions,[quote,address,mint],{txid:'synthetic-txid'});
export const resolveLnurl = () => deferred(sendFixture.resolutions,[],{params,error:null});
export const fetchInvoice = (callback:string,amount:number) => deferred(sendFixture.invoices,[callback,amount],{pr:'lnbc1synthetic'});
export const pay = (invoice:string,mint:string) => deferred(sendFixture.payments,[invoice,mint],true).then(value=>value??false);
export const useLnurlValidation = (input:string|null) => ({status:input?'valid':'idle',params:input?params:null,domain:'example.test',error:null});
export const validateLnurlPay = resolveLnurl;
export const fetchLnurlPayInvoice = fetchInvoice;
export const toast = {error:(message:string)=>sendFixture.errors.push(message),success:()=>{}};
export const useBitcoin = (mint:string) => ({
  paying:false,requesting:false,estimateOnChain:(address:string,amount:number,override=mint)=>estimate(address,amount,override),
  executeOnChain:(quote:OnchainSendEstimate,address:string,override=mint)=>execute(quote,address,override),
  payInvoice:(invoice:string,override=mint)=>pay(invoice,override),
  receiveLightning:async()=>null,receiveOnChain:async()=>null,
});
export const SovereignStampOverlay = ({status,errorMessage,onRetry,onDismiss}:{status:string|null;errorMessage:string;onRetry?:()=>void;onDismiss:()=>void}) => status
  ?createElement('div',{'data-send-status':status},errorMessage,createElement('button',{onClick:onRetry},'Retry fixture payment'),createElement('button',{onClick:onDismiss},'Dismiss fixture payment')):null;

export const useWalletStore = (select: (value: {mintBalances:typeof balances;refreshWallet:()=>Promise<void>})=>unknown) => select({
  mintBalances:balances,refreshWallet:async()=>{sendFixture.refreshes++;},
});
const balances={'https://mint-1.example.test':10000,'https://mint-2.example.test':20000};
export const invoke = (command:string,args:{invoice:string;mintUrl:string}) => {
  if(command!=='pay_invoice')throw new Error('Outside send fixture');
  return pay(args.invoice,args.mintUrl);
};
export const estimateOnChainSendSpark = estimate;
export const executeOnChainSendSpark = (invoice:string,address:string,amount:number,mint:string,fee:number) =>
  deferred(sendFixture.executions,[invoice,address,amount,mint,fee],{txid:'synthetic-txid'}).then(result=>result?.txid??'');
export const getDepositAddressSpark = async () => {throw new Error('Outside send fixture');};

export const readClipboardText = () => deferred(sendFixture.pastes,[],'  fixture@example.test  ');
