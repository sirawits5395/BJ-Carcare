import assert from 'node:assert/strict';
import {schedule,addMonths} from './lib/care.ts';
for(const y of [1,2,3]){const s=schedule('2026-01-31',y);assert.equal(s.length,y*4);assert.deepEqual(s.filter(v=>v.kind==='recoat').map(v=>v.month),y===1?[]:y===2?[12]:[12,24]);assert.equal(s.at(-1).month,y*12);assert.equal(s.at(-1).kind,'check');assert.equal(s[0].due,'2026-04-30');assert.equal(s[1].due,'2026-07-31')}
assert.equal(addMonths('2023-11-30',3),'2024-02-29');assert.equal(addMonths('2024-11-30',3),'2025-02-28');assert.throws(()=>schedule('2026-02-30',3));assert.throws(()=>schedule('2026-01-01',4));console.log('PASS: 1Y/2Y/3Y rounds, Recoat exclusions, end-of-month, leap year, invalid dates.');
