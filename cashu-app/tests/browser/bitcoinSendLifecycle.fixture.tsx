import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useBitcoinSend } from '../../src/features/bitcoin/useBitcoinSend';
import type { LnurlValidationResult } from '../../src/hooks/useLnurlValidation';
import { sendFixture, readClipboardText, estimate, execute, pay, resolveLnurl, fetchInvoice, params } from './bitcoinSendLifecycle.boundaries';
const query=new URLSearchParams(location.search);
function Consumer({active,mint,busy,balance,validation}:{active:boolean;mint:string;busy:boolean;balance:number;validation:LnurlValidationResult}){
  const send=useBitcoinSend({active,mintUrl:mint,busy,availableBalance:balance,limits:{min_sats:2500,max_sats:100000000},
    initialInvoice:query.has('onchain')?'bc1q'+'a'.repeat(38):query.has('lnurl')?'fixture@example.test':'lnbc30u1fixture',initialAmountSats:3000,
    readClipboard:readClipboardText,readValidation:destination=>destination===send.destination?validation:null,resolveLnurl,fetchInvoice,payInvoice:pay,estimate,execute,
    onError:message=>sendFixture.errors.push(message),recordSuccessfulUse:(type,value)=>{if(sendFixture.throwContact)throw new Error("Synthetic contact failure");sendFixture.uses.push([type,value]);},
  });
  Object.assign(window,{sendLifecycle:{actions:send,fixture:sendFixture,snapshot:()=>({
    destination:send.destination,amount:send.amount,step:send.step,estimate:send.estimate,payment:send.payment,
    fetching:send.fetching,estimating:send.estimating,paying:send.paying,
  })}});
  return <p>{send.step}</p>;
}
function Host(){
  const [active,setActive]=useState(true),[mint,setMint]=useState('mint-one'),[busy,setBusy]=useState(false),[balance,setBalance]=useState(10000),[mounted,setMounted]=useState(true);
  const [validation,setValidation]=useState<LnurlValidationResult>({status:'valid',params,domain:'example.test',error:null});
  Object.assign(window,{sendHost:{setActive,setMint,setBusy,setBalance,setValidation,unmount:()=>setMounted(false)}});
  return <div id="fixture">{mounted&&<Consumer active={active} mint={mint} busy={busy} balance={balance} validation={validation}/>}</div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Host/></StrictMode>);
