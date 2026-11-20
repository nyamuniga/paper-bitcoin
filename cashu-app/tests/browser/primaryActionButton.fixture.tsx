import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronRight, Loader2 } from 'lucide-react';
import { PrimaryActionButton } from '../../src/components/shared/PrimaryActionButton';

const query = new URLSearchParams(window.location.search);
const theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.className = theme;

function Fixture() {
  const [loading, setLoading] = useState(query.has('loading'));
  const [clicks, setClicks] = useState(0);
  const [submits, setSubmits] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const conversion = query.has('conversion');
  const label = loading ? conversion ? 'Getting rate and fees…' : 'Confirming…' : conversion ? 'Review transfer' : 'Review cashout';
  const content = conversion ? <>{loading && <Loader2 aria-hidden="true" className="animate-spin" size={19} />}{label}{!loading && <ChevronRight aria-hidden="true" size={19} />}</> : label;
  const type = query.has('submit') ? 'submit' : query.has('reset') ? 'reset' : 'button';
  const disabled = query.has('disabled');
  const action = () => { setClicks(count => count + 1); if (query.has('lock-on-click')) setLoading(true); };
  return <main style={{ padding: 24, maxWidth: 480, margin: '0 auto' }}>
    {/* Frozen pre-migration reference; production CSS can now remove its duplicate base declarations. */}
    <style>{`
      .momo-primary-reference { width:100%; min-height:44px; border-radius:16px; background:#f2a93b; color:#06110c; font-size:15px; font-weight:600; cursor:pointer; padding:10px 16px; }
      .momo-primary-reference:disabled { opacity:.4; cursor:default; }
      @media(max-height:520px) { .momo-primary-reference { min-height:36px; padding:6px 8px; font-size:13px; } }
      .transfer-primary-reference { width:100%; min-height:44px; border-radius:16px; display:flex; gap:8px; align-items:center; justify-content:center; padding:12px 18px; font-size:15px; font-weight:600; background:#f2a93b; color:#06110c; }
      .transfer-primary-reference:hover:not(:disabled) { background:#ffc564; }
      @media(max-height:520px) { .transfer-primary-reference { min-height:32px; padding:6px 8px; font-size:13px; } }
    `}</style>
    <button id="before-action">Before action</button>
    <div className={conversion ? 'transfer-screen' : 'momo-page'} style={{ minHeight: 0, height: 'auto', padding: '16px 0', overflow: 'visible' }}>
      <div className={conversion ? 'transfer-content' : ''}>
        <form onSubmit={event => { event.preventDefault(); setSubmits(count => count + 1); }}>
          <input id="native-input" aria-label="Native form input" defaultValue="original" />
          <PrimaryActionButton id="action" ref={buttonRef} type={type} loading={loading} disabled={disabled}
            className={conversion ? 'transfer-primary' : 'momo-primary'} aria-label={label}
            aria-describedby="action-hint" name="action" value="review" onClick={action}>
            {content}
          </PrimaryActionButton>
          <p id="action-hint">Fixture only; no payment is submitted.</p>
        </form>
        <button id="reference" type="button" disabled={disabled || loading} className={conversion ? 'transfer-primary-reference' : 'momo-primary-reference'} aria-label={label}>{content}</button>
      </div>
    </div>
    <PrimaryActionButton id="standalone" type="button">Continue</PrimaryActionButton>
    <button id="ready" onClick={() => setLoading(false)}>Ready</button>
    <button id="focus-action" onClick={() => buttonRef.current?.focus()}>Focus action</button>
    <output id="clicks">{clicks}</output><output id="submits">{submits}</output>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
