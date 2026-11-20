import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { BitcoinPaymentView } from '../../src/features/bitcoin/BitcoinPaymentView';
import { useAddressBookStore } from '../../src/store/addressBookStore';
import { balances, fixture } from './bitcoinMintPicker.boundaries';
import { destinationFixture } from './bitcoinDestinationField.boundaries';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.className = document.documentElement.dataset.theme;
Object.assign(window,{bitcoinFixture:fixture,destinationFixture});
localStorage.setItem('mint_info_cache',JSON.stringify(Object.fromEntries(Object.keys(balances).map((mint,index)=>[
  mint,{name:`Fixture Mint ${index+1}`,nuts:{},_cachedAt:Date.now()},
]))));
useAddressBookStore.setState({contacts:[]});
useAddressBookStore.getState().addContact({name:'Fixture Bitcoin contact',type:'lightning',value:'fixture@example.test'});
useAddressBookStore.getState().addContact({name:'Fixture phone contact',type:'momo',value:'0791234567'});

function Fixture() {
  const [closes,setCloses]=useState(0);
  const onClose=useCallback(()=>setCloses(count=>count+1),[]);
  return <div style={{height:'100dvh'}}>
    <output id="closes" hidden>{closes}</output>
    {/* Retain the legacy compatibility branch after its redirect, as in the existing picker fixture. */}
    <BitcoinPaymentView page={!query.has('legacy')} mintUrl={Object.keys(balances)[0]} onClose={onClose} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/fixture']}><Fixture /></MemoryRouter>);
