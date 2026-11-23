export * from './bitcoinDestinationField.boundaries';
import { useBitcoin as useBitcoinBoundary } from './bitcoinMintPicker.boundaries';
import type { OnchainSendEstimate } from '../../src/services/sparkService';

export const reviewFixture = { executions: [] as { estimate: OnchainSendEstimate; destination: string }[] };
export function useBitcoin(mint: string) {
  return {
    ...useBitcoinBoundary(mint),
    estimateOnChain: async (_destination: string, amount: number) => ({
      amount, total_cost: amount + 22, cashu_fee: 5, ark_fee: 17, bridging_invoice: 'synthetic-review-only',
    }),
    executeOnChain: (estimate: OnchainSendEstimate, destination: string) => {
      reviewFixture.executions.push({ estimate, destination });
      // Record forwarding without completing a payment or contacting a provider.
      return new Promise<never>(() => {});
    },
  };
}
