import { recoveryClock } from './savedMomoRecovery.boundaries';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TransactionProcessor } from '../../src/hooks/useTransactionProcessor';
import { useTransactionStore } from '../../src/store/transactionStore';
import { handleFulfillOrder, startPaymentVerification } from '../../src/services/flowServices';
import { momoTransactionAccess } from '../../src/services/momoTransactionAccess';
import { AppPhase } from '../../src/types/momo';
import { checkMomoPaymentStatus, clock, pollingFixture } from './cashInPolling.boundaries';

useTransactionStore.setState({activeTransaction:null,history:[],error:null});
function Fixture() {
  const [mounted,setMounted] = useState(true);
  const transaction = useTransactionStore(state => state.activeTransaction);
  Object.assign(window,{polling:{clock,recoveryClock,fixture:pollingFixture,unmount:()=>setMounted(false),
    start:(phase=AppPhase.PENDING_PAYMENT)=>useTransactionStore.getState().setActiveTransaction({
      id:'polling-topup',direction:'RWF_TO_SATS',rwfAmount:1000,satsAmount:700,fee:0,rate:0.7,
      invoice:'synthetic-invoice',mintQuoteId:'synthetic-quote',momoPhoneNumber:'0781234567',momoReferenceId:'synthetic-reference',
      ecashToken:null,paymentHash:null,payoutReferenceId:null,invoicePaid:true,status:'PENDING',timestamp:1,currentPhase:phase,mintUrl:'https://mint.example.test',currentTab:'ecash',
    }),
    fulfill:()=>handleFulfillOrder('polling-topup'),
    transactions:momoTransactionAccess,
    verify:(transactionId:string)=>startPaymentVerification({transactionId,transactions:momoTransactionAccess,checkPaymentStatus:checkMomoPaymentStatus,scheduler:clock.scheduler}),
    replace:()=>{
      const store=useTransactionStore.getState();
      if(store.activeTransaction)store.moveToHistory(store.activeTransaction);
      const original=store.activeTransaction;
      if(original)store.setActiveTransaction({...original,id:'other-topup',mintQuoteId:'other-quote',invoice:'other-invoice',currentPhase:AppPhase.VERIFYING_PAYMENT});
      store.setError('Other transfer error');
    },
    remove:(id:string)=>useTransactionStore.setState(state=>({
      activeTransaction:state.activeTransaction?.id===id?null:state.activeTransaction,
      history:state.history.filter(transaction=>transaction.id!==id),
    })),
    snapshot:()=>({transaction:useTransactionStore.getState().activeTransaction,history:useTransactionStore.getState().history,error:useTransactionStore.getState().error}),
  }});
  return <main id="fixture">{mounted&&<TransactionProcessor/>}<p>{transaction?.currentPhase??'idle'}</p></main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
