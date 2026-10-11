import {env} from 'cloudflare:workers';
import {db,bucket} from '@/lib/server';
import {eligibleForPoints,parseStaffReply,plateKey,provinceKey,type WashType} from '@/lib/wash-rewards';
import {bangkokDate,bangkokDateRange,formatWashSummary,reportCommand,summarizeWashDay,type WashJobReportRow} from '@/lib/wash-report';

type GroupEvent={type:string;timestamp:number;replyToken?:string;source?:{type?:string;groupId?:string;userId?:string};message?:{type:string;id:string;quotedMessageId?:string;text?:string;contentProvider?:{type:string}}};
export type StaffImageQueueMessage={owner:string;groupId:string;event:GroupEvent};
type WashJobRow={image_id:string;owner:string;group_id:string;status:string;analysis_status:string;duplicate_of:string|null;service_type:WashType;payment_method:string;amount:number|null;member_id:string|null;owner_verified:number;reply_id:string|null;reply_text:string|null;reply_at:string|null;closed_at:string|null;revision:number};
type RewardPolicyRow={enabled:number;points_per_wash:number;include_free:number};
type RewardAwardRow={member_id:string;points:number;active:number};
type EntitlementRow={id:string;status:string;valid_from:string;expires_at:string;redeemed_job_id:string|null;member_id:string};
type OpenAiReply={choices?:Array<{message?:{content?:string|null}}>};
const config=()=>env as Cloudflare.Env;
const stamp=(ms:number)=>new Date(ms).toISOString();
const now=()=>new Date().toISOString();
const safeText=(s:unknown,max=100)=>typeof s==='string'?s.trim().slice(0,max):'';
const imageLimit=5*1024*1024;
interface PlateRead {plate:string;province:string;brand:string;model:string;color:string;confidence:number}

async function imageFromLine(id:string):Promise<{bytes:Uint8Array;mime:string}|null>{
  const token=safeText(config().BJ_STAFF_LINE_CHANNEL_ACCESS_TOKEN,4096);
  if(!token)return null;
  const result=await fetch('https://api-data.line.me/v2/bot/message/'+encodeURIComponent(id)+'/content',{
    headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});
  if(!result.ok){if(result.status===429||result.status>=500)throw Error('LINE image content temporarily unavailable');return null}
  const mime=(result.headers.get('content-type')||'image/jpeg').split(';')[0];
  if(!['image/jpeg','image/png','image/webp'].includes(mime))return null;
  if(Number(result.headers.get('content-length')||0)>imageLimit)return null;
  const bytes=new Uint8Array(await result.arrayBuffer());
  if(bytes.length>imageLimit||!bytes.length)return null;
  return {bytes,mime};
}
function toBase64(bytes:Uint8Array):string{
  const parts:string[]=[];
  for(let i=0;i<bytes.length;i+=16384)parts.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
  return btoa(parts.join(''));
}
async function readPlate(bytes:Uint8Array,mime:string):Promise<PlateRead|null>{
  const apiKey=safeText(config().OPENAI_API_KEY,4096);
  if(!apiKey)return null;
  const result=await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({
      model:safeText(config().BJ_PLATE_MODEL,80)||'gpt-4.1-mini',
      response_format:{type:'json_object'},temperature:0,max_tokens:220,
      messages:[{role:'system',content:'Read the vehicle in the image without guessing. Return JSON with plate, province, brand, model, color (Thai strings) and confidence from 0 to 100. If plate or province is uncertain set its string to empty and confidence below 90. Never invent characters. Identify only the principal centered car.'},
      {role:'user',content:[{type:'text',text:'Extract only clearly visible vehicle details and Thai registration plate.'},{type:'image_url',image_url:{url:'data:'+mime+';base64,'+toBase64(bytes)}}]}]
    }),signal:AbortSignal.timeout(20000)
  });
  if(!result.ok){if(result.status===429||result.status>=500)throw Error('Plate recognition temporarily unavailable');return null}
  const payload=await result.json() as OpenAiReply;
  try{
    const v=JSON.parse(payload.choices?.[0]?.message?.content||'{}');
    return {plate:safeText(v.plate,30),province:safeText(v.province,60),brand:safeText(v.brand,50),model:safeText(v.model,70),color:safeText(v.color,40),confidence:Math.max(0,Math.min(100,Number(v.confidence)||0))};
  }catch{return null}
}
async function findMember(owner:string,plate:string,province:string):Promise<string|null>{
  if(!plate||!province)return null;
  const entries=await db().prepare('SELECT id FROM reward_members WHERE owner=? AND plate_key=? AND province_key=? AND active=1 LIMIT 2').bind(owner,plateKey(plate),provinceKey(province)).all<{id:string}>();
  return entries.results.length===1?entries.results[0].id:null;
}
export async function syncWashAward(jobId:string,reason:string):Promise<void>{
  const job=await db().prepare('SELECT * FROM wash_jobs WHERE image_id=?').bind(jobId).first<WashJobRow>();
  if(!job)return;
  await syncPromoEntitlement(job);
  const policy=await db().prepare('SELECT * FROM reward_policies WHERE owner=?').bind(job.owner).first<RewardPolicyRow>();
  const existing=await db().prepare('SELECT * FROM reward_awards WHERE job_image_id=?').bind(jobId).first<RewardAwardRow>();
  const paid=Number.isSafeInteger(Number(job.amount))&&Number(job.amount)>0&&['cash','transfer'].includes(job.payment_method);
  const qualifies=!!job.member_id&&!job.duplicate_of&&job.owner_verified===1&&job.status==='closed'&&paid&&eligibleForPoints(job.service_type,policy?.include_free===1);
  if(existing?.active===1&&!qualifies){
    const at=now(),event=crypto.randomUUID();
    await db().batch([
      db().prepare('UPDATE reward_awards SET active=0,updated_at=? WHERE job_image_id=? AND active=1').bind(at,jobId),
      db().prepare('INSERT INTO reward_audit(id,event_key,owner,member_id,job_image_id,points_delta,reason,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),event,job.owner,existing.member_id,jobId,-existing.points,reason,at)
    ]);
    return;
  }
  if(!qualifies||policy?.enabled!==1)return;
  if(existing?.active===1)return;
  if(existing&&existing.member_id!==job.member_id)return; // requires owner review before reassignment
  if(existing){
    const at=now(),event=crypto.randomUUID();
    await db().batch([
      db().prepare('UPDATE reward_awards SET active=1,updated_at=? WHERE job_image_id=? AND owner=? AND member_id=? AND active=0').bind(at,jobId,job.owner,job.member_id),
      db().prepare('INSERT INTO reward_audit(id,event_key,owner,member_id,job_image_id,points_delta,reason,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),event,job.owner,job.member_id,jobId,existing.points,reason,at)
    ]);
    return;
  }
  const points=Number(policy.points_per_wash);
  if(!Number.isInteger(points)||points<1||points>1000)return;
  const at=now(),event=crypto.randomUUID();
  await db().batch([
    db().prepare("INSERT OR IGNORE INTO reward_awards(job_image_id,owner,member_id,points,active,created_at,updated_at) SELECT ?,?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM wash_jobs WHERE image_id=? AND owner=? AND status='closed' AND amount>0 AND payment_method IN ('cash','transfer'))").bind(jobId,job.owner,job.member_id,points,at,at,jobId,job.owner),
    db().prepare('INSERT INTO reward_audit(id,event_key,owner,member_id,job_image_id,points_delta,reason,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),event,job.owner,job.member_id,jobId,points,reason,at)
  ]);
}
async function syncPromoEntitlement(job:WashJobRow){
 const qualifies=!!job.member_id&&!job.duplicate_of&&job.owner_verified===1&&job.status==='closed'&&job.service_type==='promo_sale'&&[699,999,1999].includes(Number(job.amount))&&['cash','transfer'].includes(job.payment_method);
 const existing=await db().prepare('SELECT id,status,valid_from,expires_at,redeemed_job_id FROM reward_entitlements WHERE source_job_id=? AND owner=?').bind(job.image_id,job.owner).first<EntitlementRow>();
 if(!qualifies&&existing?.status==='active'&&!existing.redeemed_job_id){
  const at=now();await db().batch([
   db().prepare("UPDATE reward_entitlements SET status='cancelled',updated_at=? WHERE id=? AND status='active' AND redeemed_job_id IS NULL").bind(at,existing.id),
   db().prepare("INSERT INTO reward_entitlement_audit(id,owner,entitlement_id,job_image_id,action,reason,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1").bind(crypto.randomUUID(),job.owner,existing.id,job.image_id,'cancelled','รายการขายโปรถูกแก้ไขหรือยกเลิก',at)
  ]);return;
 }
 if(!qualifies)return;
 const start=job.closed_at||now(),expires=new Date(Date.parse(start)+7*24*60*60*1000).toISOString(),at=now();
 if(!existing){
  const id=crypto.randomUUID();await db().batch([
   db().prepare("INSERT OR IGNORE INTO reward_entitlements(id,owner,member_id,source_job_id,benefit,status,valid_from,expires_at,created_at,updated_at) VALUES(?,?,?,?,'free_wash','active',?,?,?,?)").bind(id,job.owner,job.member_id,job.image_id,start,expires,at,at),
   db().prepare("INSERT INTO reward_entitlement_audit(id,owner,entitlement_id,job_image_id,action,reason,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1").bind(crypto.randomUUID(),job.owner,id,job.image_id,'created','โปร 699/999/1999: สิทธิล้างฟรี 1 ครั้งภายใน 7 วัน',at)
  ]);return;
 }
 if(existing.status==='cancelled'&&!existing.redeemed_job_id){
  await db().batch([
   db().prepare("UPDATE reward_entitlements SET member_id=?,status='active',valid_from=?,expires_at=?,updated_at=? WHERE id=? AND status='cancelled' AND redeemed_job_id IS NULL").bind(job.member_id,start,expires,at,existing.id),
   db().prepare("INSERT INTO reward_entitlement_audit(id,owner,entitlement_id,job_image_id,action,reason,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1").bind(crypto.randomUUID(),job.owner,existing.id,job.image_id,'reactivated','ยืนยันรายการขายโปรอีกครั้ง',at)
  ]);
 }else if(existing.status==='active'&&!existing.redeemed_job_id&&existing.member_id!==job.member_id){
  await db().batch([
   db().prepare("UPDATE reward_entitlements SET member_id=?,updated_at=? WHERE id=? AND status='active' AND redeemed_job_id IS NULL").bind(job.member_id,at,existing.id),
   db().prepare("INSERT INTO reward_entitlement_audit(id,owner,entitlement_id,job_image_id,action,reason,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1").bind(crypto.randomUUID(),job.owner,existing.id,job.image_id,'member_changed','แก้รถสมาชิกที่ซื้อโปร',at)
  ]);
 }
}
export async function redeemFreeWash(job:WashJobRow,replyId:string,replyText:string,when:string,expectedRevision=job.revision):Promise<boolean>{
 if(!job.member_id)return false;
 const entitlement=await db().prepare("SELECT id FROM reward_entitlements WHERE owner=? AND member_id=? AND status='active' AND valid_from<=? AND expires_at>? ORDER BY expires_at LIMIT 1").bind(job.owner,job.member_id,when,when).first<{id:string}>();
 if(!entitlement)return false;
 const at=now(),result=await db().batch([
  db().prepare("UPDATE wash_jobs SET status='closed',service_type='free_wash',payment_method='none',amount=NULL,reply_id=?,reply_text=?,reply_at=?,closed_at=?,updated_at=?,revision=revision+1 WHERE image_id=? AND owner=? AND group_id=? AND member_id=? AND duplicate_of IS NULL AND status<>'excluded' AND revision=? AND (reply_at IS NULL OR reply_at<=?) AND EXISTS(SELECT 1 FROM reward_entitlements WHERE id=? AND status='active' AND valid_from<=? AND expires_at>?)").bind(replyId,replyText,when,when,at,job.image_id,job.owner,job.group_id,job.member_id,expectedRevision,when,entitlement.id,when,when),
  db().prepare("UPDATE reward_entitlements SET status='redeemed',redeemed_job_id=?,updated_at=? WHERE id=? AND status='active' AND valid_from<=? AND expires_at>? AND EXISTS(SELECT 1 FROM wash_jobs WHERE image_id=? AND status='closed' AND reply_id=? AND member_id=? AND revision=?)").bind(job.image_id,at,entitlement.id,when,when,job.image_id,replyId,job.member_id,expectedRevision+1),
  db().prepare("INSERT INTO reward_entitlement_audit(id,owner,entitlement_id,job_image_id,action,reason,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1").bind(crypto.randomUUID(),job.owner,entitlement.id,job.image_id,'redeemed','ยืนยันใช้สิทธิล้างฟรีจากโปรโมชัน',at),
  db().prepare("INSERT INTO wash_job_audit(id,owner,image_id,actor,action,before_json,after_json,reason,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1").bind(crypto.randomUUID(),job.owner,job.image_id,job.owner,'redeem_free_wash',JSON.stringify({status:job.status}),JSON.stringify({status:'closed',service_type:'free_wash'}),'ปิดงานด้วยสิทธิโปรโมชัน',at)
 ]);
 return !!result[0].meta.changes&&!!result[1].meta.changes;
}
async function handleReport(e:GroupEvent,owner:string,group:string):Promise<boolean>{
 const m=e.message;
 const date=m?.type==='text'?reportCommand(m.text||'',bangkokDate()):null;
 if(!date)return false;
 // Only an explicitly authorized staff group can request sales figures; optional staff user allowlist.
 const c=config(),users=safeText(c.BJ_STAFF_REPORT_USER_IDS,4000).split(',').map(s=>s.trim()).filter(Boolean);
 if(users.length&&!users.includes(e.source?.userId||''))return true;
 const replyToken=safeText(e.replyToken,200);
 if(!replyToken)return true;
 let start:string,end:string;
 try{[start,end]=bangkokDateRange(date)}catch{return true}
 const recent=await db().prepare(
   "SELECT status,service_type,payment_method,amount,owner_verified,opened_at,closed_at,reply_id FROM wash_jobs WHERE owner=? AND group_id=? AND (opened_at>=? AND opened_at<? OR closed_at>=? AND closed_at<?)"
 ).bind(owner,group,start,end,start,end).all<WashJobReportRow>();
 const report=formatWashSummary(summarizeWashDay(date,recent.results));
 const command=await db().prepare('INSERT OR IGNORE INTO line_staff_command_events(message_id,group_id,created_at) VALUES(?,?,?)').bind(m!.id,group,now()).run();
 if(!command.meta.changes)return true;
 const result=await fetch('https://api.line.me/v2/bot/message/reply',{
   method:'POST',
   headers:{Authorization:'Bearer '+safeText(c.BJ_STAFF_LINE_CHANNEL_ACCESS_TOKEN,4096),'Content-Type':'application/json'},
   body:JSON.stringify({replyToken,messages:[{type:'text',text:report}]}),
   signal:AbortSignal.timeout(9000)
 });
 if(!result.ok)console.warn('staff_report_reply_failed',result.status);
 return true;
}
function validStaffImage(e:GroupEvent,owner:string,group:string){
  return config().BJ_WASH_BOT_ENABLED==='true'&&!!owner&&group===config().BJ_STAFF_LINE_GROUP_ID&&e.source?.type==='group'&&e.type==='message'&&e.message?.type==='image'&&!!e.message.id&&Number.isSafeInteger(e.timestamp)&&e.message.contentProvider?.type!=='external';
}
export async function queueStaffImage(e:GroupEvent){
  const c=config(),owner=safeText(c.BJ_OWNER_ID,200),group=safeText(e.source?.groupId,100),queue=c.BJ_WASH_QUEUE as Queue<StaffImageQueueMessage>|undefined;
  if(!validStaffImage(e,owner,group))return;
  if(!queue)throw new Response('Staff image queue is not configured',{status:503});
  const id=e.message!.id,when=stamp(e.timestamp);
  const inserted=await db().prepare("INSERT OR IGNORE INTO wash_jobs(image_id,owner,group_id,status,analysis_status,opened_at,updated_at) VALUES(?,?,?,'open','queued',?,?)").bind(id,owner,group,when,now()).run();
  if(!inserted.meta.changes){
    const existing=await db().prepare('SELECT analysis_status FROM wash_jobs WHERE image_id=? AND owner=? AND group_id=?').bind(id,owner,group).first<{analysis_status:string}>();
    if(existing?.analysis_status!=='queued')return;
  }
  await queue.send({owner,groupId:group,event:e});
}
async function handleImage(e:GroupEvent,owner:string,group:string){
  const id=e.message!.id;
  const current=now(),staleBefore=new Date(Date.now()-5*60_000).toISOString();
  const claim=await db().prepare("UPDATE wash_jobs SET analysis_status='processing',updated_at=? WHERE image_id=? AND owner=? AND group_id=? AND (analysis_status='queued' OR (analysis_status='processing' AND updated_at<=?))").bind(current,id,owner,group,staleBefore).run();
  if(!claim.meta.changes){
    const state=await db().prepare('SELECT analysis_status FROM wash_jobs WHERE image_id=? AND owner=?').bind(id,owner).first<{analysis_status:string}>();
    if(state?.analysis_status==='processing'||state?.analysis_status==='queued')throw Error('Staff image analysis is still in progress');
    return;
  }
  try{
    const image=await imageFromLine(id);
    if(!image){await db().prepare("UPDATE wash_jobs SET status=CASE WHEN reply_id IS NULL THEN 'needs_review' ELSE status END,analysis_status='failed',updated_at=? WHERE image_id=? AND owner=? AND analysis_status='processing'").bind(now(),id,owner).run();return}
    const key='wash/'+owner+'/'+id;
    await bucket().put(key,image.bytes,{httpMetadata:{contentType:image.mime}});
    const digestInput=new Uint8Array(image.bytes.length);digestInput.set(image.bytes);
    const imageSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',digestInput.buffer))).map(v=>v.toString(16).padStart(2,'0')).join('');
    const duplicate=await db().prepare('SELECT image_id FROM wash_jobs WHERE owner=? AND image_sha256=? AND image_id<>? LIMIT 1').bind(owner,imageSha256,id).first<{image_id:string}>();
    if(duplicate){
      await db().prepare("UPDATE wash_jobs SET image_key=?,image_sha256=?,duplicate_of=?,status='needs_review',analysis_status='complete',updated_at=? WHERE image_id=? AND owner=?").bind(key,imageSha256,duplicate.image_id,now(),id,owner).run();
      return;
    }
    const ocr=await readPlate(image.bytes,image.mime);
    const memberId=ocr&&ocr.confidence>=90?await findMember(owner,ocr.plate,ocr.province):null;
    await db().prepare("UPDATE wash_jobs SET image_key=?,image_sha256=?,plate=?,province=?,brand=?,model=?,color=?,plate_confidence=?,member_id=?,analysis_status='complete',status=CASE WHEN status='excluded' THEN 'excluded' WHEN reply_id IS NOT NULL AND ? IS NOT NULL AND service_type<>'unknown' AND service_type<>'free_wash' AND amount>0 AND payment_method IN ('cash','transfer') THEN 'closed' WHEN reply_id IS NOT NULL THEN 'needs_review' WHEN ? IS NULL THEN 'needs_review' ELSE 'open' END,closed_at=CASE WHEN reply_id IS NOT NULL AND ? IS NOT NULL AND service_type<>'unknown' AND service_type<>'free_wash' AND amount>0 AND payment_method IN ('cash','transfer') THEN COALESCE(closed_at,reply_at) ELSE NULL END,updated_at=? WHERE image_id=? AND owner=?")
      .bind(key,imageSha256,ocr?.plate||null,ocr?.province||null,ocr?.brand||null,ocr?.model||null,ocr?.color||null,ocr?.confidence||0,memberId,memberId,memberId,memberId,now(),id,owner).run();
    if(memberId)await syncWashAward(id,'Recognized member after LINE photo');
  }catch{
    await db().prepare("UPDATE wash_jobs SET analysis_status='queued',updated_at=? WHERE image_id=? AND owner=? AND analysis_status='processing'").bind(now(),id,owner).run();
    throw Error('Staff image analysis failed');
  }
}
async function handleText(e:GroupEvent,owner:string,group:string){
  const m=e.message!,quoted=safeText(m.quotedMessageId,100);
  if(!quoted)return;
  let job=await db().prepare('SELECT * FROM wash_jobs WHERE image_id=? AND owner=? AND group_id=?').bind(quoted,owner,group).first<WashJobRow>();
  if(!job){
    job=await db().prepare('SELECT j.* FROM line_job_replies l JOIN wash_jobs j ON l.job_image_id=j.image_id WHERE l.message_id=? AND j.owner=? AND j.group_id=?').bind(quoted,owner,group).first<WashJobRow>();
  }
  if(!job)return;
  const text=safeText(m.text,500),parsed=parseStaffReply(text),when=stamp(e.timestamp);
  await db().prepare('INSERT OR IGNORE INTO line_job_replies(message_id,job_image_id) VALUES(?,?)').bind(m.id,job.image_id).run();
  if(parsed.type==='free_wash'){
    const redeemed=await redeemFreeWash(job,m.id,parsed.text,when);
    if(redeemed){await syncWashAward(job.image_id,'Redeemed promo free wash');return}
    const pending=await db().prepare("UPDATE wash_jobs SET status='needs_review',service_type='free_wash',payment_method='none',amount=NULL,reply_id=?,reply_text=?,reply_at=?,closed_at=NULL,updated_at=?,revision=revision+1 WHERE image_id=? AND owner=? AND group_id=? AND duplicate_of IS NULL AND status<>'excluded' AND (reply_at IS NULL OR reply_at<=?)")
      .bind(m.id,parsed.text,when,now(),job.image_id,owner,group,when).run();
    if(pending.meta.changes)await syncWashAward(job.image_id,'Free wash requires entitlement review');
    return;
  }
  // Older or replayed webhook messages must not overwrite a newer correction.
  const determinate=parsed.type!=='unknown'&&parsed.amount!==null&&parsed.payment!=='none';
  const status=job.member_id&&determinate?'closed':'needs_review';
  const updated=await db().prepare(
    "UPDATE wash_jobs SET status=?,service_type=?,payment_method=?,amount=?,owner_verified=0,reply_id=?,reply_text=?,reply_at=?,closed_at=CASE WHEN ?='closed' THEN ? ELSE NULL END,updated_at=?,revision=revision+1 WHERE image_id=? AND owner=? AND group_id=? AND status NOT IN ('excluded','duplicate') AND duplicate_of IS NULL AND (reply_at IS NULL OR reply_at<=?)"
  ).bind(status,parsed.type,parsed.payment,parsed.amount,m.id,parsed.text,when,status,when,now(),job.image_id,owner,group,when).run();
  if(updated.meta.changes)await syncWashAward(job.image_id,'LINE reply '+m.id);
}
export async function handleStaffGroupEvent(e:GroupEvent):Promise<void>{
  const c=config(),group=safeText(e.source?.groupId,100),owner=safeText(c.BJ_OWNER_ID,200);
  if(c.BJ_WASH_BOT_ENABLED!=='true'||!owner||!group||group!==c.BJ_STAFF_LINE_GROUP_ID||
     e.source?.type!=='group'||e.type!=='message'||!e.message?.id||!Number.isSafeInteger(e.timestamp))return;
  if(e.message.type==='text'&&await handleReport(e,owner,group))return;
  if(e.message.type==='text')await handleText(e,owner,group);
}
export async function handleStaffImageQueueMessage(message:StaffImageQueueMessage){
 const owner=safeText(config().BJ_OWNER_ID,200);
 if(message.owner!==owner||message.groupId!==config().BJ_STAFF_LINE_GROUP_ID||!validStaffImage(message.event,owner,message.groupId))return;
 await handleImage(message.event,owner,message.groupId);
}
export async function handleStaffImageQueueBatch(batch:MessageBatch<StaffImageQueueMessage>,runtimeEnv:Cloudflare.Env){
 void runtimeEnv;
 for(const message of batch.messages){
  try{await handleStaffImageQueueMessage(message.body);message.ack()}
  catch{
   const owner=safeText(config().BJ_OWNER_ID,200),id=safeText(message.body?.event?.message?.id,100);
   if(message.attempts>=5){
    await db().prepare("UPDATE wash_jobs SET status=CASE WHEN status='excluded' THEN status ELSE 'needs_review' END,analysis_status='failed',updated_at=? WHERE image_id=? AND owner=?").bind(now(),id,owner).run();
    message.ack();
   }else message.retry({delaySeconds:Math.min(300,15*message.attempts)});
  }
 }
}
