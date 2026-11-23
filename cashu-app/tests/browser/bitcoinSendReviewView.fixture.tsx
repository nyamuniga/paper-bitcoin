import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { balances } from './bitcoinMintPicker.boundaries';
import { reviewFixture } from './bitcoinSendReview.boundaries';

const query = new URLSearchParams(location.search);
const theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.className = theme;
Object.assign(window, { reviewFixture });
localStorage.setItem('mint_info_cache', JSON.stringify(Object.fromEntries(
  Object.keys(balances).map((mint, index) => [mint, { name: `Fixture Mint ${index + 1}`, nuts: {}, _cachedAt: Date.now() }]),
)));
async function mount() {
  const { BitcoinPaymentView } = await import('../../src/features/bitcoin/BitcoinPaymentView');
  function Fixture() {
    const [closes,setCloses] = useState(0);
    const onClose = useCallback(() => setCloses(count => count + 1), []);
    return <div style={{height:'100dvh'}}>
      <output hidden>{closes}</output>
      {/* Retain the legacy view after its redirect to exercise its existing inline review. */}
      <BitcoinPaymentView page={!query.has('legacy')} mintUrl={Object.keys(balances)[0]}
        initialInvoice={'bc1q'+'a'.repeat(38)} initialAmountSats={3000} onClose={onClose} />
    </div>;
  }
  createRoot(document.getElementById('root')!).render(<MemoryRouter><Fixture /></MemoryRouter>);
}
void mount();
