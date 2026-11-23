// The transaction store stays real. Only wallet/provider/result boundaries are synthetic.
export const balances = { 'https://saved.fixture.invalid': 10000 };
export const fixtureCalls = { submissions: 0, recoveryChecks: 0 };
export const useWalletStore = (select: (state: { mintBalances: typeof balances }) => unknown) => select({ mintBalances: balances });
export const fetchCurrentRate = async () => 1;
export const fetchProxyBlinkBalance = async () => ({ status: 'available', balanceSats: 1000000 });
export const checkMomoRecovery = async () => { fixtureCalls.recoveryChecks++; };
const unexpectedSubmission = async () => {
  fixtureCalls.submissions++;
  throw new Error('Payment submission is outside this saved-transfer fixture');
};
export const calculateQuote = unexpectedSubmission;
export const calculateSendQuote = unexpectedSubmission;
export const SovereignStampOverlay = () => null;
