import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('./bitcoin-destination-entry-contract.tsx', import.meta.url));
function checkContract(example) {
  const source = `import { BitcoinDestinationEntry, type BitcoinDestinationEntryProps } from '../src/features/bitcoin/BitcoinDestinationEntry';
    const props: BitcoinDestinationEntryProps = {
      page:true, value:'', scannerVisible:false, scanner:<span>Scanner</span>,
      parsedInput:{type:'invalid',addressOrInvoice:'',amountSats:null},
      lnurlValidation:{status:'idle',params:null,domain:null,error:null},
      insufficientBalance:false, lnurlInput:false, lnurlBlocked:false,
      paying:false, fetchingInvoice:false, minOnchainSats:2500,
      onChange:value=>{value.toUpperCase();}, onOpenScanner:()=>{}, onCloseScanner:()=>{},
      onOpenAddressBook:()=>{}, onPaste:()=>{}, onPayInvoice:()=>{}, onNext:()=>{},
    };
    ${example}`;
  const options = {strict:true,noEmit:true,skipLibCheck:true,jsx:ts.JsxEmit.ReactJSX,
    target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,types:[]};
  const host=ts.createCompilerHost(options), read=host.getSourceFile.bind(host);
  host.getSourceFile=(file,...args)=>file===sourcePath?ts.createSourceFile(file,source,options.target,true,ts.ScriptKind.TSX):read(file,...args);
  return ts.getPreEmitDiagnostics(ts.createProgram([sourcePath],options,host)).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'));
}
test('Bitcoin destination entry accepts supplied validation, scanner content and typed UI actions',()=>{
  assert.deepEqual(checkContract('<BitcoinDestinationEntry {...props} />;'),[]);
});
test('Bitcoin destination entry requires change, paste, scanner, address-book and submit actions',()=>{
  const actions=['onChange','onPaste','onOpenScanner','onCloseScanner','onOpenAddressBook','onPayInvoice','onNext'];
  const errors=checkContract(actions.map(name=>`{ const {${name},...missing}=props; <BitcoinDestinationEntry {...missing} />; }`).join('\n')).join('\n');
  for(const name of actions)assert.match(errors,new RegExp(name));
});
test('Bitcoin destination entry rejects malformed destination and validation contracts',()=>{
  const errors=checkContract(`<BitcoinDestinationEntry {...props} parsedInput={{type:'liquid',addressOrInvoice:'',amountSats:null}} />;
    <BitcoinDestinationEntry {...props} lnurlValidation={{status:'unknown',params:null,domain:null,error:null}} />;
    <BitcoinDestinationEntry {...props} onChange={(value:number)=>{}} />;`).join('\n');
  for(const word of ['liquid','unknown','number'])assert.match(errors,new RegExp(word));
});
test('Bitcoin destination entry does not accept clipboard, provider, wallet or routing clients',()=>{
  const fields=['readClipboardText','payInvoice','walletStore','navigate'];
  const errors=checkContract(fields.map(field=>`<BitcoinDestinationEntry {...props} ${field}={null} />;`).join('\n')).join('\n');
  for(const field of fields)assert.match(errors,new RegExp(`Property '${field}' does not exist`));
});
