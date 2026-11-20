import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { TransferFundsForm } from '../../src/components/home/TransferFundsForm';
import { fixture } from './conversionPrimaryAction.boundaries';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.className = document.documentElement.dataset.theme;
Object.assign(window, {conversionFixture: fixture});
createRoot(document.getElementById('root')!).render(<MemoryRouter>
  <div style={{height: '100dvh'}}><TransferFundsForm
    initialDirection={query.has('to-sats') ? 'toSats' : 'toUsd'}
    mintUrl={query.has('no-mint') ? '' : 'https://mint.example.test'}
    cashuBalance={query.has('zero-balance') ? 0 : 100000}
    stableBalance={query.has('no-balance') ? null : query.has('zero-balance') ? 0n : 100000000n}
    onClose={() => {fixture.closes++;}} onDone={() => {fixture.dones++;}} onChange={() => {fixture.changes++;}}
  /></div>
</MemoryRouter>);
