import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath=fileURLToPath(new URL('./bitcoin-receive-lifecycle-contract.tsx',import.meta.url));
function check(example){
  const source=`import {useBitcoinReceive,type BitcoinReceiveOptions} from '../src/features/bitcoin/useBitcoinReceive';
    const options:BitcoinReceiveOptions={active:true,mintUrl:'https://fixture.invalid',busy:false,limits:null,transactions:[],
      receiveLightning:async(amount,mint)=>({quoteId:mint,receiveInvoice:String(amount)}),
      receiveOnChain:async(amount,mint)=>({boardingAddress:mint,amountSats:amount,estimatedFeeSats:0}),
      copyText:async text=>Boolean(text),onCopied:type=>{type.toUpperCase();},onCopyError:()=>{},
      onRequestError:error=>{String(error);},onReceived:amount=>{amount?.toFixed();},onReset:()=>{}};
    ${example}`;
  const options={strict:true,noEmit:true,skipLibCheck:true,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,types:[]};
  const host=ts.createCompilerHost(options),read=host.getSourceFile.bind(host);
  host.getSourceFile=(file,...args)=>file===sourcePath?ts.createSourceFile(file,source,options.target,true,ts.ScriptKind.TSX):read(file,...args);
  return ts.getPreEmitDiagnostics(ts.createProgram([sourcePath],options,host)).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'));
}
test('Bitcoin receive lifecycle accepts typed provider/read/copy boundaries',()=>{
  assert.deepEqual(check(`function Consumer(){const receive=useBitcoinReceive(options);receive.changeMode('onchain');receive.changeAmount('3000');receive.cancel();receive.reset();void receive.request();void receive.copy('invoice');return null;}`),[]);
});
test('Bitcoin receive lifecycle requires current context and explicit side-effect callbacks',()=>{
  const errors=check('const {mintUrl,onReceived,copyText,...missing}=options; useBitcoinReceive(missing);').join('\n');
  for(const field of ['mintUrl','onReceived','copyText'])assert.match(errors,new RegExp(field));
});
test('Bitcoin receive lifecycle requires provider result shapes',()=>{
  const errors=check('useBitcoinReceive({...options,receiveLightning:async()=>({invoice:"wrong"})}); useBitcoinReceive({...options,receiveOnChain:async()=>({address:"wrong"})});').join('\n');
  assert.match(errors,/receiveInvoice|quoteId/);assert.match(errors,/boardingAddress/);
});
test('Bitcoin receive lifecycle exposes entry actions without raw quote setters',()=>{
  const errors=check(`function Consumer(){const receive=useBitcoinReceive(options);receive.changeMode('liquid');receive.changeAmount(3000);receive.setQuoteId('old');return null;}`).join('\n');
  assert.match(errors,/liquid/);assert.match(errors,/number.*string/);assert.match(errors,/setQuoteId/);
});
