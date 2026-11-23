import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath=fileURLToPath(new URL('./bitcoin-send-lifecycle-contract.tsx',import.meta.url));
function check(example){
  const source=`import {useBitcoinSend,type BitcoinSendOptions} from '../src/features/bitcoin/useBitcoinSend';
    const options:BitcoinSendOptions={active:true,mintUrl:'https://fixture.invalid',availableBalance:10000,busy:false,limits:null,
      initialInvoice:'',initialAmountSats:undefined,readClipboard:async()=>'',readValidation:()=>({status:'idle',params:null,domain:null,error:null}),
      resolveLnurl:async()=>({params:null,error:'Invalid'}),fetchInvoice:async()=>({pr:'lnbc1fixture'}),
      payInvoice:async()=>true,estimate:async()=>null,execute:async()=>null,
      onError:message=>{message.toUpperCase();},recordSuccessfulUse:(type,value)=>{type.toUpperCase();value.toUpperCase();}};
    ${example}`;
  const options={strict:true,noEmit:true,skipLibCheck:true,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,types:[],allowImportingTsExtensions:true};
  const host=ts.createCompilerHost(options),read=host.getSourceFile.bind(host);
  host.getSourceFile=(file,...args)=>file===sourcePath?ts.createSourceFile(file,source,options.target,true,ts.ScriptKind.TSX):read(file,...args);
  return ts.getPreEmitDiagnostics(ts.createProgram([sourcePath,fileURLToPath(new URL('../src/vite-env.d.ts',import.meta.url))],options,host)).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'));
}
test('Bitcoin send lifecycle accepts injected ports and explicit transitions',()=>{
  assert.deepEqual(check(`function Consumer(){const send=useBitcoinSend(options);send.changeDestination('fixture@example.test');send.changeAmount('3000');send.back();send.reset();send.cancel();void send.nextInput();void send.nextAmount();void send.payLightning();void send.confirm();void send.retry();send.dismissPayment();return null;}`),[]);
});
test('Bitcoin send lifecycle requires payment, estimate and validation boundaries',()=>{
  const fields=['payInvoice','estimate','execute','readValidation','readClipboard'];
  const errors=check(fields.map(field=>`{const {${field},...missing}=options;useBitcoinSend(missing);}`).join('\n')).join('\n');
  for(const field of fields)assert.match(errors,new RegExp(field));
});
test('Bitcoin send lifecycle rejects untyped provider results',()=>{
  const errors=check('useBitcoinSend({...options,estimate:async()=>({amount:3000})});useBitcoinSend({...options,execute:async()=>({id:"wrong"})});').join('\n');
  assert.match(errors,/ark_fee|cashu_fee|total_cost/);assert.match(errors,/txid/);
});
test('Bitcoin send lifecycle exposes actions instead of writable transition or quote setters',()=>{
  const errors=check('function Consumer(){const send=useBitcoinSend(options);send.setStep("confirm");send.setEstimate(null);send.changeAmount(3000);return null;}').join('\n');
  for(const field of ['setStep','setEstimate','number'])assert.match(errors,new RegExp(field));
});
