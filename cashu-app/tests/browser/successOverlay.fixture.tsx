import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation,useNavigate} from 'react-router-dom';
import {SovereignStampOverlay, type StampPaymentStatus} from '../../src/components/shared/SovereignStampOverlay';

function Screen() {
  const params = new URLSearchParams(window.location.search);
  const [status,setStatus] = useState<StampPaymentStatus | null>((params.get('status') || 'success') as StampPaymentStatus);
  const [dismissals,setDismissals] = useState(0);
  const [retries,setRetries] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output id="route">{location.pathname}</output>
    <output id="dismissals">{dismissals}</output>
    <output id="retries">{retries}</output>
    <button id="history-back" onClick={() => navigate(-1)}>History back</button>
    <SovereignStampOverlay status={status} amountSats={1000} soundEnabled={false} hapticEnabled={false}
      actionLabel={params.has('custom') ? 'Back to wallet' : undefined}
      onDismiss={params.has('no-dismiss') ? undefined : () => {setDismissals(count => count + 1); setStatus(null);}}
      onRetry={() => setRetries(count => count + 1)} />
  </>;
}
createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/','/history','/send-bitcoin']} initialIndex={2}><Screen /></MemoryRouter>
);
