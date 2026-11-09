import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeEcashRequests } from '../src/services/ecashRequestHistory.ts';
const request={id:'invoice-1',amount:100,mint:'https://mint.example',description:'Coffee',created_at:200,status:'pending'};
const older={id:'send-1',amount:50,fee:1,status:'Success',timestamp:100,mint_url:request.mint,tx_type:{Send:{}}};
test('requests share the time-sorted activity feed with transactions and carry a stable request identity',()=>{
 const rows=mergeEcashRequests([older],[request]);
 assert.equal(rows.length,2);assert.equal(rows[0].timestamp,200);
 assert.equal(rows[0].tx_type.EcashRequest.id,request.id);assert.equal(rows[0].status,'Pending');
 assert.equal(rows[0].mint_url,request.mint);assert.equal(rows[0].amount,100);
 assert.equal(rows[1].id,older.id);
});
test('paid requests merge into their real receipt instead of appearing twice or showing a double inflow',()=>{
 const receipt={...older,id:'receive-1',timestamp:300,tx_type:{ReceiveEcash:{invoice_id:request.id}}};
 const rows=mergeEcashRequests([older,receipt],[{...request,status:'paid'}]);
 assert.equal(rows.length,2);assert.equal(rows[0].id,receipt.id);
});
test('unclaimed payments stay pending and a paid request remains visible if its receipt was not returned',()=>{
 const pending=mergeEcashRequests([],[{...request,status:'received'}]);
 assert.equal(pending[0].status,'Pending');assert.equal(pending[0].tx_type.EcashRequest.status,'received');
 assert.equal(mergeEcashRequests([],[{...request,status:'paid'}])[0].status,'Success');
});
test('unclaimed request payments stay one activity row while the native receive is pending or failed',()=>{
 for(const status of ['Pending','Failed']){
  const receipt={...older,id:'receive-1',status,tx_type:{ReceiveEcash:{invoice_id:request.id}}};
  const rows=mergeEcashRequests([receipt],[{...request,status:'received'}]);
  assert.equal(rows.length,1);assert.equal(rows[0].tx_type.EcashRequest.id,request.id);
 }
});
