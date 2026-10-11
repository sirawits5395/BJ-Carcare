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
 {status:'closed',service_type:'wash',payment_method:'transfer',amount:250,opened_at:'2026-10-11T02:00:00.000Z',closed_at:'2026-10-11T03:00:00.000Z',reply_id:'r1'},
 {status:'needs_review',service_type:'promo_sale',payment_method:'cash',amount:999,opened_at:'2026-10-11T04:00:00.000Z',closed_at:'2026-10-11T06:00:00.000Z',reply_id:'r2'},
 {status:'open',service_type:'unknown',payment_method:'none',amount:null,opened_at:'2026-10-11T04:05:00.000Z',closed_at:null,reply_id:null},
 {status:'closed',service_type:'free_wash',payment_method:'none',amount:null,opened_at:'2026-10-11T05:00:00.000Z',closed_at:'2026-10-11T07:00:00.000Z',reply_id:'r3'},
 {status:'excluded',service_type:'wash',payment_method:'transfer',amount:100,opened_at:'2026-10-11T05:00:00.000Z',closed_at:'2026-10-11T06:00:00.000Z',reply_id:'r4'},
 {status:'closed',service_type:'wash',payment_method:'transfer',amount:300,opened_at:'2026-10-10T15:00:00.000Z',closed_at:'2026-10-11T01:00:00.000Z',reply_id:'r5'}
];
const s=summarizeWashDay(day,rows);
assert.equal(s.arrivals,4);
assert.equal(s.closedArrivals,3);
assert.equal(s.waiting,1);
assert.equal(s.needsReview,1);
assert.equal(s.closedToday,4);
assert.equal(s.paidWashes,2);
assert.equal(s.freeWashes,1);
assert.equal(s.promoSales,1);
assert.equal(s.cash,999);
assert.equal(s.transfer,550);
assert.equal(s.total,1549);
assert.match(formatWashSummary(s),/1,549/);
console.log('PASS: report timezone, commands, photos, closed payments and exclusions');
