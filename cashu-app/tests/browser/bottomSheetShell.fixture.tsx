import { StrictMode, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal, flushSync } from 'react-dom';
import { BottomSheet } from '../../src/components/shared/BottomSheet';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.className = document.documentElement.dataset.theme;

function ForeignOverlay({ onClose }: { onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { button.current?.focus(); }, []);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="External confirmation" className="fixed inset-0 z-[200] bg-background p-8"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <button id="foreign-close" ref={button} type="button" onClick={onClose}>Return to sheet</button>
    </div>, document.body,
  );
}

function Fixture() {
  const [open, setOpen] = useState(query.has('mounted'));
  const [nested, setNested] = useState(query.has('nested'));
  const [foreign, setForeign] = useState(false);
  const [dismissible, setDismissible] = useState(!query.has('blocked'));
  const [closes, setCloses] = useState(0);
  const [childCloses, setChildCloses] = useState(0);
  const [presses, setPresses] = useState(0);
  const [pings, setPings] = useState(0);
  const initial = useRef<HTMLInputElement>(null);
  const fallback = useRef<HTMLButtonElement>(null);
  const initialFocusRef = query.has('initial') ? initial : undefined;
  const noControls = query.has('empty');

  // Fixture controls change caller policy/lifecycle; no wallet or provider is involved.
  Object.assign(window, { sheetFixture: {
    unmount: () => setOpen(false), setDismissible, closeNested: () => setNested(false),
    navigate: () => { flushSync(() => setOpen(false)); fallback.current?.focus(); },
  } });

  return <main id="fixture" className="min-h-dvh bg-background text-on-surface p-6">
    <button id="opener" type="button" className="block p-4" onClick={() => { setPresses(value => value + 1); setOpen(true); }}>Open actions</button>
    <label htmlFor="outside">Outside input</label><input id="outside" className="block bg-surface-container p-2" />
    <button id="fallback" type="button" ref={fallback} className="block p-4">Next page heading</button>
    <output hidden id="state">{JSON.stringify({ closes, childCloses, presses, pings })}</output>
    {open && <BottomSheet
      {...(query.has('label') ? { 'aria-label': 'Actions' } : { 'aria-labelledby': 'title' })}
      aria-describedby="description" id="sheet" className="caller-panel border border-outline-variant"
      initialFocusRef={initialFocusRef} returnFocusRef={query.has('return-ref') ? fallback : undefined}
      dismissible={dismissible} suspended={foreign}
      onClose={() => { setCloses(value => value + 1); setOpen(false); }}
    >{({ close, closeButtonProps, dragHandleProps, isClosing }) => <>
      <header className="shrink-0 p-5">
        <div id="handle" {...dragHandleProps} className="h-7 flex items-center justify-center"><span className="w-10 h-1 bg-on-surface-variant rounded-full" /></div>
        <h2 id="title" className="text-2xl font-bold">Actions</h2>
        <p id="description">Choose a synthetic action.</p>
        {!noControls && <button id="close" {...closeButtonProps} className="p-2">Close</button>}
      </header>
      <div id="content" className="min-h-0 overflow-y-auto px-5" data-closing={isClosing}>
        {!noControls && <>
          <button type="button" disabled>Unavailable</button><button type="button" hidden>Hidden</button>
          <label htmlFor="initial" className="block">Description</label>
          <input id="initial" ref={initial} disabled={query.has('disabled-initial')} className="block p-2 bg-surface-container"
            onKeyDown={event => { if (query.has('editor') && event.key === 'Escape') event.preventDefault(); }} />
          <fieldset><legend>Choice</legend><label><input id="radio-one" name="choice" type="radio" defaultChecked /> One</label><label><input id="radio-two" name="choice" type="radio" /> Two</label></fieldset>
          <button id="nested-opener" type="button" className="block p-2" onClick={() => setNested(true)}>More actions</button>
          <button id="foreign-opener" type="button" className="block p-2" onClick={() => setForeign(true)}>External confirmation</button>
          <button id="ping" type="button" className="block p-2" onClick={() => setPings(value => value + 1)}>Keep working</button>
        </>}
        {query.has('long') && Array.from({ length: 30 }, (_, index) => <p className="py-2" key={index}>Synthetic detail {index + 1}</p>)}
      </div>
      {!noControls && <footer className="shrink-0 p-5 pb-[max(20px,env(safe-area-inset-bottom))]"><button id="done" type="button" className="p-3 bg-primary text-on-primary rounded-xl" onClick={close}>Done</button></footer>}
      {nested && <BottomSheet aria-label="More actions" id="nested" suspended={foreign} onClose={() => { setChildCloses(value => value + 1); setNested(false); }}>
        {({ closeButtonProps: childCloseProps }) => <div className="p-6"><h2>More actions</h2><button id="child-close" {...childCloseProps}>Close child</button><button id="child-foreign" type="button" onClick={() => setForeign(true)}>External confirmation</button></div>}
      </BottomSheet>}
    </>}</BottomSheet>}
    {foreign && <ForeignOverlay onClose={() => setForeign(false)} />}
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>);
