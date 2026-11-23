import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('./momo-review-contract.tsx', import.meta.url));
function checkContract(example) {
  const source = `import { MomoReview, type MomoReviewProps } from '../src/features/momo/MomoReview';
    import { buildMomoReview } from '../src/services/momoReview';
    const review = buildMomoReview({ direction: 'SATS_TO_RWF', amount: 1000, phone: '0780000000',
      mint: 'https://fixture.invalid', rate: 1, spread: .01, fixedFee: 10, networkReserve: 5 });
    const props: MomoReviewProps = { cashout: true, review, validation: '', error: null };
    ${example}`;
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

test('Mobile Money review accepts a complete review snapshot and feedback', () => {
  assert.deepEqual(checkContract('<MomoReview {...props} />;'), []);
});
test('Mobile Money review requires non-null reviewed details', () => {
  const errors = checkContract('<MomoReview cashout validation="" error={null} />; <MomoReview {...props} review={null} />;').join('\n');
  assert.match(errors, /review.*missing/);
  assert.match(errors, /null.*not assignable/);
});
test('Mobile Money review rejects draft entry and editing callbacks', () => {
  const fields = ['amount', 'phone', 'mint', 'onAmount', 'onPhone', 'onMint'];
  const errors = checkContract(fields.map(field => `<MomoReview {...props} ${field}={null} />;`).join('\n')).join('\n');
  for (const field of fields) assert.match(errors, new RegExp(`Property '${field}' does not exist`));
});
test('Mobile Money review leaves confirmation, submission and saved transfers in its parent', () => {
  const fields = ['onConfirm', 'submitting', 'loadingRate', 'valid', 'onReview', 'saved', 'onResume'];
  const errors = checkContract(fields.map(field => `<MomoReview {...props} ${field}={null} />;`).join('\n')).join('\n');
  for (const field of fields) assert.match(errors, new RegExp(`Property '${field}' does not exist`));
});
