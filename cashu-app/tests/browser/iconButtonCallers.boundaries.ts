// Synthetic browser boundaries; the caller components and address-book UI remain real.
export * from './bitcoinMintPicker.boundaries';
const query = new URLSearchParams(location.search);
export const mintUrl = 'https://mint-1.example.test';
export const token = 'cashuAfixture-only-not-spendable';
export const callerFixture = {
  writes: [] as string[], successes: [] as string[], errors: [] as string[], forbidden: 0, closes: 0,
};
export const writeClipboardText = async (text: string) => {
  callerFixture.writes.push(text);
  if (query.has('copy-error')) throw new Error('Synthetic clipboard failure');
  return !query.has('copy-false');
};
export const readClipboardText = async () => '';
export const toast = {
  success: (message: string) => callerFixture.successes.push(message),
  error: (message: string) => callerFixture.errors.push(message),
};
const info = {name: 'Fixture Mint', version: 'fixture', nuts: {'4': {methods: [{method: 'bolt11', unit: 'sat'}]}}};
export const useMintInfo = () => ({info, loading: false, error: null});
const forbidden = async () => {callerFixture.forbidden++;throw new Error('Mint operations are forbidden in this fixture');};
export const useMints = () => ({addMint: forbidden, removeMint: forbidden, loading: false});
export const useUrDecoder = () => ({progress: 0, isSuccess: false, receivePart: () => null, reset: () => {}});
export const useUrEncoder = () => ({currentFrame: null, isAnimated: false, currentFrameIndex: 0, totalFrames: 1});
export const EcashReceiveInvoice = () => null;
