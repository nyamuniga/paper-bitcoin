import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookUser } from 'lucide-react';
import { FormField } from '../../src/components/shared/FormField';
import { IconButton } from '../../src/components/shared/IconButton';
import type { FormFieldControlProps } from '../../src/components/shared/FormField';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.className = document.documentElement.dataset.theme;
const destinationLabel = 'text-body-md font-body-md text-on-surface-variant';
const destinationShell = 'relative glow-effect rounded-xl transition-all bg-[#0c1b14] border border-[#142d20] overflow-hidden flex flex-col focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/40';
const destinationInput = 'w-full bg-transparent text-on-surface font-label-caps text-label-caps p-3.5 pb-2 border-none focus:outline-none resize-none placeholder:text-on-surface-variant/50 min-h-[76px]';
const pasteStyle = 'text-[12px] font-bold text-on-surface-variant hover:text-primary transition-colors cursor-pointer';
const bookStyle = 'p-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-primary transition-all border border-outline-variant/20 shadow-sm';

function Fixture() {
  const [phone, setPhone] = useState('');
  const [destination, setDestination] = useState('');
  const [hint, setHint] = useState(query.has('hint'));
  const [error, setError] = useState(query.has('error'));
  const [reversed, setReversed] = useState(false);
  const [actions, setActions] = useState(0);
  const phoneRef = useRef<HTMLInputElement>(null);
  const extra = query.has('external') ? 'external-note  external-note' : undefined;
  const hintText = query.has('long') ? 'A long instruction that should wrap within the field. '.repeat(12) : 'Caller-owned instruction.';
  const message = (shown: boolean, text: string) => {
    if (query.has('null-messages')) return null;
    if (query.has('empty-messages')) return '';
    return shown ? text : undefined;
  };
  const phoneControl = (control: FormFieldControlProps) => <div className="flex items-center gap-2">
    <input {...control} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="078 or 079…"
      ref={phoneRef} value={phone} disabled={query.has('disabled')} onChange={event => setPhone(event.target.value)} />
    <button type="button" className="momo-address-book" aria-label="Choose phone number from address book" onClick={() => setActions(count => count + 1)}><BookUser size={20} /></button>
  </div>;
  const destinationControl = (control: FormFieldControlProps) => <div className={destinationShell}>
    <textarea {...control} value={destination} onChange={event => setDestination(event.target.value)}
      className={destinationInput} placeholder="Lightning, LNURL, or On-Chain..." rows={3} spellCheck={false} />
    <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-[#142d20]">
      <button type="button" className={pasteStyle} onClick={() => setActions(count => count + 1)}>Paste</button>
      <div className="flex items-center gap-1.5"><IconButton type="button" className={bookStyle} aria-label="Open Address Book"
        onClick={() => setActions(count => count + 1)}><BookUser size={15} aria-hidden="true" /></IconButton></div>
    </div>
  </div>;
  const fields = [
    <section key="phone" id="phone">
      <FormField id={query.has('explicit') ? 'caller-phone' : undefined} label="Phone number" className="momo-phone-field"
        describedBy={extra} hint={message(hint, hintText)} error={message(error, 'Check this phone number.')}
        hintClassName="text-body-sm" errorClassName="text-body-sm">
        {phoneControl}
      </FormField>
    </section>,
    <section key="destination" id="destination">
      <FormField id={query.has('explicit') ? 'caller-destination' : undefined} label="Pay to:" className="gap-2"
        labelClassName={destinationLabel} describedBy={extra} hint={message(hint, hintText)}
        error={message(error, 'Check this destination.')} hintClassName="text-body-sm" errorClassName="text-body-sm">
        {destinationControl}
      </FormField>
    </section>,
  ];
  return <main style={{padding: 24, maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20}}>
    {reversed ? [...fields].reverse() : fields}
    {/* Frozen original layouts; controls have separate IDs and no live feature workflow. */}
    <section id="phone-reference"><div className="momo-phone-field">
      <label htmlFor="native-phone">Phone number</label>
      <div className="flex items-center gap-2"><input id="native-phone" type="tel" placeholder="078 or 079…" />
        <button type="button" className="momo-address-book" aria-label="Reference address book"><BookUser size={20} /></button></div>
    </div></section>
    <section id="destination-reference"><div className="flex flex-col gap-2">
      <label htmlFor="native-destination" className={destinationLabel}>Pay to:</label>
      <div className={destinationShell}><textarea id="native-destination" className={destinationInput} placeholder="Lightning, LNURL, or On-Chain..." rows={3} spellCheck={false} />
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-[#142d20]">
          <button type="button" className={pasteStyle}>Paste</button>
          <div className="flex items-center gap-1.5"><IconButton type="button" className={bookStyle} aria-label="Reference address book"><BookUser size={15} aria-hidden="true" /></IconButton></div>
        </div>
      </div>
    </div></section>
    <p id="external-note">Shared instruction.</p>
    <div className="flex flex-wrap gap-2">
      <button id="toggle-hint" type="button" onClick={() => setHint(value => !value)}>Toggle hint</button>
      <button id="toggle-error" type="button" onClick={() => setError(value => !value)}>Toggle error</button>
      <button id="reorder" type="button" onClick={() => setReversed(value => !value)}>Reorder fields</button>
      <button id="focus-phone" type="button" onClick={() => phoneRef.current?.focus()}>Focus phone</button>
    </div>
    <output id="actions">{actions}</output>
    <div id="repeated-fields">{[0,1,2].map(index => <FormField key={index} label="Phone number" hint="Separate instruction." error="Separate error.">
      {control => <input {...control} />}
    </FormField>)}</div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
