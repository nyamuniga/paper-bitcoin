import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { fixture, balances } from './bitcoinReceiveLifecycle.boundaries';

const query=new URLSearchParams(location.search);
localStorage.setItem('mint_info_cache',JSON.stringify(Object.fromEntries(Object.keys(balances).map((url,index)=>[url,{name:`Fixture Mint ${index+1}`,nuts:{},_cachedAt:Date.now()}]))));
Object.assign(window,{receiveLifecycleFixture:fixture});
async function mount(){
  const {BitcoinPaymentView}=await import('../../src/features/bitcoin/BitcoinPaymentView');
  function Host(){
    const [shown,setShown]=useState(true);
    Object.assign(window,{navigateAway:()=>setShown(false)});
    return <div id="fixture">{shown?<BitcoinPaymentView page={!query.has('legacy')} initialTab="receive" mintUrl={Object.keys(balances)[0]} onClose={()=>{if(!query.has('legacy'))setShown(false);}}/>:<p>Other route</p>}</div>;
  }
  createRoot(document.getElementById('root')!).render(<MemoryRouter><Host/></MemoryRouter>);
}
void mount();
