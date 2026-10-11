import assert from 'node:assert/strict';
import {customerClaimHash,customerClaimToken} from './lib/customer-claim.ts';

const first=await customerClaimToken('channel-secret-test','message-1');
const repeat=await customerClaimToken('channel-secret-test','message-1');
const other=await customerClaimToken('channel-secret-test','message-2');
assert.equal(first,repeat,'webhook redelivery must resolve the same claim link');
assert.notEqual(first,other,'each source message must get a different link');
assert.equal(first.length,43,'claim token has 256 bits of entropy');
assert.equal(await customerClaimHash(first),await customerClaimHash(repeat));
assert.notEqual(await customerClaimHash(first),first,'database stores a token hash, not the usable token');
console.log('PASS: customer claim link determinism, per-message uniqueness and token hashing');
