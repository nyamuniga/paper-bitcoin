import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceTabAfterSwipe, isHorizontalSwipe } from '../src/utils/balanceCardGesture.ts';
test('horizontal swipes switch between BTC and USD without wrapping', () => {
  assert.equal(balanceTabAfterSwipe('btc',-80,5),'usd');
  assert.equal(balanceTabAfterSwipe('usd',80,-5),'btc');
  assert.equal(balanceTabAfterSwipe('btc',80,0),'btc');
  assert.equal(balanceTabAfterSwipe('usd',-80,0),'usd');
});
test('vertical scrolling, diagonal movement and taps do not change balances', () => {
  for(const [dx,dy] of [[4,90],[55,90],[20,2],[-80,70],[0,0]]) assert.equal(balanceTabAfterSwipe('btc',dx,dy),'btc');
  assert.equal(isHorizontalSwipe(18,2,12),true);
  assert.equal(isHorizontalSwipe(12,20,12),false);
});
