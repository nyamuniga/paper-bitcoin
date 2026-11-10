import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useBottomSheet } from '../../src/hooks/useBottomSheet';

function Sheet({ id, onClose, onPing, onNested, disabled }: {
  id: string; onClose: () => void; onPing: () => void; onNested?: () => void; disabled: boolean;
}) {
  const { dragHandleProps, sheetStyle, backdropStyle, isClosing, closeWithAnimation } = useBottomSheet({ onClose, disabled });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus();
  }, []);
  return <div id={`${id}-backdrop`} style={{ ...backdropStyle, position:'fixed', inset:0, zIndex:id === 'nested' ? 20 : 10, background:'rgba(0,0,0,.4)', display:'flex', alignItems:'flex-end' }} onClick={closeWithAnimation}>
    <div id={id} data-closing={isClosing} style={{ ...sheetStyle, height:220, width:'100%', background:'#1e3528' }} onClick={event => event.stopPropagation()}>
      <div id={`${id}-handle`} {...dragHandleProps} style={{ ...dragHandleProps.style, height:70, background:'#33453a' }}>Swipe down</div>
      <button id={`${id}-close`} onClick={closeWithAnimation}>Close</button>
      <button id={`${id}-ping`} onClick={onPing}>Sheet action</button>
      {onNested && <button id="open-nested" onClick={onNested}>Open nested sheet</button>}
    </div>
  </div>;
}

function App() {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  const [presses, setPresses] = useState(0);
  const [closes, setCloses] = useState(0);
  const [pings, setPings] = useState(0);
  const [disabled, setDisabled] = useState(false);
  Object.assign(window, { bottomSheetTest: { unmount: () => setOpen(false), disable: () => setDisabled(true) } });
  return <>
    <button id="opener" style={{position:'absolute',left:20,top:80,width:180,height:60}} onClick={() => { setPresses(n => n + 1); setOpen(true); }}>Open sheet</button>
    <input id="field" aria-label="Underlying input" style={{position:'absolute',left:210,top:80,width:150,height:60}} />
    <output id="presses">{presses}</output><output id="closes">{closes}</output><output id="pings">{pings}</output>
    {open && <Sheet id="sheet" disabled={disabled} onClose={() => { setCloses(n => n + 1); setOpen(false); }} onPing={() => setPings(n => n + 1)} onNested={() => setNested(true)} />}
    {nested && <Sheet id="nested" disabled={false} onClose={() => setNested(false)} onPing={() => setPings(n => n + 1)} />}
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
