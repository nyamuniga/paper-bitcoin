import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('./bottom-sheet-contract.tsx', import.meta.url));
function checkContract(example) {
  const source = `import { BottomSheet } from '../src/components/shared/BottomSheet';\n${example}`;
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

test('bottom sheets accept one accessible name and composable close/drag controls', () => {
  assert.deepEqual(checkContract(`
    <BottomSheet aria-label="Receive" onClose={() => {}} className="caller-panel">
      {({close, closeButtonProps, dragHandleProps, isClosing}) => <>
        <div {...dragHandleProps}>Drag</div>
        <button {...closeButtonProps}>Close</button>
        <button type="button" disabled={isClosing} onClick={close}>Done</button>
      </>}
    </BottomSheet>;
    <BottomSheet aria-labelledby="sheet-title" aria-describedby="description" onClose={() => {}}>
      {() => <h2 id="sheet-title">Details</h2>}
    </BottomSheet>;
  `), []);
});
test('bottom sheets require a name and reject conflicting name sources', () => {
  assert.match(checkContract('<BottomSheet onClose={() => {}}>{() => null}</BottomSheet>').join('\n'), /aria-label|aria-labelledby/);
  assert.match(checkContract('<BottomSheet aria-label="Name" aria-labelledby="title" onClose={() => {}}>{() => null}</BottomSheet>').join('\n'), /assignable/);
});
test('bottom sheets require a close callback and a content render callback', () => {
  assert.match(checkContract('<BottomSheet aria-label="Name">{() => null}</BottomSheet>').join('\n'), /onClose/);
  assert.match(checkContract('<BottomSheet aria-label="Name" onClose={() => {}}><p>Content</p></BottomSheet>').join('\n'), /assignable/);
});
test('bottom sheets accept focus refs and explicit dismissal/suspension policy', () => {
  assert.deepEqual(checkContract(`
    import { createRef } from 'react';
    const initialFocusRef = createRef<HTMLInputElement>();
    const returnFocusRef = createRef<HTMLButtonElement>();
    <BottomSheet aria-label="Name" onClose={() => {}} dismissible={false} suspended
      initialFocusRef={initialFocusRef} returnFocusRef={returnFocusRef}>
      {() => <input ref={initialFocusRef} />}
    </BottomSheet>;
  `), []);
});
test('bottom sheets do not accept payment state or workflow callbacks', () => {
  assert.match(checkContract('<BottomSheet aria-label="Name" onClose={() => {}} paying>{() => null}</BottomSheet>').join('\n'), /paying/);
  assert.match(checkContract('<BottomSheet aria-label="Name" onClose={() => {}} onPay={() => {}}>{() => null}</BottomSheet>').join('\n'), /onPay/);
});
