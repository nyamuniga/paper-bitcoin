import { createRoot } from 'react-dom/client';
import { useBitcoin } from '../../src/hooks/useBitcoin';
import { useBitcoinSend } from '../../src/features/bitcoin/useBitcoinSend';
import { sendFixture, readClipboardText, resolveLnurl, fetchInvoice } from './bitcoinSendLifecycle.boundaries';
function Fixture(){
  const bitcoin=useBitcoin('mint-one');
  const send=useBitcoinSend({active:true,mintUrl:'mint-one',availableBalance:10000,busy:bitcoin.paying||bitcoin.requesting,
    limits:null,initialInvoice:'bc1q'+'a'.repeat(38),initialAmountSats:3000,
    readClipboard:readClipboardText,readValidation:()=>null,resolveLnurl,fetchInvoice,
    payInvoice:(invoice,mint,onError)=>bitcoin.payInvoice(invoice,mint,{silent:true,onError}),
    estimate:(address,amount,mint,onError)=>bitcoin.estimateOnChain(address,amount,mint,{silent:true,onError}),
    execute:(quote,address,mint,onError)=>bitcoin.executeOnChain(quote,address,mint,{silent:true,onError}),
    onError:message=>sendFixture.errors.push(message),recordSuccessfulUse:(type,value)=>{sendFixture.uses.push([type,value]);},
  });
  Object.assign(window,{sendAdapter:{bitcoin,send,fixture:sendFixture}});
  return <div id="fixture">{send.payment.status??send.step}</div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
