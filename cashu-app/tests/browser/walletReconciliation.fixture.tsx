import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TransactionProcessor } from '../../src/hooks/useTransactionProcessor';
import { useTransactionStore } from '../../src/store/transactionStore';
import { checkHistoryTransactionStatus } from '../../src/services/walletReconciliationAdapter';
import { backendClock, reconciliationFixture } from './walletReconciliation.boundaries';

useTransactionStore.setState({activeTransaction:null,history:[],error:null});
function Fixture(){
  const [mounted,setMounted]=useState(true);
  Object.assign(window,{reconciliation:{clock:backendClock,fixture:reconciliationFixture,
    unmount:()=>setMounted(false),mount:()=>setMounted(true),
    manual:(id:string)=>{void checkHistoryTransactionStatus(id,reconciliationFixture.transactions.find(transaction=>transaction.id===id))
      .then(status=>reconciliationFixture.manualResults.push({id,status})).catch(error=>reconciliationFixture.errors.push(String(error)));},
  }});
  return <main id="fixture">{mounted&&<TransactionProcessor/>}</main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
