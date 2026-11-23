import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('./momo-entry-contract.tsx', import.meta.url));
const entry = `const entry: MomoEntryFormProps = {
  cashout: false, amount: '1000', phone: '0780000000', mint: 'https://fixture.invalid', balances: {},
  onAmount: value => { value.toUpperCase(); }, onPhone: value => { value.toUpperCase(); },
  onMint: value => { value.toUpperCase(); }, onAddressBook: () => {},
  validation: '', error: null, maxAmount: 1000, rateUnavailable: false, onRefreshRate: () => {},
};`;

function checkContract(example) {
  const source = `import { MomoEntryForm, type MomoEntryFormProps } from '../src/features/momo/MomoEntryForm';\n${entry}\n${example}`;
  const options = {
    strict: true, noEmit: true, skipLibCheck: true, jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, types: [],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, ...args) => file === sourcePath
    ? ts.createSourceFile(file, source, options.target, true, ts.ScriptKind.TSX)
    : getSourceFile(file, ...args);
  return ts.getPreEmitDiagnostics(ts.createProgram([sourcePath], options, host))
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

test('Mobile Money entry accepts only controlled entry values and actions', () => {
  assert.deepEqual(checkContract('<MomoEntryForm {...entry} />;'), []);
});
test('Mobile Money entry requires its values and entry callbacks', () => {
  const errors = checkContract(`
    const { amount, onPhone, onRefreshRate, ...missing } = entry;
    <MomoEntryForm {...missing} />;
  `).join('\n');
  for (const field of ['amount', 'onPhone', 'onRefreshRate']) assert.match(errors, new RegExp(field));
});
test('Mobile Money entry rejects review, confirmation and saved-transfer state', () => {
  const fields = ['review', 'submitting', 'onConfirm', 'onReview', 'saved', 'onResume'];
  const errors = checkContract(fields.map(field => `<MomoEntryForm {...entry} ${field}={null} />;`).join('\n')).join('\n');
  for (const field of fields) assert.match(errors, new RegExp(`Property '${field}' does not exist`));
});
test('Mobile Money entry rejects numeric input and provider execution callbacks', () => {
  const errors = checkContract('<MomoEntryForm {...entry} amount={1000} />; <MomoEntryForm {...entry} onPay={() => {}} />;').join('\n');
  assert.match(errors, /number.*string/);
  assert.match(errors, /Property 'onPay' does not exist/);
});
