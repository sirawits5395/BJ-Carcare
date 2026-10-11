import assert from 'node:assert/strict';
import {parseStaffReply,eligibleForPoints,plateKey,provinceKey} from './lib/wash-rewards.ts';
for(const [input,kind,amount,payment] of [
 ['250','wash',250,'transfer'],
 ['สด450','wash',450,'cash'],
 ['เงินสด 250','wash',250,'cash'],
 ['999','promo_sale',999,'transfer'],
 ['สด699','promo_sale',699,'cash'],
 ['1999','promo_sale',1999,'transfer'],
 ['VIP','membership_sale',null,'none'],
 ['ฟรี','free_wash',null,'none'],
 ['ติดฟิล์ม 2500','other',2500,'transfer'],
 ['เคลือบแก้ว 500','other',500,'transfer'],
 ['เคลือบแก้ว 3500','other',3500,'transfer'],
 ['ซักเบาะ 3500 สด','other',3500,'cash'],
 ['ซักพรม','other',null,'none'],
 ['ขัดไฟ','other',null,'none'],
 ['อบโอโซน','other',null,'none']
]) {
 const parsed=parseStaffReply(input);
 assert.equal(parsed.type,kind,input+' type');
 assert.equal(parsed.amount,amount,input+' amount');
 assert.equal(parsed.payment,payment,input+' payment');
}
assert.equal(eligibleForPoints('wash',false),true);
assert.equal(eligibleForPoints('free_wash',false),false);
assert.equal(eligibleForPoints('free_wash',true),true);
assert.equal(eligibleForPoints('promo_sale',true),false);
assert.equal(plateKey('2 กท-3145'),'2กท3145');
assert.equal(provinceKey('กรุงเทพมหานคร'),'กรุงเทพมหานคร');
console.log('Wash rewards text rules passed');
