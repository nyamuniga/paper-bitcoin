import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  describeSendEcashFailure,
  formatOfflineChangeMessage,
  isOfflineReceiveError,
} from '../src/services/sendEcashError.ts';

const errors = JSON.parse(readFileSync(new URL('./fixtures/send-ecash-errors.json', import.meta.url), 'utf8'));
const hookUrl = new URL('../src/hooks/useEcash.ts', import.meta.url).href;
const stub = source => ({ url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true });

registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL === hookUrl) {
    if (specifier === 'react') return stub(`
      export const useState = value => globalThis.__ecashSendTest.useState(value);
      export const useRef = value => ({current:value});
      export default {useEffect:()=>{}};
    `);
    if (specifier === '@tauri-apps/api/core') return stub(`
      export const invoke = (...args) => {
        globalThis.__ecashSendTest.calls.push(args);
        return globalThis.__ecashSendTest.invoke(...args);
      };
    `);
    if (specifier === '../store/wallet') return stub(`
      export const useWalletStore = selector => selector({refreshWallet:async()=>{
        const f=globalThis.__ecashSendTest;
        f.refreshes++;
        if(f.refreshError) throw f.refreshError;
      }});
    `);
    if (specifier === './useNostr') return stub('export const getGlobalNostrPrivateKey=()=>null;');
    if (specifier === 'react-hot-toast') return stub(`
      export const toast = {
        error:message=>globalThis.__ecashSendTest.toasts.push(message),
        success:()=>{},
      };
    `);
    if (specifier === '../services/sendEcashError') {
      return next(new URL(specifier + '.ts', context.parentURL).href, context);
    }
  }
  return next(specifier, context);
}});

const { useEcash } = await import(hookUrl);
const receipt = {token:'synthetic-token',token_v3:'synthetic-v3',token_v4:'synthetic-v4',tx_id:'completed-send'};

function fixture(mint = 'https://mint.example') {
  const f = {
    calls: [], toasts: [], states: [], writes: [], refreshes: 0, refreshError: null,
    invoke: async () => receipt,
    useState(value) {
      const index = this.states.length;
      this.states.push(value);
      return [value, next => {
        this.states[index] = typeof next === 'function' ? next(this.states[index]) : next;
        this.writes.push(this.states[index]);
      }];
    },
  };
  globalThis.__ecashSendTest = f;
  f.hook = useEcash(mint);
  return f;
}

test('native message wording does not change the handling of any known send code', () => {
  for (const error of errors) {
    assert.deepEqual(
      describeSendEcashFailure(error),
      describeSendEcashFailure({...error,message:'Different wording: payment succeeded; retry immediately'}),
    );
    assert.equal(describeSendEcashFailure(error).requiresReconciliation, error.code === 'OUTCOME_UNKNOWN');
  }
});

test('a known existing transaction requires reconciliation even for a rejected request', () => {
  const failure = describeSendEcashFailure({code:'INVALID_REQUEST',message:'duplicate',tx_id:'existing-send'});
  assert.equal(failure.requiresReconciliation,true);
  assert.match(failure.message,/History/);
});

test('malformed, unknown-code and string failures are never assumed safe to resend', () => {
  for (const error of [null,42,'invoke unavailable',new Error('transport lost'),
    {code:'FUTURE_CODE',message:'unknown',tx_id:null},
    {code:'SERVICE_UNAVAILABLE',message:'missing transaction field'},
    {code:'constructor',message:'inherited key',tx_id:null},
    {code:'SERVICE_UNAVAILABLE',message:42,tx_id:null}]) {
    const failure = describeSendEcashFailure(error);
    assert.equal(failure.requiresReconciliation,true);
    assert.match(failure.message,/History/);
  }
});

test('successful sends use v2 once and preserve the receipt and wallet refresh', async () => {
  const f=fixture();
  assert.deepEqual(await f.hook.sendEcash(100,undefined,'public-key'),receipt);
  assert.deepEqual(f.calls,[['send_ecash_v2',{mintUrl:'https://mint.example',amount:100,pubkey:'public-key'}]]);
  assert.equal(f.refreshes,1);
  assert.ok(f.writes.includes(receipt.tx_id));
});

test('unresolved sends block another call without polling an unfinished transaction as claimed', async () => {
  for (const tx_id of [null,'saved-send']) {
    const f=fixture();const messages=[];
    f.invoke=async()=>{throw {code:'OUTCOME_UNKNOWN',message:'try again',tx_id};};
    const options={silent:true,onError:message=>messages.push(message)};
    assert.equal(await f.hook.sendEcash(100,undefined,undefined,options),null);
    assert.equal(await f.hook.sendEcash(100,undefined,undefined,options),null);
    assert.equal(f.calls.length,1);
    assert.equal(f.calls[0][0],'send_ecash_v2');
    assert.ok(messages.every(message=>message.includes('History')));
    assert.ok(!f.writes.includes('saved-send'));
    assert.deepEqual(f.toasts,[]);
  }
});

test('a preparation failure allows a later explicit attempt without parsing its message', async () => {
  const f=fixture();const messages=[];
  f.invoke=async()=>{throw {code:'SERVICE_UNAVAILABLE',message:'Payment complete; do not retry',tx_id:null};};
  assert.equal(await f.hook.sendEcash(100,undefined,undefined,{silent:true,onError:message=>messages.push(message)}),null);
  assert.equal(f.calls.length,1);
  assert.match(messages[0],/service/i);
  f.invoke=async()=>receipt;
  assert.deepEqual(await f.hook.sendEcash(100),receipt);
  assert.equal(f.calls.length,2);
});

test('a new unresolved attempt clears the previous completed transaction from claim tracking', async () => {
  const f=fixture();
  assert.deepEqual(await f.hook.sendEcash(100),receipt);
  assert.ok(f.states.includes(receipt.tx_id));
  f.invoke=async()=>{throw {code:'OUTCOME_UNKNOWN',message:'unknown',tx_id:'pending-send'};};
  assert.equal(await f.hook.sendEcash(100),null);
  assert.ok(!f.states.includes(receipt.tx_id));
  assert.ok(!f.states.includes('pending-send'));
});

test('an unavailable v2 command never falls back to a legacy send', async () => {
  const f=fixture();const messages=[];
  f.invoke=async()=>{throw 'Command send_ecash_v2 not found';};
  const options={silent:true,onError:message=>messages.push(message)};
  assert.equal(await f.hook.sendEcash(100,undefined,undefined,options),null);
  assert.equal(await f.hook.sendEcash(100,undefined,undefined,options),null);
  assert.deepEqual(f.calls.map(call=>call[0]),['send_ecash_v2']);
  assert.match(messages[0],/History/);
});

test('concurrent send calls cannot submit twice while the first call is pending', async () => {
  const f=fixture();let resolve;
  f.invoke=()=>new Promise(done=>{resolve=done;});
  const first=f.hook.sendEcash(100);
  assert.equal(await f.hook.sendEcash(100),null);
  assert.equal(f.calls.length,1);
  resolve(receipt);
  assert.deepEqual(await first,receipt);
});

test('a failed balance refresh cannot turn a confirmed token into a failed send', async () => {
  const f=fixture();const messages=[];
  f.refreshError=new Error('balance unavailable');
  assert.deepEqual(await f.hook.sendEcash(100,undefined,undefined,{onError:message=>messages.push(message)}),receipt);
  assert.deepEqual(messages,[]);
  assert.equal(f.calls.length,1);
  assert.match(f.toasts[0],/Token created/);
});

test('local missing-mint validation does not latch an unresolved native failure', async () => {
  const f=fixture('');
  const messages=[];
  assert.equal(await f.hook.sendEcash(100,undefined,undefined,{silent:true,onError:message=>messages.push(message)}),null);
  assert.equal(f.calls.length,0);
  assert.match(messages[0],/No mint/);
  assert.deepEqual(await f.hook.sendEcash(100,'https://mint.example'),receipt);
});

test('a send recovery-save failure remains unresolved and cannot automatically resend',async()=>{
  const f=fixture();const messages=[];
  f.invoke=async()=>{throw {code:'OUTCOME_UNKNOWN',tx_id:'pending-send',
    message:'Failed to split tokens: synthetic split failure. Recovery state could not be saved: synthetic disk failure. Outcome remains unknown; do not resend.'};};
  const options={silent:true,onError:message=>messages.push(message)};
  assert.equal(await f.hook.sendEcash(100,undefined,undefined,options),null);
  assert.equal(await f.hook.sendEcash(100,undefined,undefined,options),null);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'send_ecash_v2');
  assert.ok(messages.every(message=>message.includes('History')));assert.deepEqual(f.toasts,[]);
});

test('a receive recovery-save error reports failure without success or an automatic retry',async()=>{
  for(const silent of [false,true]){
    const f=fixture();const messages=[];
    const diagnostic='Failed to receive ecash: synthetic receive failure. Recovery state could not be saved: synthetic write failure. Outcome remains unknown; check History before claiming again.';
    f.invoke=async command=>{
      if(command==='get_custom_nostr_key')return null;
      if(command==='receive_ecash')throw diagnostic;
      throw new Error('Unexpected receive command');
    };
    assert.equal(await f.hook.receiveEcash('cashuAsynthetic',{silent,onError:message=>messages.push(message)}),null);
    assert.equal(f.calls.filter(([command])=>command==='receive_ecash').length,1);
    assert.equal(f.refreshes,0);assert.deepEqual(messages,[diagnostic]);
    assert.deepEqual(f.toasts,silent?[]:[`Receive failed: ${diagnostic}`]);
  }
});

test('formatOfflineChangeMessage suggests nearest offline denominations cleanly', () => {
  assert.equal(
    formatOfflineChangeMessage(20, { lower: 16, higher: 32 }),
    "You're offline and can't make exact change for 20 sats right now. Try 16 sats or 32 sats.",
  );
  assert.equal(
    formatOfflineChangeMessage(20, { lower: 16, higher: null }),
    "You're offline and can't make exact change for 20 sats right now. Try 16 sats.",
  );
  assert.equal(
    formatOfflineChangeMessage(20, { lower: null, higher: 32 }),
    "You're offline and can't make exact change for 20 sats right now. Try 32 sats.",
  );
  assert.equal(formatOfflineChangeMessage(20, { lower: null, higher: null }), null);
});

test('isOfflineReceiveError detects unreachable mints without catching spent or invalid tokens', () => {
  assert.equal(isOfflineReceiveError('Failed to receive ecash: error sending request for url (https://mint.example/v1/keys): dns error'), true);
  assert.equal(isOfflineReceiveError('connection refused'), true);
  assert.equal(isOfflineReceiveError('Tokens are already spent and could not be recovered'), false);
  assert.equal(isOfflineReceiveError('Cannot unlock P2PK ecash: invalid key'), false);
  assert.equal(isOfflineReceiveError('Wallet is locked'), false);
});
