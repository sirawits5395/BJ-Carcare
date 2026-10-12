import assert from 'node:assert/strict';
import {createReceiptSvg} from './lib/receipt-template.ts';

const base = {
 receiptNo:'RC-2026-0001', issueDate:'2026-10-12', paidDate:'2026-10-12',
 buyerName:'ทดสอบ & <script>', buyerAddress:'กรุงเทพมหานคร', plate:'1กข 1234', province:'กรุงเทพมหานคร',
 items:[{description:'Car Wash XXL',quantity:1,unitPrice:340}],
 paymentMethod:'transfer', paymentReference:'TEST-ONLY-REF',
 verifiedByOwner:true, verifiedJobId:'test-job-1',
};
const svg=createReceiptSvg(base);
assert.match(svg,/ใบเสร็จรับเงิน/);
assert.match(svg,/340.00 บาท/);
assert.match(svg,/ไม่ใช่ใบกำกับภาษี/);
assert.doesNotMatch(svg,/<script>/);
assert.match(svg,/&amp; &lt;script&gt;/);
assert.doesNotMatch(svg,/VAT 7%|ใบกำกับภาษีอย่างย่อ/);
assert.throws(()=>createReceiptSvg({...base,verifiedByOwner:false}),/PAYMENT_NOT_VERIFIED/);
assert.throws(()=>createReceiptSvg({...base,verifiedJobId:''}),/PAYMENT_NOT_VERIFIED/);
assert.throws(()=>createReceiptSvg({...base,items:[]}),/RECEIPT_ITEMS_INVALID/);
assert.match(createReceiptSvg({...base,paymentMethod:'cash'}),/เงินสด \(Cash\)/);
console.log('Receipt template checks passed.');
