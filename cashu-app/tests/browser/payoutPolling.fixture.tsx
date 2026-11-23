import { recoveryClock } from './savedMomoRecovery.boundaries';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TransactionProcessor } from '../../src/hooks/useTransactionProcessor';
import { useTransactionStore } from '../../src/store/transactionStore';
import { startPayoutVerification } from '../../src/services/flowServices';
import { startPayoutInitiation } from '../../src/services/payoutInitiation';
import { momoTransactionAccess } from '../../src/services/momoTransactionAccess';
import { AppPhase } from '../../src/types/momo';
import { checkMomoPayoutStatus, initiateMomoPayout, clock, payoutFixture } from './payoutPolling.boundaries';

useTransactionStore.setState({activeTransaction:null,history:[],error:null});
function Fixture() {
  const [mounted,setMounted] = useState(true);
  const transaction = useTransactionStore(state => state.activeTransaction);
  Object.assign(window,{payout:{clock,recoveryClock,fixture:payoutFixture,unmount:()=>setMounted(false),mount:()=>setMounted(true),
    start:(phase=AppPhase.VERIFYING_PAYOUT)=>useTransactionStore.getState().setActiveTransaction({
      id:'polling-payout',direction:'SATS_TO_RWF',rwfAmount:1000,satsAmount:700,fee:0,rate:0.7,
      invoice:'synthetic-invoice',mintQuoteId:'synthetic-quote',momoPhoneNumber:'0781234567',momoReferenceId:'synthetic-reference',
      ecashToken:null,paymentHash:null,payoutReferenceId:'synthetic-payout-reference',momoSubmission:'accepted',invoicePaid:true,status:'PENDING',timestamp:1,currentPhase:phase,mintUrl:'https://mint.example.test',currentTab:'ecash',
    }),
    initiate:()=>{
      const store=useTransactionStore.getState();
      if(store.activeTransaction)store.updateTransaction({payoutReferenceId:null,momoSubmission:'not_started',currentPhase:AppPhase.INITIATING_PAYOUT});
    },
    begin:()=>startPayoutInitiation({transactionId:'polling-payout',transactions:momoTransactionAccess,submitPayout:initiateMomoPayout}),
    failIntentPersistence:()=>{
      const original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(key==='cashu-transaction-storage'){
          const transaction=JSON.parse(value).state?.activeTransaction;
          if(transaction?.momoSubmission==='submitting' && transaction.currentPhase===AppPhase.INITIATING_PAYOUT)throw new Error('Synthetic intent persistence failure');
        }
        original.call(this,key,value);
      };
    },
    retryPhase:()=>useTransactionStore.getState().updateTransaction({currentPhase:AppPhase.INITIATING_PAYOUT}),
    verify:(transactionId:string)=>startPayoutVerification({transactionId,transactions:momoTransactionAccess,checkPayoutStatus:checkMomoPayoutStatus,scheduler:clock.scheduler}),
    replace:()=>{
      const store=useTransactionStore.getState();
      if(store.activeTransaction)store.moveToHistory(store.activeTransaction);
      const original=store.activeTransaction;
      if(original)store.setActiveTransaction({...original,id:'other-payout',mintQuoteId:'other-quote',invoice:'other-invoice',currentPhase:AppPhase.VERIFYING_PAYOUT});
      store.setError('Other transfer error');
    },
    snapshot:()=>({transaction:useTransactionStore.getState().activeTransaction,history:useTransactionStore.getState().history,error:useTransactionStore.getState().error}),
  }});
  return <main id="fixture">{mounted&&<TransactionProcessor/>}<p>{transaction?.currentPhase??'idle'}</p></main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
