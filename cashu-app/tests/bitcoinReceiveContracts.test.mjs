import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('./bitcoin-receive-contract.tsx', import.meta.url));
function checkContract(example) {
  const source = `import { BitcoinReceive, type BitcoinReceiveProps } from '../src/features/bitcoin/BitcoinReceive';
    const props: BitcoinReceiveProps = {
      success:false, invoice:null, address:null, mode:'lightning', amount:'', amountSats:0,
      mintUrl:'https://fixture.invalid', depositSats:null, feeEstimateSats:null,
      copied:false, copiedType:null, requesting:false, requestDisabled:true,
      minOnchainSats:2500, maxOnchainSats:100000000,
      onDone:()=>{}, onInvoiceBack:()=>{}, onAddressBack:()=>{}, onRequest:()=>{},
      onModeChange: mode=>{mode.toUpperCase();}, onAmountChange: value=>{value.toUpperCase();},
      onCopy:(value,type)=>{value.toUpperCase();type?.toUpperCase();}, onTrackAddress: address=>{address.toUpperCase();},
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

test('Bitcoin receive accepts supplied display values and typed UI actions',()=>{
  assert.deepEqual(checkContract('<BitcoinReceive {...props} />;'),[]);
});
test('Bitcoin receive requires request, mode and amount actions',()=>{
  const errors=checkContract('const {onRequest,onModeChange,onAmountChange,...missing}=props; <BitcoinReceive {...missing} />;').join('\n');
  for(const field of ['onRequest','onModeChange','onAmountChange'])assert.match(errors,new RegExp(field));
});
test('Bitcoin receive restricts its mode to Lightning or on-chain',()=>{
  assert.match(checkContract('<BitcoinReceive {...props} mode="liquid" />;').join('\n'),/liquid.*not assignable/);
});
test('Bitcoin receive does not accept transport clients, quote tracking or wallet stores',()=>{
  const fields=['receiveLightning','receiveOnChain','quoteId','transactions','walletStore'];
  const errors=checkContract(fields.map(field=>`<BitcoinReceive {...props} ${field}={null} />;`).join('\n')).join('\n');
  for(const field of fields)assert.match(errors,new RegExp(`Property '${field}' does not exist`));
});
