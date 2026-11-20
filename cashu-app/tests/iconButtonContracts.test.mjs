import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('./icon-button-contract.tsx', import.meta.url));
function checkContract(example) {
  const source = `import { IconButton } from '../src/components/shared/IconButton';\n${example}`;
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

test('icon buttons accept a named icon, native attributes, event types and button refs', () => {
  assert.deepEqual(checkContract(`
    import { createRef } from 'react';
    <IconButton type="button" aria-label="Copy token" title="Copy" disabled ref={createRef<HTMLButtonElement>()}
      onClick={event => event.currentTarget.focus()} aria-describedby="hint"><svg aria-hidden="true" /></IconButton>;
    <IconButton type="submit" aria-label="Save" form="contact" name="action" value="save"><svg /></IconButton>;
    <IconButton type="reset" aria-label="Reset"><svg /></IconButton>;
  `), []);
});
test('icon buttons require an explicit accessible label even when a title exists', () => {
  assert.match(checkContract('<IconButton type="button" title="Copy"><svg /></IconButton>').join('\n'), /aria-label/);
});
test('icon buttons require an explicit native button type', () => {
  assert.match(checkContract('<IconButton aria-label="Copy"><svg /></IconButton>').join('\n'), /type/);
});
test('icon buttons require an icon element rather than visible text or missing content', () => {
  assert.match(checkContract('<IconButton type="button" aria-label="Copy" />').join('\n'), /children/);
  assert.match(checkContract('<IconButton type="button" aria-label="Copy">Copy</IconButton>').join('\n'), /children/);
});
test('icon buttons reject invalid button types and feature-specific props', () => {
  assert.match(checkContract('<IconButton type="link" aria-label="Copy"><svg /></IconButton>').join('\n'), /link/);
  assert.match(checkContract('<IconButton type="button" aria-label="Copy" copied><svg /></IconButton>').join('\n'), /copied/);
});
