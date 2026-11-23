import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useBitcoinReceive } from '../../src/features/bitcoin/useBitcoinReceive';
import { fixture, receiveLightning, receiveOnChain, writeClipboardText } from './bitcoinReceiveLifecycle.boundaries';

function Host(){
  const [mounted,setMounted]=useState(true),[active,setActive]=useState(true),[mint,setMint]=useState('mint-one'),[busy,setBusy]=useState(false);
  const [transactions,setTransactions]=useState<{id:string;status:string;amount:number}[]>([]);
  Object.assign(window,{lifecycleHost:{setActive,setMint,setBusy,unmount:()=>setMounted(false),history:(id:string,status='Success')=>setTransactions([{id,status,amount:9000}])}});
  return <div id="fixture">{mounted?<Consumer active={active} mint={mint} busy={busy} transactions={transactions}/>:<p>Closed</p>}</div>;
}
// Keep the hook owner stable across context changes, just like a mounted route.
function Consumer({active,mint,busy,transactions}:{active:boolean;mint:string;busy:boolean;transactions:{id:string;status:string;amount:number}[]}){
  const receive=useBitcoinReceive({active,mintUrl:mint,busy,limits:null,transactions,receiveLightning,receiveOnChain,copyText:writeClipboardText,
    onCopied:type=>{fixture.events.push(['copied',type]);},onCopyError:()=>{fixture.events.push(['copy-error']);},
    onRequestError:()=>{fixture.events.push(['request-error']);},onReceived:amount=>{fixture.events.push(['received',amount]);},onReset:()=>{},
  });
  Object.assign(window,{lifecycle:{actions:receive,fixture,snapshot:()=>({mode:receive.mode,amount:receive.amount,invoice:receive.invoice,address:receive.address,quoteId:receive.quoteId,deposit:receive.depositSats,fee:receive.feeEstimateSats,requesting:receive.requesting,disabled:receive.requestDisabled,success:receive.success,copied:receive.copied,copiedType:receive.copiedType})}});
  return <output>{receive.invoice||receive.address||'Entry'}</output>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Host/></StrictMode>);
