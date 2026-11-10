import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMomoReview, assertMomoReviewApproved } from '../src/services/momoReview.ts';

const input = { direction: 'RWF_TO_SATS', amount: 1000, phone: '0781234567', mint: 'https://mint.example', rate: 2, spread: 0.021, fixedFee: 120, networkReserve: 10 };
test('topup review includes the exchange margin and cashout includes fees plus routing reserve', () => {
  assert.equal(buildMomoReview(input).sats, 1958);
  const out = buildMomoReview({...input, direction:'SATS_TO_RWF'});
  assert.equal(out.sats, 2292);
  assert.equal(out.fundingSats, 2282);
  assert.equal(out.feeRwf, 141);
});
test('confirmation rejects worse pricing and mismatched payment details before submission', () => {
  const approved = buildMomoReview(input);
  assert.throws(() => assertMomoReviewApproved(approved, buildMomoReview({...input,rate:1.9})), /rate changed/i);
  assert.doesNotThrow(() => assertMomoReviewApproved(approved, buildMomoReview({...input,rate:2.1})));
  for (const change of [{amount:2000},{phone:'0791234567'},{mint:'https://other.example'},{direction:'SATS_TO_RWF'}]) {
    assert.throws(() => assertMomoReviewApproved(approved, buildMomoReview({...input,...change})), /details changed/i);
  }
  const out = buildMomoReview({...input,direction:'SATS_TO_RWF'});
  assert.throws(() => assertMomoReviewApproved(out,buildMomoReview({...input,direction:'SATS_TO_RWF',rate:2.1})), /rate changed/i);
});
test('invalid phone, non-integer or out-of-range RWF amounts, and missing rates cannot be reviewed', () => {
  for (const change of [{amount:99},{amount:200001},{amount:100.5},{phone:'123'},{rate:0},{rate:NaN},{mint:''}]) {
    assert.throws(() => buildMomoReview({...input,...change}));
  }
});
