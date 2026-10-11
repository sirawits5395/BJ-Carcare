import assert from 'node:assert/strict';
import {bangkokDate,bangkokDateRange,reportCommand,summarizeWashDay,formatWashSummary} from './lib/wash-report.ts';
const day='2026-10-11';
assert.equal(bangkokDate('2026-10-10T17:05:00.000Z'),day);
assert.deepEqual(bangkokDateRange(day),['2026-10-10T17:00:00.000Z','2026-10-11T17:00:00.000Z']);
assert.equal(reportCommand('สรุปยอด',day),day);
assert.equal(reportCommand('#ยอดวันนี้',day),day);
assert.equal(reportCommand('สรุปยอดเมื่อวาน',day),'2026-10-10');
assert.equal(reportCommand('สรุปยอด 2026-10-05',day),'2026-10-05');
assert.equal(reportCommand('สวัสดี',day),null);
const rows=[
 {status:'closed',service_type:'wash',payment_method:'transfer',amount:250,owner_verified:1,opened_at:'2026-10-11T02:00:00.000Z',closed_at:'2026-10-11T03:00:00.000Z',reply_id:'r1'},
 {status:'needs_review',service_type:'promo_sale',payment_method:'cash',amount:999,owner_verified:0,opened_at:'2026-10-11T04:00:00.000Z',closed_at:'2026-10-11T06:00:00.000Z',reply_id:'r2'},
 {status:'open',service_type:'unknown',payment_method:'none',amount:null,owner_verified:0,opened_at:'2026-10-11T04:05:00.000Z',closed_at:null,reply_id:null},
 {status:'closed',service_type:'free_wash',payment_method:'none',amount:null,owner_verified:0,opened_at:'2026-10-11T05:00:00.000Z',closed_at:'2026-10-11T07:00:00.000Z',reply_id:'r3'},
 {status:'excluded',service_type:'wash',payment_method:'transfer',amount:100,owner_verified:0,opened_at:'2026-10-11T05:00:00.000Z',closed_at:'2026-10-11T06:00:00.000Z',reply_id:'r4'},
 {status:'closed',service_type:'wash',payment_method:'transfer',amount:300,owner_verified:0,opened_at:'2026-10-10T15:00:00.000Z',closed_at:'2026-10-11T01:00:00.000Z',reply_id:'r5'},
 {status:'needs_review',service_type:'wash',payment_method:'none',amount:null,owner_verified:0,opened_at:'2026-10-11T04:00:00.000Z',closed_at:'2026-10-11T06:00:00.000Z',reply_id:'r6'}
];
const s=summarizeWashDay(day,rows);
assert.equal(s.arrivals,5);
assert.equal(s.closedArrivals,2);
assert.equal(s.waiting,1);
assert.equal(s.needsReview,2);
assert.equal(s.unverifiedPayments,1);
assert.equal(s.closedToday,3);
assert.equal(s.paidWashes,2);
assert.equal(s.freeWashes,1);
assert.equal(s.promoSales,0);
assert.equal(s.cash,0);
assert.equal(s.transfer,550);
assert.equal(s.total,550);
assert.equal(s.paidWashes,2);
assert.match(formatWashSummary(s),/550/);
console.log('PASS: report timezone, commands, photos, closed payments and exclusions');
