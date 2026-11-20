import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ScanNoteForm } from '../../src/components/scan/ScanNoteForm';
import { BitcoinPaymentView } from '../../src/features/bitcoin/BitcoinPaymentView';
import { MintInfoModal } from '../../src/components/home/MintInfoModal';
import { TransactionDetailsModal } from '../../src/components/history/TransactionDetailsModal';
import { useAddressBookStore } from '../../src/store/addressBookStore';
import { callerFixture, mintUrl, token } from './iconButtonCallers.boundaries';
import { fixture as bitcoinFixture } from './bitcoinMintPicker.boundaries';
import '../../src/pages/Scan.css';

const query = new URLSearchParams(location.search);
const view = query.get('view') || 'scan';
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.className = document.documentElement.dataset.theme;
Object.assign(window, {callerFixture, bitcoinFixture});
useAddressBookStore.setState({contacts: []});
useAddressBookStore.getState().addContact({name: 'Fixture Bitcoin contact', type: 'lightning', value: 'fixture@example.test'});
useAddressBookStore.getState().addContact({name: 'Fixture phone contact', type: 'momo', value: '0781234567'});

function Fixture() {
  const [input, setInput] = useState('');
  const [show, setShow] = useState(true);
  const onClose = () => {callerFixture.closes++;setShow(false);};
  const kind = query.get('kind');
  const txType = kind === 'onchain' ? {SendOnchain: {txid: 'fixture-chain-id', address: 'bc1qfixture-address', ark_fee: 1, cashu_fee: 1}}
    : kind === 'quote' || kind === 'invoice' ? {Mint: {quote_id: kind === 'invoice' ? 'lnbc1fixture-invoice' : 'fixture-quote-id'}}
    : kind === 'request' ? {EcashRequest: {id: 'fixture-request-id', status: 'pending'}}
    : {Send: {token_string: token}};
  return <>
    <output id="input-value" hidden>{input}</output>
    {show && (view === 'scan' ? <main className="scan-page"><div className="scan-content scan-entry">
      <ScanNoteForm showScanner={false} setShowScanner={() => {}} binB64={input} setBinB64={setInput}
        onDecode={() => {callerFixture.forbidden++;}} loading={false} error={null} />
    </div></main> : view === 'bitcoin' ? <div style={{height: '100dvh'}}>
      <BitcoinPaymentView page mintUrl={mintUrl} onClose={onClose} />
    </div> : view === 'mint' ? <MintInfoModal mintUrl={mintUrl} onClose={onClose} />
    : <TransactionDetailsModal tx={{id: 'fixture-transaction-id', tx_type: txType, status: 'Success',
      timestamp: 1800000000, amount: 100, fee: 0, mint_url: mintUrl}} onClose={onClose} />)}
  </>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter><Fixture /></MemoryRouter>);
