import {env} from 'cloudflare:workers';
import {db,bucket,fail} from '@/lib/server';
import {lineConfig} from '@/lib/line-config';
import {verifySignature} from '@/lib/line-core';
import {customerClaimHash,customerClaimToken} from '@/lib/customer-claim';

const IMAGE_LIMIT=5*1024*1024;
type LineEvent={type:string;timestamp:number;replyToken?:string;source?:{type?:string;userId?:string};message?:{type?:string;id?:string;contentProvider?:{type?:string}}};
function userId(value:unknown):value is string{return typeof value==='string'&&/^U[0-9a-f]{32}$/.test(value)}
async function replyClaimLink(replyToken:string,token:string,accessToken:string,liffId:string){
 const claimUrl='https://liff.line.me/'+encodeURIComponent(liffId)+'?claim='+encodeURIComponent(token);
 const response=await fetch('https://api.line.me/v2/bot/message/reply',{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({replyToken,messages:[{type:'text',text:'BJ Carcare รับรูปสลิปแล้วครับ ✅\nเพื่อให้ร้านตรวจและบันทึกคะแนน กรุณากดยืนยันทะเบียนรถภายใน 24 ชั่วโมง\n'+claimUrl+'\nการส่งรูปยังไม่ใช่การยืนยันว่าเงินเข้าบัญชีแล้ว'}]}),signal:AbortSignal.timeout(8000)});
 return response.ok;
}
async function captureCustomerSlip(event:LineEvent,ownerId:string,secret:string,token:string,liffId:string){
 const user=event.source?.userId,messageId=event.message?.id,replyToken=event.replyToken;
 if(event.source?.type!=='user'||!userId(user)||!messageId||!replyToken||!Number.isSafeInteger(event.timestamp)||event.message?.contentProvider?.type==='external')return;
 const existing=await db().prepare('SELECT reply_sent_at FROM customer_slip_claims WHERE source_message_id=? AND owner=?').bind(messageId,ownerId).first<{reply_sent_at:string|null}>();
 if(existing){if(!existing.reply_sent_at){const claimToken=await customerClaimToken(secret,messageId);if(await replyClaimLink(replyToken,claimToken,token,liffId))await db().prepare('UPDATE customer_slip_claims SET reply_sent_at=? WHERE source_message_id=? AND owner=? AND reply_sent_at IS NULL').bind(new Date().toISOString(),messageId,ownerId);else console.warn('customer_slip_reply_retry_failed')}return}
 const imageResponse=await fetch('https://api-data.line.me/v2/bot/message/'+encodeURIComponent(messageId)+'/content',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(9000)});
 if(!imageResponse.ok)return;
 const mime=(imageResponse.headers.get('content-type')||'image/jpeg').split(';')[0];
 if(!['image/jpeg','image/png','image/webp'].includes(mime)||Number(imageResponse.headers.get('content-length')||0)>IMAGE_LIMIT)return;
 const bytes=new Uint8Array(await imageResponse.arrayBuffer());
 if(!bytes.length||bytes.length>IMAGE_LIMIT)return;
 const claimToken=await customerClaimToken(secret,messageId),tokenHash=await customerClaimHash(claimToken),claimId=crypto.randomUUID();
 const imageKey='customer-slips/'+ownerId+'/'+messageId;
 await bucket().put(imageKey,bytes,{httpMetadata:{contentType:mime}});
 const created=Date.now(),expires=new Date(created+24*60*60*1000).toISOString();
 const inserted=await db().prepare("INSERT OR IGNORE INTO customer_slip_claims(id,owner,line_user_id,source_message_id,token_hash,image_key,status,created_at,expires_at) VALUES(?,?,?,?,?,?,'pending',?,?)")
  .bind(claimId,ownerId,user,messageId,tokenHash,imageKey,new Date(created).toISOString(),expires).run();
 if(!inserted.meta.changes)return;
 const replied=await replyClaimLink(replyToken,claimToken,token,liffId);
 if(replied)await db().prepare('UPDATE customer_slip_claims SET reply_sent_at=? WHERE id=?').bind(new Date().toISOString(),claimId);
 else console.warn('customer_slip_reply_failed');
}
export async function POST(req:Request){
 try{
  const c=lineConfig(),runtime=env as Cloudflare.Env;
  if(!c.secret)return new Response('Not configured',{status:503});
  if(Number(req.headers.get('content-length')||0)>1024*1024)return new Response('Too large',{status:413});
  const raw=await req.text();
  if(raw.length>1024*1024)return new Response('Too large',{status:413});
  if(!await verifySignature(raw,req.headers.get('x-line-signature'),c.secret))return new Response('Invalid signature',{status:401});
  const data=JSON.parse(raw) as {events?:LineEvent[]};
  if(!Array.isArray(data.events)||data.events.length>100)return new Response('Invalid events',{status:400});
  const statements=[];
  for(const event of data.events){
   if(['follow','unfollow'].includes(event.type)&&userId(event.source?.userId)&&Number.isSafeInteger(event.timestamp)){
    statements.push(db().prepare('INSERT INTO line_contacts(user_id,blocked,event_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET blocked=excluded.blocked,event_at=excluded.event_at WHERE excluded.event_at>line_contacts.event_at').bind(event.source!.userId!,event.type==='unfollow'?1:0,event.timestamp));
   }else if(event.type==='message'&&event.message?.type==='image'&&c.ownerId&&c.secret&&c.token&&runtime.LINE_LIFF_ID){
    await captureCustomerSlip(event,c.ownerId,c.secret,c.token,runtime.LINE_LIFF_ID);
   }
  }
  if(statements.length)await db().batch(statements);
  return Response.json({ok:true});
 }catch(e){return fail(e)}
}
