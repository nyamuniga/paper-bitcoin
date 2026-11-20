import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/native-wallet-responses.json', import.meta.url), 'utf8'),
);
const sendErrors = JSON.parse(
  readFileSync(new URL('./fixtures/send-ecash-errors.json', import.meta.url), 'utf8'),
);
const sourcePath = fileURLToPath(new URL('./wallet-contract-check.ts', import.meta.url));

function checkContract(value, errors = sendErrors) {
  const source = `
    import type { WalletInfoResponse, WalletTransactionSummary } from '../src/types/wallet';
    import type { SendEcashError } from '../src/types/sendEcash';
    const fixture = ${JSON.stringify(value)} as const;
    const walletInfo: readonly WalletInfoResponse[] = fixture.wallet_info;
    const transactions: readonly WalletTransactionSummary[] = fixture.transactions;
    const errors = ${JSON.stringify(errors)} as const;
    const sendErrors: readonly SendEcashError[] = errors;
  `;
  const options = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, ...args) => file === sourcePath
    ? ts.createSourceFile(file, source, options.target, true)
    : getSourceFile(file, ...args);

  const program = ts.createProgram([sourcePath], options, host);
  return ts.getPreEmitDiagnostics(program)
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

test('native wallet, transaction and send-error fixtures satisfy the frontend contracts', () => {
  assert.deepEqual(checkContract(fixture), []);
});

test('wallet contract rejects a renamed required native balance field', () => {
  const changed = structuredClone(fixture);
  changed.wallet_info[1].balanceSats = changed.wallet_info[1].balance_sats;
  delete changed.wallet_info[1].balance_sats;
  assert.match(checkContract(changed).join('\n'), /'balance_sats' is missing/);
});

test('transaction contract rejects a renamed native timestamp field', () => {
  const changed = structuredClone(fixture);
  changed.transactions[0].created_at = changed.transactions[0].timestamp;
  delete changed.transactions[0].timestamp;
  assert.match(checkContract(changed).join('\n'), /'timestamp' is missing/);
});

test('transaction contract rejects a status outside the native enum', () => {
  const changed = structuredClone(fixture);
  changed.transactions[0].status = 'Completed';
  assert.match(checkContract(changed).join('\n'), /Type '"Completed"' is not assignable/);
});

test('send-error contract rejects an unsupported native code', () => {
  const changed = structuredClone(sendErrors);
  changed[0].code = 'UNSUPPORTED';
  assert.match(checkContract(fixture, changed).join('\n'), /Type '"UNSUPPORTED"' is not assignable/);
});

test('send-error contract requires a nullable transaction ID field', () => {
  const changed = structuredClone(sendErrors);
  delete changed[0].tx_id;
  assert.match(checkContract(fixture, changed).join('\n'), /'tx_id' is missing/);
});
