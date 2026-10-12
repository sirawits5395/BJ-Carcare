import assert from 'node:assert/strict';
import {verifySignature} from './lib/line-core.ts';
import {lineMessageUsage} from './lib/line-usage.ts';
import {verifyStaffChannelIdentity} from './lib/staff-channel.ts';

const secret='staging-test-secret',body=JSON.stringify({events:[]});
const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body));
const encoded=btoa(String.fromCharCode(...new Uint8Array(signature)));
assert.equal(await verifySignature(body,encoded,secret),true);
assert.equal(await verifySignature(body+' ',encoded,secret),false);
assert.equal(await verifySignature(body,null,secret),false);
let calls=0;
const usage=await lineMessageUsage('test-token',async url=>{
 calls++;
 return String(url).endsWith('/quota')?Response.json({type:'limited',value:2000}):Response.json({totalUsage:31});
});
assert.deepEqual(usage,{state:'available',quotaType:'limited',quota:2000,consumed:31});
assert.equal(calls,2);
assert.equal((await lineMessageUsage('')).state,'unavailable');
const staffFetch=async url=>String(url).includes('/oauth2/')?Response.json({client_id:'staging-channel'}):Response.json({displayName:'BJ Carcare Test',basicId:'@bjcaretest'});
assert.deepEqual(await verifyStaffChannelIdentity('staging-token','staging-channel','BJ Carcare Test','@bjcaretest',staffFetch),{channelId:true,account:true,displayName:'BJ Carcare Test',basicId:'@bjcaretest'});
assert.deepEqual(await verifyStaffChannelIdentity('staging-token','wrong-channel','BJ Carcare Test','@bjcaretest',staffFetch),{channelId:false,account:false,displayName:'',basicId:''});
assert.equal((await verifyStaffChannelIdentity('staging-token','staging-channel','BJ Carcare AI','@445qplae',staffFetch)).account,false);
console.log('PASS: LINE signature validation and message quota status (mocked, no network)');
