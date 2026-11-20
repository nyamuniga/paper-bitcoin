import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SendBitcoinPage, ReceiveBitcoinPage } from '../../src/pages/Bitcoin';
import { useAddressBookStore } from '../../src/store/addressBookStore';
import { balances, fixture } from './bitcoinMintPicker.boundaries';
import { pageFixture } from './bitcoinPageLayout.boundaries';

const query = new URLSearchParams(location.search);
const receive = query.has('receive');
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.className = document.documentElement.dataset.theme;
Object.assign(window, { bitcoinFixture: fixture, pageFixture });
localStorage.setItem('mint_info_cache', JSON.stringify(Object.fromEntries(
  Object.keys(balances).map((url, index) => [url, { name: `Fixture Mint ${index + 1}`, nuts: {}, _cachedAt: Date.now() }]),
)));
useAddressBookStore.setState({ contacts: [] });
// Supply the route's history-availability check without changing Chrome's own history.
Object.defineProperty(history, 'state', { get: () => ({ idx: query.has('history') ? 1 : 0 }) });

function Fixture() {
  const location = useLocation();
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header id="fixture-navigation" style={{ flex: 'none', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div style={{ height: 64, padding: 16 }}>Fixture navigation</div>
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Routes>
          <Route path="/send-bitcoin" element={<SendBitcoinPage />} />
          <Route path="/receive-bitcoin" element={<ReceiveBitcoinPage />} />
          <Route path="/" element={<p>Fixture wallet</p>} />
          <Route path="/previous" element={<p>Previous fixture page</p>} />
          <Route path="/mints" element={<p>Fixture mint management</p>} />
        </Routes>
      </div>
      <output id="route" hidden>{location.pathname}</output>
    </div>
  );
}

const state = {
  mintUrl: Object.keys(balances)[0],
  invoice: query.has('onchain') ? 'bc1q' + 'a'.repeat(38) : undefined,
  amountSats: query.has('onchain') ? 3000 : undefined,
};
createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/previous', { pathname: receive ? '/receive-bitcoin' : '/send-bitcoin', state }]} initialIndex={1}>
    <Fixture />
  </MemoryRouter>,
);
