import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { balances, fixture } from './bitcoinMintPicker.boundaries';

const query = new URLSearchParams(window.location.search);
const theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.className = theme;
Object.assign(window, { bitcoinFixture: fixture });
localStorage.setItem('mint_info_cache', JSON.stringify(Object.fromEntries(
  Object.keys(balances).map((url, index) => [url, { name: `Fixture Mint ${index + 1}`, nuts: {}, _cachedAt: Date.now() }]),
)));

async function mount() {
  const { BitcoinPaymentView } = await import('../../src/features/bitcoin/BitcoinPaymentView');
  function Screen() {
    const location = useLocation();
    const [closes, setCloses] = useState(0);
    const onClose = useCallback(() => setCloses(count => count + 1), []);
    return <>
      <output id="route">{location.pathname}</output><output id="closes">{closes}</output>
      {/* Keep the legacy view mounted after its redirect only to exercise its compatibility branch. */}
      <BitcoinPaymentView page={!query.has('legacy')} mintUrl={Object.keys(balances)[0]}
        initialTab={query.has('receive') ? 'receive' : 'send'} onClose={onClose}
        initialInvoice={query.has('onchain') ? 'bc1q' + 'a'.repeat(38) : query.has('lnurl') ? 'fixture@example.test' : ''}
        initialAmountSats={query.has('onchain') || query.has('lnurl') ? 3000 : undefined} />
    </>;
  }
  createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/fixture']}><Screen /></MemoryRouter>);
}
void mount();
