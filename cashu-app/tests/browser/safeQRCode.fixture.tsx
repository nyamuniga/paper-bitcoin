import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeQRCode } from '../../src/components/shared/SafeQRCode';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.className = document.documentElement.dataset.theme;
const payloads = {
  first: 'fixture-payment-a',
  second: 'fixture-payment-b',
  empty: '',
  limit: 'a'.repeat(2000),
  oversized: 'a'.repeat(2001),
  unicode: 'é'.repeat(1001),
  emojiLimit: '😀'.repeat(500),
  emojiOversized: '😀'.repeat(501),
  failure: 'fixture-render-error-a',
  anotherFailure: 'fixture-render-error-b',
};

const initialValue = query.has('initial-error')
  ? payloads.failure
  : query.has('initial-large') ? payloads.oversized : payloads.first;
const useDefaults = query.has('default-props');

function Fixture() {
  const [value, setValue] = useState(initialValue);
  const [size, setSize] = useState<number | undefined>(useDefaults ? undefined : 180);
  const [fallbackText, setFallbackText] = useState<string | undefined>(
    useDefaults ? undefined : 'Copy this payment using the button below.',
  );
  const [copied, setCopied] = useState('');
  return (
    <main style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <section id="qr" className="flex justify-center">
        <SafeQRCode value={value} size={size} className="fixture-qr" fallbackText={fallbackText} />
      </section>
      <button
        id="copy"
        type="button"
        className="rounded-xl bg-primary text-on-primary px-4 py-2 mt-4"
        onClick={() => setCopied(value)}
      >
        Copy payment
      </button>
      <output id="copied" hidden>{copied}</output>
      <div className="flex flex-wrap gap-2 mt-4">
        {Object.entries(payloads).map(([name, payload]) => (
          <button id={name} key={name} type="button" onClick={() => setValue(payload)}>
            {name}
          </button>
        ))}
        <button id="resize" type="button" onClick={() => setSize(224)}>Resize</button>
        <button
          id="change-hint"
          type="button"
          onClick={() => setFallbackText('Caller-updated copy instruction.')}
        >
          Change hint
        </button>
      </div>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
