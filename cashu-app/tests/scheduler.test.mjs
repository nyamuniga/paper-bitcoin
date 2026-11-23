import test from 'node:test';
import assert from 'node:assert/strict';
import { timeoutScheduler } from '../src/services/scheduler.ts';

test('timeout scheduler runs after the requested delay and only once',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let calls=0;
  timeoutScheduler.schedule(()=>{calls++;},100);
  assert.equal(calls,0);
  t.mock.timers.tick(99);assert.equal(calls,0);
  t.mock.timers.tick(1);assert.equal(calls,1);
  t.mock.timers.tick(100);assert.equal(calls,1);
});
test('timeout scheduler cancellation is idempotent and prevents the callback',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let calls=0;
  const cancel=timeoutScheduler.schedule(()=>{calls++;},100);
  cancel();cancel();t.mock.timers.tick(1000);
  assert.equal(calls,0);
});
