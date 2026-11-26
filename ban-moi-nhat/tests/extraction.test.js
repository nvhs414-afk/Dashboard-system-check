import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDocument,sourceType} from '../src/extraction.js';

function sheet(rows) {
  return {name:'PL',kind:'sheet',rows:rows.map((row,r)=>({index:r+1,cells:row.map((value,col)=>({
    text:String(value),col,number:typeof value==='number'?value:undefined,ref:String.fromCharCode(65+col)+(r+1)
  })).filter(c=>c.text)}))};
}
function scan(rows,type='packing') {return extractDocument(type,[sheet(rows)]);}
test('A shifted TOTAL is recovered only when all detail sums confirm it',()=>{
  const header=['Quantity','Net Weight','Gross Weight','Unit'];
  const values=scan([['Packing List'],header,[100,1000,1200,'PCS'],[200,2000,2400,'PCS'],['TOTAL',300,3000,3600]]);
  assert.deepEqual([values.plQty.value,values.plNet.value,values.plGross.value],['300','3000','3600']);
  assert.match(values.plGross.choices[0].where,/D5$/);
  const unknown=scan([header,['TOTAL',300,3000,3600]]);
  for(const k of ['plQty','plNet','plGross'])assert.equal(unknown[k].conflict,true);
});
test('Column order, repeated headings and subtotal rows preserve the shipment totals',()=>{
  const header=['Item','Gross Wt. (KG)','Qty (PCS)','N.W. (KG)'];
  const d=scan([header,['a',140,3,110],['Page Total',140,3,110],header,['b',60,2,40]]);
  assert.deepEqual([d.plUnit.value,d.plQty.value,d.plGross.value,d.plNet.value],['PCS','5','200','150']);
});
test('Mixed units and inconsistent totals require review',()=>{
  const mixed=scan([['Item','Qty','Unit','Net Wt (lb)'],['a',2,'PCS',10],['b',1,'CARTON',20]]);
  assert.equal(mixed.plQty.value,'');
  assert.equal(mixed.plQty.conflict,true);
  assert.ok(Math.abs(Number(mixed.plNet.value)-13.6077711)<0.00001);
  const totals=scan([['Item','Qty','Gross Weight'],['a',2,30],['b',1,20],['Grand Total',3,55]]);
  assert.equal(totals.plQty.value,'3');
  assert.deepEqual(totals.plGross.choices.map(c=>c.value).sort(),['50','55']);
  assert.equal(totals.plGross.value,'');
});
test('Party boxes and paired identifiers populate only their own fields',()=>{
  const a=scan([['Shipper','Atlas Logistics Ltd','Consignee','Demo Pacific LLC'],['Container / Seal No.','TSTU1234567 / SL0099']]);
  assert.deepEqual([a.plExporter.value,a.plImporter.value,a.plContainer.value,a.plSeal.value],['Atlas Logistics Ltd','Demo Pacific LLC','TSTU1234567','SL0099']);
  const d=scan([['Người xuất khẩu'],['Mã','0109999912'],['Tên','Demo Logistics Ltd'],['Mã phân loại kiểm tra','3']],'customs');
  assert.equal(d.decExporter.value,'Demo Logistics Ltd');
  assert.equal(d.decChannel.value,'Đỏ');
});
test('A booking reference on a bill and a company suffix do not create extra document types',()=>{
  assert.equal(sourceType('DEMO10000001 bill.pdf','BILL OF LADING\nBooking no. QA275383783'),'bl');
  assert.equal(sourceType('Demo Co., Ltd. booking.pdf','Booking No.: QA1500'),'booking');
  assert.equal(sourceType('BCTT39','Định mức SXXK\nInvoice No.: QA1500'),'other');
});
test('PDF page subtotals resolve only against a corroborated final total',()=>{
  const page=(n,rows)=>({...sheet(rows),kind:'pdf',name:'Trang '+n,page:n});
  const head=['Item','Qty (PCS)','Net weight'];
  const first=page(1,[head,['a',2,100]]);
  const end=page(2,[head,['b',3,150],['Grand Total',5,250]]);
  const data=extractDocument('packing',[first,end]);
  assert.equal(data.plQty.value,'5');assert.equal(data.plNet.value,'250');
  const ambiguous=extractDocument('packing',[first,page(2,[head,['b',2,100]])]);
  assert.equal(ambiguous.plNet.conflict,true);
});
test('A separately declared foreign currency is withheld from the USD field',()=>{
  const d=scan([['Invoice currency','EUR'],['Total amount',1900]],'invoice');
  assert.equal(d.invoiceValue.value,'');assert.match(d.invoiceValue.issue,/EUR/);
});
