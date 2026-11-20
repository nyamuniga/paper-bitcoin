import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookUser, Check, Copy } from 'lucide-react';
import { IconButton } from '../../src/components/shared/IconButton';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.className = document.documentElement.dataset.theme;

// Frozen caller classes: Scan/Bitcoin address-book controls and Mint Info/transaction copy controls.
const addressBookStyle = 'p-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-primary transition-all cursor-pointer border border-outline-variant/20 shadow-sm flex items-center justify-center';
const copyStyle = 'p-2 rounded-xl bg-surface-container-high/80 hover:bg-surface-bright text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0 cursor-pointer border border-outline-variant/20';

function Fixture() {
  const [disabled, setDisabled] = useState(query.has('disabled'));
  const [copied, setCopied] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [submits, setSubmits] = useState(0);
  const [resets, setResets] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addressBook = query.has('address-book');
  const label = addressBook ? 'Open Address Book' : copied ? 'Mint URL copied' : 'Copy Mint URL';
  const icon = addressBook ? <BookUser size={15} aria-hidden="true" />
    : copied ? <Check size={14} className="text-emerald-400" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />;
  const className = addressBook ? addressBookStyle : copyStyle;
  const type = query.has('submit') ? 'submit' : query.has('reset') ? 'reset' : 'button';
  return <main style={{padding: 24, maxWidth: 480, margin: '0 auto'}}>
    <button id="before-action" type="button">Before action</button>
    <form onSubmit={event => {event.preventDefault();setSubmits(count => count + 1);}}
      onReset={() => setResets(count => count + 1)}>
      <input id="native-input" aria-label="Native form input" defaultValue="original" />
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '24px 0'}}>
        <span>{addressBook ? 'Address book action' : 'Mint URL action'}</span>
        <IconButton id="action" type={type} aria-label={label} title={label} className={className.replace('cursor-pointer', '')}
          disabled={disabled} ref={buttonRef} name="action" value="copy" aria-describedby="hint"
          onClick={() => {setClicks(count => count + 1);if (!addressBook) setCopied(true);if (query.has('lock-on-click')) setDisabled(true);}}>
          {icon}
        </IconButton>
      </div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '24px 0'}}>
        <span>Original native button</span>
        <button id="reference" type="button" aria-label={label} title={label} className={className} disabled={disabled}>{icon}</button>
      </div>
      <p id="hint">Fixture only; no clipboard, address-book or payment operation runs.</p>
    </form>
    <IconButton id="standalone" type="button" aria-label="Standalone copy"><Copy size={16} aria-hidden="true" /></IconButton>
    <button id="enable" type="button" onClick={() => setDisabled(false)}>Enable action</button>
    <button id="focus-action" type="button" onClick={() => buttonRef.current?.focus()}>Focus action</button>
    <output id="clicks">{clicks}</output><output id="submits">{submits}</output><output id="resets">{resets}</output>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
