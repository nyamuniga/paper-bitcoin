import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Coins, Bitcoin, Banknote, Phone } from 'lucide-react';
import { ActionMenuModal } from '../../src/components/home/ActionMenuModal';
import { WalletBalanceCard } from '../../src/components/home/WalletBalanceCard';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.className = document.documentElement.dataset.theme;
const title = query.get('menu') === 'Receive' ? 'Receive' : 'Send';
const events: string[] = [];

function IsolatedMenu() {
  const [open, setOpen] = useState(false);
  const [presses, setPresses] = useState(0);
  const options = [
    ...(title === 'Send' ? [{ label: 'Printable Note', icon: <Banknote size={22} /> }] : []),
    { label: 'Ecash', icon: <Coins size={20} /> }, { label: 'Bitcoin', icon: <Bitcoin size={25} /> },
    { label: title === 'Send' ? 'Cash Out' : 'Top Up', icon: <Phone size={20} /> },
  ];
  Object.assign(window, { actionFixture: { events, unmount: () => setOpen(false) } });
  return <>
    <button id="opener" type="button" className="p-4" onClick={() => { setPresses(value => value + 1); setOpen(true); }}>Open {title}</button>
    <input id="outside" aria-label="Outside input" />
    <output hidden id="presses">{presses}</output>
    {open && <ActionMenuModal title={title} onClose={() => { events.push('close'); setOpen(false); }}
      options={options.map(option => ({ ...option, onClick: () => {
        events.push(option.label);
        if (query.has('probe-order')) {
          document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
          events.push('option-complete');
        }
      } }))} />}
  </>;
}

function Destination() {
  const route = useLocation();
  return <div id="destination" tabIndex={-1}>{JSON.stringify({ path: route.pathname, state: route.state })}</div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode>
  <main id="fixture" className="min-h-dvh bg-background text-on-surface">
    {query.has('card') ? <MemoryRouter><Routes>
      <Route path="/" element={<WalletBalanceCard balance={1000} mintBalances={query.has('empty') ? {} : { 'https://fixture.invalid': 1000 }} />} />
      <Route path="*" element={<Destination />} />
    </Routes></MemoryRouter> : <IsolatedMenu />}
  </main>
</StrictMode>);
