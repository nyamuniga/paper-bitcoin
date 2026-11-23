import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BitcoinDestinationEntry, type BitcoinDestinationEntryProps } from '../../src/features/bitcoin/BitcoinDestinationEntry';
import { useAddressBookStore } from '../../src/store/addressBookStore';

useAddressBookStore.setState({contacts:[]});
useAddressBookStore.getState().addContact({name:'Entry fixture contact',type:'lightning',value:'entry@example.test'});
const events: unknown[][] = [];
const initial = {
  page:true, value:'', scannerVisible:false,
  parsedInput:{type:'invalid',addressOrInvoice:'',amountSats:null},
  lnurlValidation:{status:'idle',params:null,domain:null,error:null},
  insufficientBalance:false, lnurlInput:false, lnurlBlocked:false,
  paying:false, fetchingInvoice:false, minOnchainSats:3500,
} satisfies Partial<BitcoinDestinationEntryProps>;
function Fixture() {
  const [state,setState] = useState<Omit<BitcoinDestinationEntryProps,'scanner'|'onChange'|'onOpenScanner'|'onCloseScanner'|'onOpenAddressBook'|'onPaste'|'onPayInvoice'|'onNext'>>(initial);
  const change = (value:string) => { events.push(['change',value]);setState(previous=>({...previous,value})); };
  Object.assign(window,{destinationEntryFixture:{events,setProps:(patch:Partial<typeof state>)=>setState(previous=>({...previous,...patch}))}});
  return <main id="fixture" className="bitcoin-page"><BitcoinDestinationEntry {...state}
    scanner={<button id="supplied-scanner">Supplied scanner content</button>}
    onChange={change} onOpenScanner={()=>events.push(['scan-open'])} onCloseScanner={()=>events.push(['scan-close'])}
    onOpenAddressBook={()=>events.push(['address-book'])} onPaste={()=>events.push(['paste'])}
    onPayInvoice={()=>events.push(['pay'])} onNext={()=>events.push(['next'])}
  /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
