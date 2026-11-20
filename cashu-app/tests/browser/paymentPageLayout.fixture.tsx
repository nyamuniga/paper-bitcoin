import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { PaymentPageLayout } from '../../src/components/shared/PaymentPageLayout';
import { PageHeader } from '../../src/components/shared/PageHeader';
import { PrimaryActionButton } from '../../src/components/shared/PrimaryActionButton';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.className = document.documentElement.dataset.theme;

function Fixture() {
  const [value, setValue] = useState('');
  const [submissions, setSubmissions] = useState(0);
  const [backs, setBacks] = useState(0);
  const [error, setError] = useState(false);
  const [footerShown, setFooterShown] = useState(!query.has('no-footer'));
  const header = (
    <PageHeader
      title="Review details"
      subtitle="Check the information before continuing"
      sticky={false}
      onBack={() => setBacks(count => count + 1)}
      backDisabled={query.has('loading')}
    />
  );
  const footer = (
    <PrimaryActionButton
      id="continue"
      type="submit"
      form="fixture-form"
      loading={query.has('loading')}
      disabled={query.has('disabled')}
    >
      Continue
    </PrimaryActionButton>
  );
  return (
    <div id="frame" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header id="navigation" style={{ flex: 'none', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div style={{ height: 64, padding: 16 }}>Fixture navigation</div>
      </header>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <PaymentPageLayout
          id="layout"
          className="fixture-layout"
          bodyClassName="fixture-body"
          aria-label="Review page"
          bodyLabel="Review information"
          header={header}
          footer={footerShown ? footer : null}
        >
          <form id="fixture-form" onSubmit={event => { event.preventDefault(); setSubmissions(count => count + 1); }}>
            <label htmlFor="first-input" className="block mb-2">Description</label>
            <input id="first-input" className="w-full p-2 mb-4 bg-surface-container text-on-surface" value={value} onChange={event => setValue(event.target.value)} />
            {query.has('empty') ? <p>No details to review.</p> : (
              <>
                <p className="break-all mb-4">{'A long caller-owned detail. '.repeat(12)}</p>
                {Array.from({ length: 24 }, (_, index) => <p className="py-2" key={index}>Review item {index + 1}</p>)}
                <label htmlFor="last-input" className="block mb-2">Final note</label>
                <input id="last-input" className="w-full p-2 bg-surface-container text-on-surface" />
              </>
            )}
            {error && <p role="alert">Caller-owned error message.</p>}
            <button type="button" id="toggle-error" onClick={() => setError(shown => !shown)}>Toggle error</button>
            <button type="button" id="toggle-footer" onClick={() => setFooterShown(shown => !shown)}>Toggle footer</button>
          </form>
        </PaymentPageLayout>
      </div>
      <output hidden id="fixture-state">{JSON.stringify({ value, submissions, backs })}</output>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<MemoryRouter><Fixture /></MemoryRouter>);
