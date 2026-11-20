import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

const query = new URLSearchParams(window.location.search);
const theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.className = theme;

// Synthetic, unfunded mints. Seed metadata before importing the real hook so it
// renders deterministic names and fallback icons without making remote requests.
const balances = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
  `https://mint-${index + 1}.example.test`, index * 1000,
]));
const mints = Object.keys(balances);
localStorage.setItem('mint_info_cache', JSON.stringify(Object.fromEntries(
  mints.map((url, index) => [url, {
    name: index === 1 ? 'A deliberately long mint name that must fit a narrow picker' : `Fixture Mint ${index + 1}`,
    nuts: {}, _cachedAt: Date.now(),
  }]),
)));

async function mount() {
  const { MintBalancePicker } = await import('../../src/components/shared/MintBalancePicker');

  function MintPickerFixture() {
    const [mintUrl, setMintUrl] = useState(mints[0]);
    const [selectionCount, setSelectionCount] = useState(0);
    return (
      <main style={{ minHeight: '200vh' }}>
        <button id="before-picker">Before picker</button>
        <section id="picker-frame" style={{
          position: 'absolute', left: 16, width: 'min(360px, calc(100% - 32px))',
          top: query.has('bottom') ? 'calc(100vh - 76px)' : 72,
          height: 56, overflow: 'hidden',
        }}>
          <MintBalancePicker mintUrl={mintUrl} balances={balances} disabled={query.has('disabled')}
            onSelect={mint => { setMintUrl(mint); setSelectionCount(count => count + 1); }} />
        </section>
        <output id="selected-mint" style={{ position: 'absolute', top: '120vh' }}>{mintUrl}</output>
        <output id="selection-count" style={{ position: 'absolute', top: '125vh' }}>{selectionCount}</output>
      </main>
    );
  }

  createRoot(document.getElementById('root')!).render(<MintPickerFixture />);
}

void mount();
