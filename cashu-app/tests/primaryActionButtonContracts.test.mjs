import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('./primary-action-contract.tsx', import.meta.url));

function checkContract(example) {
  const source = `
    import { PrimaryActionButton } from '../src/components/shared/PrimaryActionButton';
    ${example}
  `;
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

test('primary actions accept visible text, named composed content and native button props', () => {
  assert.deepEqual(checkContract(`
    <PrimaryActionButton type="button" disabled loading onClick={event => event.currentTarget.focus()}>Confirming…</PrimaryActionButton>;
    <PrimaryActionButton type="submit" aria-label="Review transfer" form="transfer" name="action" value="review"><span aria-hidden="true">→</span>Review transfer</PrimaryActionButton>;
  `), []);
});
test('primary actions require an explicit native button type', () => {
  assert.match(checkContract('<PrimaryActionButton>Review</PrimaryActionButton>').join('\n'), /type/);
});
test('primary actions require label content', () => {
  assert.match(checkContract('<PrimaryActionButton type="button" />').join('\n'), /children/);
});
test('composed primary-action content requires an explicit accessible name', () => {
  assert.match(checkContract('<PrimaryActionButton type="button"><span>Review</span></PrimaryActionButton>').join('\n'), /aria-label/);
});
test('primary actions reject invalid button types and nonboolean loading state', () => {
  assert.match(checkContract('<PrimaryActionButton type="link">Review</PrimaryActionButton>').join('\n'), /link/);
  assert.match(checkContract('<PrimaryActionButton type="button" loading="yes">Review</PrimaryActionButton>').join('\n'), /boolean/);
});
