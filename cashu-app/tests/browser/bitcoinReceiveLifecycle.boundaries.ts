import { createElement, useSyncExternalStore } from 'react';

type Record = { mode: string; amount: number; mint: string; resolve: () => void; empty: () => void; reject: () => void };
const listeners=new Set<()=>void>();
let pending=0;
let transactions: {id:string;status:string;amount:number}[]=[];
const emit=()=>listeners.forEach(listener=>listener());
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const fixture={
  requests:[] as Record[],copies:[] as string[],copyWaiters:[] as {resolve:()=>void;reject:()=>void}[],
  deferCopies:false,events:[] as unknown[][],errors:[] as string[],
  history:(id:string,status='Success',amount=3000)=>{transactions=[{id,status,amount}];emit();},
};
function request<T>(mode:string,amount:number,mint:string,result:(index:number)=>T):Promise<T|null>{
  const index=fixture.requests.length;
  pending++;emit();
  return new Promise<T|null>((resolve,reject)=>{
    fixture.requests.push({mode,amount,mint,resolve:()=>resolve(result(index)),empty:()=>resolve(null),reject:()=>reject(new Error('Synthetic request failure'))});
  }).finally(()=>{pending--;emit();});
}
export const receiveLightning=(amount:number,mint:string)=>request('lightning',amount,mint,index=>({quoteId:`quote-${index}`,receiveInvoice:`lnbc1fixture${index}`}));
export const receiveOnChain=(amount:number,mint:string)=>request('onchain',amount,mint,index=>({quoteId:`quote-${index}`,boardingAddress:`bc1qfixture${index}`,amountSats:amount,estimatedFeeSats:0}));
export const writeClipboardText=(text:string)=>{
  fixture.copies.push(text);
  if(!fixture.deferCopies)return Promise.resolve(true);
  return new Promise<boolean>((resolve,reject)=>fixture.copyWaiters.push({resolve:()=>resolve(true),reject:()=>reject(new Error('Synthetic clipboard failure'))}));
};
export const readClipboardText=async()=>'';
export const useBitcoin=()=>({
  paying:false,requesting:useSyncExternalStore(subscribe,()=>pending>0),receiveLightning,receiveOnChain,
  payInvoice:async()=>{throw Error('No send in receive lifecycle fixture');},
  estimateOnChain:async()=>null,executeOnChain:async()=>null,
});
export const useHistory=()=>({transactions:useSyncExternalStore(subscribe,()=>transactions)});
export const useWalletStore=(select:(value:{mintBalances:typeof balances;refreshWallet:()=>Promise<void>})=>unknown)=>select({mintBalances:balances,refreshWallet:async()=>{fixture.events.push(['wallet-refresh']);}});
export const balances={'https://mint-1.example.test':10000,'https://mint-2.example.test':20000};
export const getOnchainSendLimits=async()=>({min_sats:2500,max_sats:100000000});
export const invoke=async(command:string,args:{amount:number;mintUrl:string})=>{
  if(command!=='receive_lightning')throw Error('Native send is outside this fixture');
  return request('lightning',args.amount,args.mintUrl,index=>({quote_id:`quote-${index}`,invoice:`lnbc1fixture${index}`}));
};
export const getDepositAddressSpark=async(amount:number,mint:string)=>request('onchain',amount,mint,index=>({address:`bc1qfixture${index}`,amount_sats:amount,net_receive_sats:amount,estimated_fee_sats:0,quote_id:`quote-${index}`}));
const forbiddenSend=async()=>{throw Error('Native send is outside this fixture');};
export const estimateOnChainSendSpark=forbiddenSend;
export const executeOnChainSendSpark=forbiddenSend;
export const toast={success:(message:string)=>{fixture.events.push(['toast',message]);},error:(message:string)=>{fixture.errors.push(message);}};
export const useLnurlValidation=()=>({status:'idle',params:null});
export const validateLnurlPay=async()=>({params:null,error:'Outside receive fixture'});
export const fetchLnurlPayInvoice=async()=>{throw Error('Outside receive fixture');};
export const Scanner=()=>null;
export const SovereignStampOverlay=({status,title,onDismiss}:{status:string|null;title:string;onDismiss:()=>void})=>status
  ?createElement('div',{'data-fixture-stamp':status},title,createElement('button',{type:'button',onClick:onDismiss},'Dismiss fixture stamp')):null;
