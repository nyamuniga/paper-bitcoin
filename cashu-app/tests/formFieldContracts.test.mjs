import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('./form-field-contract.tsx', import.meta.url));
function checkContract(example) {
  const source = `import { FormField, type FormFieldControlProps } from '../src/components/shared/FormField';\n${example}`;
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

test('form fields compose native inputs, textareas, grouped actions and input refs', () => {
  assert.deepEqual(checkContract(`
    import { createRef } from 'react';
    <FormField id="phone" label="Phone number" hint="Local number" error="Check this number" describedBy="external"
      className="field" labelClassName="label" hintClassName="hint" errorClassName="error">
      {control => <div><input {...control} type="tel" ref={createRef<HTMLInputElement>()} autoComplete="tel-national"
        onChange={event => event.currentTarget.focus()} /><button type="button">Contacts</button></div>}
    </FormField>;
    <FormField label="Pay to" hint={null} error={null}>{control => <textarea {...control} rows={3} disabled required />}</FormField>;
  `), []);
});
test('form fields require a visible label', () => {
  assert.match(checkContract('<FormField>{control => <input {...control} />}</FormField>').join('\n'), /label/);
});
test('form fields require a render callback to attach the control attributes', () => {
  assert.match(checkContract('<FormField label="Phone" />').join('\n'), /children/);
  assert.match(checkContract('<FormField label="Phone"><input /></FormField>').join('\n'), /children|assignable/);
});
test('control attributes have a required string id and native ARIA-compatible types', () => {
  assert.deepEqual(checkContract(`
    const renderControl = (control: FormFieldControlProps) => {
      const id: string = control.id;
      const description: string | undefined = control['aria-describedby'];
      const invalid: true | undefined = control['aria-invalid'];
      return <input id={id} aria-describedby={description} aria-invalid={invalid} />;
    };
    <FormField label="Phone">{renderControl}</FormField>;
  `), []);
});
test('form fields reject invalid message types and feature-specific props', () => {
  assert.match(checkContract('<FormField label="Phone" error={false}>{control => <input {...control} />}</FormField>').join('\n'), /boolean/);
  assert.match(checkContract('<FormField label="Phone" isBitcoin>{control => <input {...control} />}</FormField>').join('\n'), /isBitcoin/);
});
test('form fields require the callback to return an element', () => {
  assert.match(checkContract('<FormField label="Phone">{() => "Phone"}</FormField>').join('\n'), /ReactElement|assignable/);
});
