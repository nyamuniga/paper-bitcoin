import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { balances, fixture, previewMint, previewToken } from './ecashMintPicker.boundaries';

const query = new URLSearchParams(window.location.search);
const theme = query.get('theme') === 'light' ? 'light' : 'dark';
let initialToken: string | undefined;
if (query.has('invalid-token')) initialToken = 'not-a-token';
else if (query.has('preview')) initialToken = previewToken;
document.documentElement.dataset.theme = theme;
document.documentElement.className = theme;
Object.assign(window, { ecashFixture: fixture });
localStorage.setItem('mint_info_cache', JSON.stringify(Object.fromEntries(
  [...new Set([...Object.keys(balances).map(url => url.replace(/\/$/, '')), previewMint])].map((url, index) => [url, {
    name: `Fixture Mint ${index + 1}`, nuts: {}, _cachedAt: Date.now(),
  }]),
)));

async function mount() {
  const { EcashModal } = await import('../../src/components/home/EcashModal');
  function Screen() {
    const location = useLocation();
    const [closes, setCloses] = useState(0);
    const onClose = useCallback(() => setCloses(count => count + 1), []);
    return <>
      <output id="route" hidden>{location.pathname}</output><output id="closes" hidden>{closes}</output>
      <main style={{ height: '100dvh' }}>
        {/* Keep the legacy view mounted after redirect only to check its compatibility branch. */}
        <EcashModal page={!query.has('legacy')} mintUrl={Object.keys(balances)[0]} onClose={onClose}
          initialTab={query.has('receive') ? 'receive' : 'send'}
          initialToken={initialToken} />
      </main>
    </>;
  }
  createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/fixture']}><Screen /></MemoryRouter>);
}
void mount();
