export * from './bitcoinDestinationField.boundaries';
import { balances } from './bitcoinMintPicker.boundaries';

const query = new URLSearchParams(location.search);
export const pageFixture = { writes: [] as string[] };
export const useWalletStore = (selector: (state: { mintBalances: Record<string, number> }) => unknown) => (
  selector({ mintBalances: query.has('empty') ? {} : balances })
);
export const writeClipboardText = async (value: string) => {
  pageFixture.writes.push(value);
  return true;
};
