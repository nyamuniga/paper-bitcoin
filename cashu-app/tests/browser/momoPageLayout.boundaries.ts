import { create } from 'zustand';
import { AppPhase } from '../../src/types/momo';
import type { TransactionDetails } from '../../src/types/momo';

const query = new URLSearchParams(location.search);
export const balances = { 'https://mint-1.example.test': 10000, 'https://mint-2.example.test': 20000 };
export const momoPageFixture = {
  closes: 0,
  submissions: [] as unknown[][],
  resumes: [] as string[],
  recoveryChecks: 0,
  setError: (message: string) => useTransactionStore.getState().setError(message),
};
const savedTransfer: TransactionDetails = {
  id: 'fixture-saved-transfer', direction: 'RWF_TO_SATS', rwfAmount: 1000,
  satsAmount: 990, fee: 10, rate: 1, invoice: '', momoPhoneNumber: '0780000000',
  momoReferenceId: null, mintQuoteId: null, ecashToken: null, paymentHash: null,
  payoutReferenceId: null, status: 'PENDING', currentPhase: AppPhase.PENDING_PAYMENT,
  mintUrl: Object.keys(balances)[0], timestamp: 1,
};

interface TransactionState {
  activeTransaction: TransactionDetails | null;
  history: TransactionDetails[];
  error: string | null;
  setError: (error: string | null) => void;
  updateTransaction: (changes: Partial<TransactionDetails>) => void;
  setActiveTransaction: (transaction: TransactionDetails | null) => void;
  saveActiveTransaction: () => boolean;
  resumeTransaction: (id: string) => boolean;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  activeTransaction: query.has('pending') ? savedTransfer : null,
  history: query.has('saved') ? [savedTransfer] : [],
  error: null,
  setError: error => set({ error }),
  updateTransaction: changes => {
    const current = get().activeTransaction;
    if (current) set({ activeTransaction: { ...current, ...changes } });
  },
  setActiveTransaction: activeTransaction => set({ activeTransaction }),
  saveActiveTransaction: () => true,
  resumeTransaction: id => {
    momoPageFixture.resumes.push(id);
    const activeTransaction = get().history.find(transaction => transaction.id === id);
    if (!activeTransaction) return false;
    set({ activeTransaction });
    return true;
  },
}));

export const useWalletStore = (selector: (state: { mintBalances: typeof balances }) => unknown) => selector({ mintBalances: balances });
export const fetchCurrentRate = async () => 1;
export const fetchProxyBlinkBalance = async () => ({ status: 'available', balanceSats: 1000000 });
export const checkMomoRecovery = async () => { momoPageFixture.recoveryChecks++; };
const submit = (...args: unknown[]) => {
  momoPageFixture.submissions.push(args);
  // Keep the real view's confirmation guard busy without starting a payment.
  return new Promise<void>(() => {});
};
export const calculateQuote = submit;
export const calculateSendQuote = submit;
export const SovereignStampOverlay = () => null;
