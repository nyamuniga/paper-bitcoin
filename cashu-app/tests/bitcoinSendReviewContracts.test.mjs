import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('./bitcoin-send-review-contract.tsx', import.meta.url));
function checkContract(example) {
  const source = `import { BitcoinSendReview, BitcoinSendConfirmation, type BitcoinSendReviewProps } from '../src/features/bitcoin/BitcoinSendReview';
    const props: BitcoinSendReviewProps = {
      page:true, mintUrl:'https://fixture.invalid', destination:'bc1qfixture', amountSats:3000,
      networkFeeSats:17, mintFeeSats:5, totalSats:3022, onBack:()=>{},
      confirmation:<BitcoinSendConfirmation paying={false} onConfirm={()=>{}} />,
    };
    ${example}`;
  const options = {
    strict:true, noEmit:true, skipLibCheck:true, jsx:ts.JsxEmit.ReactJSX,
    target:ts.ScriptTarget.ES2020, module:ts.ModuleKind.ESNext,
    moduleResolution:ts.ModuleResolutionKind.Bundler, types:[],
  };
  const host=ts.createCompilerHost(options), getSourceFile=host.getSourceFile.bind(host);
  host.getSourceFile=(file,...args)=>file===sourcePath ? ts.createSourceFile(file,source,options.target,true,ts.ScriptKind.TSX) : getSourceFile(file,...args);
  return ts.getPreEmitDiagnostics(ts.createProgram([sourcePath],options,host)).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'));
}

test('Bitcoin send review accepts explicit display values and supplied confirmation',()=>{
  assert.deepEqual(checkContract('<BitcoinSendReview {...props} />;'),[]);
});
test('Bitcoin send review requires destination, amounts, fees and navigation/confirmation',()=>{
  const fields=['destination','amountSats','networkFeeSats','mintFeeSats','totalSats','onBack','confirmation'];
  const errors=checkContract(fields.map(field=>`{const {${field},...missing}=props; <BitcoinSendReview {...missing} />;}`).join('\n')).join('\n');
  for(const field of fields)assert.match(errors,new RegExp(field));
});
test('Bitcoin send confirmation requires a busy flag and explicit confirmation callback',()=>{
  const errors=checkContract('<BitcoinSendConfirmation paying={false} />; <BitcoinSendConfirmation onConfirm={()=>{}} />; <BitcoinSendConfirmation paying={false} onConfirm="send" />;').join('\n');
  for(const field of ['paying','onConfirm','string'])assert.match(errors,new RegExp(field));
});
test('Bitcoin send review rejects transport estimates, clients and untyped display amounts',()=>{
  const fields=['estimate','executeOnChain','walletStore'];
  const errors=checkContract(fields.map(field=>`<BitcoinSendReview {...props} ${field}={null} />;`).join('\n')+'<BitcoinSendReview {...props} amountSats="3000" />;').join('\n');
  for(const field of fields)assert.match(errors,new RegExp(`Property '${field}' does not exist`));
  assert.match(errors,/string.*number/);
});
