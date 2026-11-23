import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { BitcoinSendReviewProps } from '../../src/features/bitcoin/BitcoinSendReview';

const mintUrl='https://review.example.test';
localStorage.setItem('mint_info_cache',JSON.stringify({[mintUrl]:{name:'Review Fixture Mint',nuts:{},_cachedAt:Date.now()}}));
const events:string[]=[];
async function mount(){
  const {BitcoinSendReview,BitcoinSendConfirmation}=await import('../../src/features/bitcoin/BitcoinSendReview');
function Fixture(){
  const [state,setState]=useState<Omit<BitcoinSendReviewProps,'confirmation'|'onBack'>>({
    page:false,mintUrl,destination:'bc1q'+'a'.repeat(70),amountSats:3210,networkFeeSats:17,mintFeeSats:5,totalSats:9999,
  });
  const [paying,setPaying]=useState(false);
  Object.assign(window,{sendReviewFixture:{events,setPaying,setProps:(patch:Partial<typeof state>)=>setState(previous=>({...previous,...patch}))}});
  const confirmation=<BitcoinSendConfirmation paying={paying} onConfirm={()=>events.push('confirm')}/>;
  return <main id="fixture" className="bitcoin-page">
    <BitcoinSendReview {...state} onBack={()=>events.push('back')} confirmation={confirmation}/>
    {state.page&&<div className="bitcoin-actions">{confirmation}</div>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

}
void mount();
