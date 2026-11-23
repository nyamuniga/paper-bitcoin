import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { BitcoinReceiveMode } from '../../src/features/bitcoin/BitcoinReceive';
import '../../src/features/bitcoin/BitcoinPages.css';

const query=new URLSearchParams(location.search), state=query.get('state') || 'entry';
document.documentElement.dataset.theme=query.get('theme')==='light'?'light':'dark';
document.documentElement.className=document.documentElement.dataset.theme;
const mintUrl='https://receive.fixture.invalid';
localStorage.setItem('mint_info_cache',JSON.stringify({[mintUrl]:{name:'Fixture mint',nuts:{},_cachedAt:Date.now()}}));
const fixture={calls:[] as unknown[][],qr:''};
Object.assign(window,{receiveFixture:fixture});

async function mount(){
  const {BitcoinReceive}=await import('../../src/features/bitcoin/BitcoinReceive');
  function Fixture(){
    const [mode,setMode]=useState<BitcoinReceiveMode>(query.get('mode')==='onchain'||state==='address'?'onchain':'lightning');
    const [amount,setAmount]=useState(query.get('amount') ?? (state==='entry'?'':'3000'));
    const [invoice,setInvoice]=useState(state==='invoice'||query.has('also-invoice')?'lnbc1fixture':null);
    const [address,setAddress]=useState(state==='address'||query.has('also-address')?'bc1qfixture':null);
    const [copied,setCopied]=useState(false),[copiedType,setCopiedType]=useState<string|null>(null);
    const amountSats=parseInt(amount)||0;
    const entry=state!=='success'&&!invoice&&!address;
    return <main id="fixture" className={`bitcoin-page ${entry?'bitcoin-receive-entry':''}`} style={{height:'100dvh',display:'flex',flexDirection:'column'}}>
      <div className="bitcoin-body flex flex-col flex-1 overflow-y-auto"><div className="bitcoin-flow flex flex-col gap-4">
        <BitcoinReceive success={state==='success'} invoice={invoice} address={address} mode={mode}
          amount={amount} amountSats={amountSats} mintUrl={mintUrl}
          depositSats={query.get('deposit')==='none'?null:Number(query.get('deposit')??'3500')}
          feeEstimateSats={query.get('fee')==='none'?null:Number(query.get('fee')??'0')}
          copied={copied} copiedType={copiedType} requesting={query.has('requesting')}
          requestDisabled={query.has('disabled')||query.has('requesting')||!amountSats}
          minOnchainSats={2500} maxOnchainSats={100000000}
          onModeChange={value=>{fixture.calls.push(['mode',value]);setMode(value);setAmount('');}}
          onAmountChange={value=>{fixture.calls.push(['amount',value]);setAmount(value);}}
          onRequest={()=>{fixture.calls.push(['request']);}}
          onCopy={(value,type='text')=>{fixture.calls.push(['copy',value,type]);setCopied(true);setCopiedType(type);}}
          onTrackAddress={value=>{fixture.calls.push(['track',value]);}}
          onInvoiceBack={()=>{fixture.calls.push(['invoice-back']);setInvoice(null);}}
          onAddressBack={()=>{fixture.calls.push(['address-back']);setAddress(null);}}
          onDone={()=>{fixture.calls.push(['done']);}} />
      </div></div>
    </main>;
  }
  createRoot(document.getElementById('root')!).render(<Fixture/>);
}
void mount();
