import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildMomoReview, type MomoReview } from '../../src/services/momoReview';
import { AddressBookPickerModal } from '../../src/components/addressBook/AddressBookPickerModal';
import { useAddressBookStore } from '../../src/store/addressBookStore';
import '../../src/features/momo/MomoPages.css';

const query = new URLSearchParams(window.location.search);
const theme = query.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.className = theme;
const balances = { 'https://mint-1.example.test': 10000, 'https://mint-2.example.test': 20000 };
if (query.has('phone-field')) {
  useAddressBookStore.setState({contacts: []});
  useAddressBookStore.getState().addContact({name: 'Fixture phone contact', type: 'momo', value: '0791234567'});
  useAddressBookStore.getState().addContact({name: 'Fixture Bitcoin contact', type: 'lightning', value: 'fixture@example.test'});
}

localStorage.setItem('mint_info_cache', JSON.stringify(Object.fromEntries(
  Object.keys(balances).map((url, index) => [url, { name: `Fixture Mint ${index + 1}`, nuts: {}, _cachedAt: Date.now() }]),
)));

async function mount() {
  const { MomoPaymentForm } = await import('../../src/features/momo/MomoPaymentForm');
  function Fixture() {
    const cashout = query.has('cashout');
    const [mint, setMint] = useState(Object.keys(balances)[0]);
    const [amount, setAmount] = useState('1000');
    const [phone, setPhone] = useState('0780000000');
    const [review, setReview] = useState<MomoReview | null>(null);
    const [submitting, setSubmitting] = useState(query.has('submitting'));
    const [reviewCalls, setReviewCalls] = useState(0);
    const [confirmCalls, setConfirmCalls] = useState(0);
    const [showAddressBook, setShowAddressBook] = useState(false);
    const [addressBookCalls, setAddressBookCalls] = useState(0);
    const [validation, setValidation] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [rateUnavailable, setRateUnavailable] = useState(false);
    useEffect(() => {
      if (!query.has('phone-field')) return;
      Object.assign(window, {momoPhoneFixture: {setValidation, setError, setRateUnavailable}});
    }, []);
    // Emulate only the parent's busy flag; no payment service is imported.
    const confirm = () => { setConfirmCalls(count => count + 1); setSubmitting(true); };
    return <main className="momo-page" style={{ height: '100dvh' }}>
      <output id="selected-mint" hidden>{mint}</output>
      <output id="review-calls" hidden>{reviewCalls}</output>
      <output id="confirm-calls" hidden>{confirmCalls}</output>
      <output id="address-book-calls" hidden>{addressBookCalls}</output>
      <MomoPaymentForm cashout={cashout} amount={amount} phone={phone} mint={mint} balances={balances}
        onAmount={setAmount} onPhone={setPhone} onMint={setMint}
        onAddressBook={() => {setAddressBookCalls(count => count + 1);setShowAddressBook(true);}}
        valid={!query.has('invalid')} loadingRate={query.has('loading-rate')} validation={validation} review={review} submitting={submitting}
        error={error} maxAmount={1000} rateUnavailable={rateUnavailable} onRefreshRate={() => {}}
        saved={[]} onResume={() => {}}
        onReview={() => {
          setReviewCalls(count => count + 1);
          setReview(buildMomoReview({
            direction: cashout ? 'SATS_TO_RWF' : 'RWF_TO_SATS', amount: Number(amount), phone, mint,
            rate: 1, spread: .01, fixedFee: 10, networkReserve: 5,
          }));
        }}
        onConfirm={confirm} />
      <AddressBookPickerModal isOpen={showAddressBook} type="momo" onClose={() => setShowAddressBook(false)}
        onSelect={contact => setPhone(contact.value)} />
    </main>;
  }
  createRoot(document.getElementById('root')!).render(<Fixture />);
}
void mount();
