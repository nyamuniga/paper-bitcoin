import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('./momo-saved-transfers-contract.tsx', import.meta.url));
function checkContract(example) {
  const source = `import { MomoSavedTransfers } from '../src/features/momo/MomoSavedTransfers';
    const saved = [{ id: 'saved-topup', direction: 'RWF_TO_SATS', rwfAmount: 1000 }] as const;
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

test('saved Mobile Money rows need only readonly ID, direction, amount and a selection callback', () => {
  assert.deepEqual(checkContract('<MomoSavedTransfers saved={saved} onResume={id => { id.toUpperCase(); }} />;'), []);
});
test('saved Mobile Money rows require data and an explicit resume callback', () => {
  const errors = checkContract('<MomoSavedTransfers saved={saved} />; <MomoSavedTransfers onResume={() => {}} />;').join('\n');
  assert.match(errors, /onResume.*missing/);
  assert.match(errors, /saved.*missing/);
});
test('saved Mobile Money rows use string transaction IDs', () => {
  const errors = checkContract('<MomoSavedTransfers saved={[{id:1,direction:"RWF_TO_SATS",rwfAmount:1000}]} onResume={() => {}} />; <MomoSavedTransfers saved={saved} onResume={(id:number) => {}} />;').join('\n');
  assert.match(errors, /number.*string/);
  assert.match(errors, /string.*number/);
});
test('saved Mobile Money presentation cannot own foreground state or execute payments', () => {
  const fields = ['activeTransaction', 'setActiveTransaction', 'onConfirm', 'onPay'];
  const errors = checkContract(fields.map(field => `<MomoSavedTransfers saved={saved} onResume={() => {}} ${field}={null} />;`).join('\n')).join('\n');
  for (const field of fields) assert.match(errors, new RegExp(`Property '${field}' does not exist`));
});
