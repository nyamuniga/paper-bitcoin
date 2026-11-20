// Test-only wallet/native boundaries. All tokens below contain synthetic, unfunded proofs.
import { useEffect } from 'react';

const query = new URLSearchParams(window.location.search);
export const balances = { 'https://mint-1.example.test': 10000, 'https://mint-2.example.test/': 20000 };
export const fixture = { activeMint: '', invoiceMint: '', sends: [] as { mint: string; amount: number }[], claims: 0, refreshes: 0 };
export const previewMint = query.has('unknown-mint') ? 'https://unknown-mint.example.test' : 'https://mint-2.example.test';
export const previewToken = 'cashuA' + btoa(JSON.stringify({
  token: [{ mint: previewMint, proofs: [{ id: '0011223344556677', amount: 8, secret: 'fixture', C: '02' + '11'.repeat(32) }] }], unit: 'sat',
})).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const refreshWallet = async () => { fixture.refreshes++; };
export const useWalletStore = (selector: (state: { mintBalances: typeof balances; refreshWallet: typeof refreshWallet }) => unknown) => selector({ mintBalances: balances, refreshWallet });
export function useEcash(mint: string) {
  fixture.activeMint = mint;
  return {
    sending: query.has('sending'), receiving: query.has('receiving'), isClaimed: false,
    setIsClaimed: () => {}, trackOutgoing: () => {},
    sendEcash: async (amount: number) => {
      fixture.sends.push({ mint, amount });
      return { token: 'cashuAfixture-only', token_v3: 'cashuAfixture-only', token_v4: 'cashuBfixture-only' };
    },
    receiveEcash: () => { fixture.claims++; throw new Error('Claiming is forbidden in this fixture.'); },
  };
}

const rejectInvoice = () => { throw new Error('Invoice submission is forbidden in this fixture.'); };
export function useEcashInvoice(mint: string) {
  fixture.invoiceMint = mint;
  return { invoice: null, loading: false, claiming: false, paid: false, retryToken: null,
    deliveryDetails: [], create: rejectInvoice, retry: rejectInvoice, checkStatus: rejectInvoice };
}

// Only exercise the parent's requestBusy visibility contract, not merchant preparation/delivery.
export function EcashRequestPayment({ onBusy }: { onBusy: (busy: boolean) => void }) {
  useEffect(() => { onBusy(query.has('request-busy')); }, [onBusy]);
  return null;
}
export const readClipboardText = async () => query.has('paste-token') ? previewToken : '';
export const writeClipboardText = async () => { throw new Error('Clipboard writes are outside this fixture.'); };

// QR transport is outside the picker contract; keep the display static and never open a camera.
export const useUrEncoder = (token: string) => ({ currentFrame: token, isAnimated: false, currentFrameIndex: 0, totalFrames: 1 });
export const useUrDecoder = () => ({ reset: () => {}, progress: 0, isSuccess: false });
