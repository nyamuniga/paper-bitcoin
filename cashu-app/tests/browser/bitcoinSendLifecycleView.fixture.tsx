import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { balances } from './bitcoinMintPicker.boundaries';
import { sendFixture } from './bitcoinSendLifecycle.boundaries';
const query=new URLSearchParams(location.search);
localStorage.setItem('mint_info_cache',JSON.stringify(Object.fromEntries(Object.keys(balances).map((mint,index)=>[mint,{name:`Fixture Mint ${index+1}`,nuts:{},_cachedAt:Date.now()}]))));
Object.assign(window,{sendFixture});
async function mount(){
  const {BitcoinPaymentView}=await import('../../src/features/bitcoin/BitcoinPaymentView');
  function Fixture(){
    const [shown,setShown]=useState(true);
    const onClose=useCallback(()=>setShown(false),[]);
    Object.assign(window,{navigateAway:()=>setShown(false)});
    return <div id="fixture">{shown?<BitcoinPaymentView page mintUrl={Object.keys(balances)[0]}
      initialInvoice={query.has('lnurl')?'fixture@example.test':'bc1q'+'a'.repeat(38)} initialAmountSats={3000} onClose={onClose}/>:<p>Other route</p>}</div>;
  }
  createRoot(document.getElementById('root')!).render(<MemoryRouter><Fixture/></MemoryRouter>);
}
void mount();
