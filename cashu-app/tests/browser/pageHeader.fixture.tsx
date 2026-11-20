import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { PageHeader } from '../../src/components/shared/PageHeader';

const query = new URLSearchParams(window.location.search);
const theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.className = theme;

function HeaderFixture() {
  const location = useLocation();
  const [backCalls, setBackCalls] = useState(0);
  return (
    <>
      <div style={{ position: 'fixed', top: 0, height: '4rem', background: 'var(--color-surface)' }}>
        Header fixture
      </div>
      <main className="px-container-padding md:px-10" style={{ paddingTop: '5rem' }}>
        <button id="before-header">Before header</button>
        <PageHeader
          className="fixture-header"
          title="Review Bitcoin send with a long destination"
          subtitle="Check the destination, amount and fees"
          sticky={!query.has('static')}
          hideBack={query.has('hidden')}
          backDisabled={query.has('disabled')}
          onBack={query.has('custom') ? () => setBackCalls(value => value + 1) : undefined}
          rightAction={<button id="header-action">Action</button>}
        >
          <span id="header-detail">Header detail</span>
        </PageHeader>
        <output id="route">{location.pathname}</output>
        <output id="back-calls">{backCalls}</output>
        <div style={{ height: '180vh' }}>Scrollable content</div>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/previous', '/header']} initialIndex={1}>
    <HeaderFixture />
  </MemoryRouter>,
);
