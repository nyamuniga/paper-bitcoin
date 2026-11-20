import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('./payment-page-layout-contract.tsx', import.meta.url));
function checkContract(example) {
  const source = `import { PaymentPageLayout } from '../src/components/shared/PaymentPageLayout';\n${example}`;
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

test('payment layouts compose header, body and optional footer with native main attributes', () => {
  assert.deepEqual(checkContract(`
    <PaymentPageLayout id="page" aria-labelledby="title" bodyLabel="Review details"
      header={<h1 id="title">Review</h1>} footer={<button type="button">Continue</button>}
      className="caller-page" bodyClassName="caller-body" onKeyDown={event => event.currentTarget.focus()}>
      <p>Caller-owned details</p>
    </PaymentPageLayout>;
    <PaymentPageLayout header={<h1>Empty state</h1>} bodyLabel="Details" footer={null}>{null}</PaymentPageLayout>;
  `), []);
});
test('payment layouts require a header, body slot and accessible scroll-region name', () => {
  assert.match(checkContract('<PaymentPageLayout bodyLabel="Details">Body</PaymentPageLayout>').join('\n'), /header/);
  assert.match(checkContract('<PaymentPageLayout header={<h1>Title</h1>} bodyLabel="Details" />').join('\n'), /children/);
  assert.match(checkContract('<PaymentPageLayout header={<h1>Title</h1>}>Body</PaymentPageLayout>').join('\n'), /bodyLabel/);
});
test('payment layouts reject workflow switches and payment callbacks', () => {
  assert.match(checkContract('<PaymentPageLayout header={<h1>Title</h1>} bodyLabel="Details" isMomo>Body</PaymentPageLayout>').join('\n'), /isMomo/);
  assert.match(checkContract('<PaymentPageLayout header={<h1>Title</h1>} bodyLabel="Details" onPay={() => {}}>Body</PaymentPageLayout>').join('\n'), /onPay/);
});
test('payment layout slots accept composed content without rendering callbacks', () => {
  assert.deepEqual(checkContract(`
    <PaymentPageLayout header={<><h1>Title</h1><button type="button">Back</button></>}
      bodyLabel="Details" footer={false}><input aria-label="Value" /></PaymentPageLayout>;
  `), []);
  assert.match(checkContract('<PaymentPageLayout header={<h1>Title</h1>} bodyLabel="Details">{() => "Body"}</PaymentPageLayout>').join('\n'), /assignable/);
});
