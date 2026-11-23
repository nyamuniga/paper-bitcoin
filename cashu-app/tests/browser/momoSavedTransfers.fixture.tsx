import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { useTransactionStore } from '../../src/store/transactionStore';
import { AppPhase } from '../../src/types/momo';
import type { TransactionDetails } from '../../src/types/momo';
import { buildMomoReview } from '../../src/services/momoReview';
import { balances, fixtureCalls } from './momoSavedTransfers.boundaries';
import '../../src/features/momo/MomoPages.css';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.className = document.documentElement.dataset.theme;
const mint = Object.keys(balances)[0];
localStorage.setItem('mint_info_cache', JSON.stringify({ [mint]: { name: 'Fixture mint', nuts: {}, _cachedAt: Date.now() } }));
const topup: TransactionDetails = {
  id: 'saved-topup', direction: 'RWF_TO_SATS', rwfAmount: 1000, satsAmount: 990,
  fee: 10, rate: 1, invoice: '', momoPhoneNumber: '0780000000', momoReferenceId: null,
  mintQuoteId: null, ecashToken: null, paymentHash: null, payoutReferenceId: null,
  status: 'PENDING', currentPhase: AppPhase.RECOVERY_REQUIRED, mintUrl: mint, timestamp: 1,
};
const cashout: TransactionDetails = { ...topup, id: 'saved-cashout', direction: 'SATS_TO_RWF', rwfAmount: 2500, satsAmount: 2540, timestamp: 2 };
const createReview = () => buildMomoReview({
  direction: query.has('cashout') ? 'SATS_TO_RWF' : 'RWF_TO_SATS',
  amount: 1000, phone: topup.momoPhoneNumber, mint, rate: 1, spread: .01, fixedFee: 10, networkReserve: 5,
});
useTransactionStore.setState({ activeTransaction: null, history: query.has('empty') ? [] : [topup, cashout], error: null });
const selections: string[] = [];
const resumed: string[] = [];
Object.assign(window, { savedTransferFixture: {
  selections, resumed, fixtureCalls,
  snapshot: () => {
    const { activeTransaction, history, error } = useTransactionStore.getState();
    return structuredClone({ activeTransaction, history, error });
  },
  startForeground: () => useTransactionStore.setState({ activeTransaction: { ...cashout, id: 'foreground-transfer', currentPhase: AppPhase.PAYING_INVOICE }, error: 'Foreground message' }),
  reverse: () => useTransactionStore.setState(state => ({ history: [...state.history].reverse() })),
} });

async function mount() {
  const { MomoPaymentForm } = await import('../../src/features/momo/MomoPaymentForm');
  const { MomoTransferView } = await import('../../src/features/momo/MomoTransferView');
  function Form() {
    const saved = useTransactionStore(state => state.history);
    const [review, setReview] = useState(query.has('review') ? createReview() : null);
    return <main id="fixture" className="momo-page" style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <MomoPaymentForm cashout={query.has('cashout')} amount="1000" phone={topup.momoPhoneNumber} mint={mint} balances={balances}
        onAmount={() => {}} onPhone={() => {}} onMint={() => {}} onAddressBook={() => {}}
        valid loadingRate={false} validation="" review={review} submitting={false} error={null}
        maxAmount={1000} rateUnavailable={false} onRefreshRate={() => {}} saved={saved}
        onReview={() => setReview(createReview())}
        onConfirm={() => { fixtureCalls.submissions++; }}
        onResume={id => {
          selections.push(id);
          if (useTransactionStore.getState().resumeTransaction(id)) resumed.push(id);
        }} />
    </main>;
  }
  createRoot(document.getElementById('root')!).render(<MemoryRouter>
    {query.has('page') ? <div id="fixture" style={{ height: '100dvh', display: 'flex' }}><MomoTransferView page initialTab="receive" mintUrl={mint} onClose={() => {}} /></div> : <Form />}
  </MemoryRouter>);
}
void mount();
