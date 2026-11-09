import test from 'node:test';
import assert from 'node:assert/strict';
import { transferErrorDetails, transferErrorMessage } from '../src/services/transferError.ts';

test('preserves SDK object and native string errors for diagnosis', () => {
  assert.equal(transferErrorDetails({type:'Generic', message:'provider rejected quote'}), 'Generic: provider rejected quote');
  assert.equal(transferErrorDetails({Generic:'conversion service busy'}), '{"Generic":"conversion service busy"}');
  assert.equal(transferErrorDetails('mint request failed'), 'mint request failed');
  assert.equal(transferErrorDetails(new Error('quote failed')), 'quote failed');
});
test('quote failures never imply a payment has started', () => {
  assert.equal(transferErrorMessage('provider rejected quote', 'quote'), 'We couldn’t get a transfer quote. Check the details below, then try again.');
  assert.match(transferErrorMessage('deadline exceeded', 'quote'), /quote.*timed out/i);
  assert.doesNotMatch(transferErrorMessage('network error', 'quote'), /saved|started/i);
});
test('pending conversions direct users to check progress without suggesting another payment', () => {
  assert.match(transferErrorMessage('provider error', 'pending'), /saved.*Check progress/);
  assert.match(transferErrorMessage('timeout', 'pending'), /Check progress/);
});
test('known validation errors explain the action required', () => {
  assert.match(transferErrorMessage('Wait for the current Bitcoin operation to finish.', 'quote'), /another.*operation/i);
  assert.match(transferErrorMessage('Wallet or amount changed. Check the amount again.', 'review'), /changed.*again/);
  assert.match(transferErrorMessage('Quote expired', 'review'), /expired/);
});
