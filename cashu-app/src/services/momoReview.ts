export interface MomoReviewInput {
  direction: 'RWF_TO_SATS' | 'SATS_TO_RWF';
  amount: number; phone: string; mint: string; rate: number;
  spread: number; fixedFee: number; networkReserve: number;
}
export interface MomoReview extends MomoReviewInput {
  sats: number; fundingSats: number; feeRwf: number;
}
export class MomoReviewChangedError extends Error {
  review: MomoReview;
  constructor(review: MomoReview) {
    super('The exchange rate changed. Review the updated amounts before confirming.');
    this.review = review;
  }
}
/** Local estimate only. Provider requests begin after an explicit confirmation. */
export function buildMomoReview(input: MomoReviewInput): MomoReview {
  if (!Number.isSafeInteger(input.amount) || input.amount < 100 || input.amount > 200000) throw new Error('Enter a whole amount from 100 to 200,000 RWF.');
  if (!/^07[89]\d{7}$/.test(input.phone)) throw new Error('Enter a 10-digit phone number starting with 078 or 079.');
  if (!input.mint || !Number.isFinite(input.rate) || input.rate <= 0) throw new Error('A mint and current exchange rate are required.');
  const cashout = input.direction === 'SATS_TO_RWF';
  const feeRwf = cashout ? input.fixedFee + Math.ceil(input.amount * input.spread) : input.amount * input.spread;
  const fundingSats = cashout ? Math.ceil((input.amount + feeRwf) * input.rate) : Math.floor(input.amount * (1 - input.spread) * input.rate);
  const sats = fundingSats + (cashout ? input.networkReserve : 0);
  if (!Number.isSafeInteger(sats) || sats <= 0) throw new Error('The amount cannot be converted at this rate.');
  return { ...input, feeRwf, fundingSats, sats };
}
export function assertMomoReviewApproved(approved: MomoReview, current: MomoReview): void {
  if (approved.direction !== current.direction || approved.amount !== current.amount || approved.phone !== current.phone || approved.mint !== current.mint) {
    throw new Error('The payment details changed. Review this transfer again.');
  }
  if (current.direction === 'RWF_TO_SATS' ? current.sats < approved.sats : current.sats > approved.sats) {
    throw new MomoReviewChangedError(current);
  }
}
