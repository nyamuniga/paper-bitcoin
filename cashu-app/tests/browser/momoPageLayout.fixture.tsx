import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { MomoTransferView } from '../../src/features/momo/MomoTransferView';
import { useAddressBookStore } from '../../src/store/addressBookStore';
import { balances, momoPageFixture } from './momoPageLayout.boundaries';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.className = document.documentElement.dataset.theme;
localStorage.setItem('mint_info_cache', JSON.stringify(Object.fromEntries(
  Object.keys(balances).map((url, index) => [url, { name: `Fixture Mint ${index + 1}`, nuts: {}, _cachedAt: Date.now() }]),
)));
useAddressBookStore.setState({ contacts: [] });
useAddressBookStore.getState().addContact({ name: 'Fixture phone contact', type: 'momo', value: '0791234567' });
Object.assign(window, { momoPageFixture });

createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header id="fixture-navigation" style={{ flex: 'none', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div style={{ height: 64, padding: 16 }}>Fixture navigation</div>
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <MomoTransferView
          page={!query.has('legacy')}
          initialTab={query.has('cashout') ? 'send' : 'receive'}
          mintUrl={Object.keys(balances)[0]}
          onClose={() => { momoPageFixture.closes++; }}
        />
      </div>
    </div>
  </MemoryRouter>,
);
