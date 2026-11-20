import { createElement } from 'react';
export * from './bitcoinMintPicker.boundaries';

const query = new URLSearchParams(location.search);
export const destinationFixture = {reads: 0, errors: [] as string[]};
export const readClipboardText = async () => {
  destinationFixture.reads++;
  if(query.has('clipboard-error'))throw new Error('Synthetic clipboard failure');
  if(query.has('clipboard-empty'))return '';
  return query.has('clipboard-onchain') ? '  bc1q'+'a'.repeat(38)+'  ' : '  fixture@example.test  ';
};
export const writeClipboardText = async () => {throw new Error('Clipboard writes are outside this fixture');};
export const toast = {error: (message: string) => destinationFixture.errors.push(message), success: () => {}};
const params = {callback:'https://lnurl.example.test',minSendable:1000,maxSendable:100000000};
export const useLnurlValidation = (input: string | null) => ({
  status: input ? query.get('validation') || 'valid' : 'idle', params,
  domain:'example.test', error:'Synthetic address validation failure.',
});
export function Scanner({onScan,onError}: {onScan: (results: {rawValue:string}[]) => void; onError: (error: Error) => void}) {
  return createElement('div',{id:'fixture-scanner'},
    createElement('button',{id:'scan-result',type:'button',onClick:()=>onScan([{rawValue:'fixture@example.test'}])},'Deliver synthetic scan'),
    createElement('button',{id:'scan-error',type:'button',onClick:()=>onError(new Error('Synthetic camera failure.'))},'Report synthetic camera error'));
}
