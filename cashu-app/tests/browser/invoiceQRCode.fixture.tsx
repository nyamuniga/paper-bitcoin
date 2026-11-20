import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { InvoicePaymentPending } from '../../src/components/issue/InvoicePaymentPending';
import { invoiceFixture } from './invoiceQRCode.boundaries';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.className = document.documentElement.dataset.theme;

const payloads = {
  first: 'lnbc1fixture-only-not-payable',
  second: 'lnbc2fixture-only-not-payable',
  long: 'lnbc' + 'a'.repeat(1996),
  oversized: 'lnbc' + 'a'.repeat(1997),
  failure: 'fixture-render-error-invoice',
};

// Makes the pre-migration crash observable without losing the fixture controls.
class FixtureBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p>Caller render failed</p> : this.props.children; }
}

function Fixture() {
  const [invoice, setInvoice] = useState(payloads.first);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <div id="caller">
        <FixtureBoundary>
          <InvoicePaymentPending
            invoicePayload={{ invoice, total_sats: 1200 }}
            loading={loading}
            onCheckStatus={() => { invoiceFixture.checks++; }}
            error={error}
            onError={setError}
            debugLogs={query.has('feedback') ? ['Synthetic status detail'] : []}
            onCancel={query.has('no-cancel') ? undefined : () => { invoiceFixture.cancels++; }}
          />
        </FixtureBoundary>
      </div>
      <aside id="controls" style={{ padding: 16 }}>
        {Object.entries(payloads).map(([name, value]) => (
          <button id={name} key={name} type="button" onClick={() => setInvoice(value)}>{name}</button>
        ))}
        <button id="loading" type="button" onClick={() => setLoading(value => !value)}>Toggle loading</button>
        <button id="error" type="button" onClick={() => setError('Synthetic invoice status error')}>Show error</button>
      </aside>
      <div hidden id="reference">
        {!invoice.startsWith('fixture-render-error') && <QRCode value={invoice} size={200} />}
      </div>
    </>
  );
}

Object.assign(window, { invoiceFixture });
createRoot(document.getElementById('root')!).render(<MemoryRouter><Fixture /></MemoryRouter>);
