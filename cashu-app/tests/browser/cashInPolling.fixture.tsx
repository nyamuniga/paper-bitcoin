import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TransactionProcessor } from '../../src/hooks/useTransactionProcessor';
import { useTransactionStore } from '../../src/store/transactionStore';
import { AppPhase } from '../../src/types/momo';
import { clock, pollingFixture } from './cashInPolling.boundaries';

useTransactionStore.setState({activeTransaction:null,history:[],error:null});
function Fixture() {
  const [mounted,setMounted] = useState(true);
  const transaction = useTransactionStore(state => state.activeTransaction);
  Object.assign(window,{polling:{clock,fixture:pollingFixture,unmount:()=>setMounted(false),
    start:(phase=AppPhase.PENDING_PAYMENT)=>useTransactionStore.getState().setActiveTransaction({
      id:'polling-topup',direction:'RWF_TO_SATS',rwfAmount:1000,satsAmount:700,fee:0,rate:0.7,
      invoice:'synthetic-invoice',mintQuoteId:'synthetic-quote',momoPhoneNumber:'0781234567',momoReferenceId:'synthetic-reference',
      ecashToken:null,paymentHash:null,payoutReferenceId:null,invoicePaid:true,status:'PENDING',timestamp:1,currentPhase:phase,mintUrl:'https://mint.example.test',currentTab:'ecash',
    }),
    snapshot:()=>({transaction:useTransactionStore.getState().activeTransaction,error:useTransactionStore.getState().error}),
  }});
  return <main id="fixture">{mounted&&<TransactionProcessor/>}<p>{transaction?.currentPhase??'idle'}</p></main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
