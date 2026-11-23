import { createRoot } from 'react-dom/client';
import { useBitcoin } from '../../src/hooks/useBitcoin';
import { useBitcoinReceive } from '../../src/features/bitcoin/useBitcoinReceive';
import { fixture, writeClipboardText } from './bitcoinReceiveLifecycle.boundaries';

function Fixture(){
  const bitcoin=useBitcoin('mint-one');
  const receive=useBitcoinReceive({active:true,mintUrl:'mint-one',busy:bitcoin.requesting,limits:null,transactions:[],
    receiveLightning:(amount,mint,onError)=>bitcoin.receiveLightning(amount,mint,{silent:true,onError}),
    receiveOnChain:(amount,mint,onError)=>bitcoin.receiveOnChain(amount,mint,{silent:true,onError}),
    copyText:writeClipboardText,onCopied:()=>{},onCopyError:()=>{},onReset:()=>{},onReceived:()=>{},
    onRequestError:error=>{fixture.errors.push(String(error));},
  });
  Object.assign(window,{adapterFixture:{bitcoin,receive,fixture}});
  return <div id="fixture">{receive.invoice||receive.address||'Entry'}</div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
