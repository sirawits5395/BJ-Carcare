import {env} from 'cloudflare:workers';
import {db,bucket} from '@/lib/server';
import {eligibleForPoints,parseStaffReply,plateKey,provinceKey} from '@/lib/wash-rewards';

type GroupEvent={type:string;timestamp:number;source?:{type?:string;groupId?:string;userId?:string};message?:{type:string;id:string;quotedMessageId?:string;text?:string;contentProvider?:{type:string}}};
const config=()=>env as any;
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
  if(!result.ok)return null;
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
  if(!result.ok)return null;
  const payload:any=await result.json();
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
  const job:any=await db().prepare('SELECT * FROM wash_jobs WHERE image_id=?').bind(jobId).first();
  if(!job)return;
  const policy:any=await db().prepare('SELECT * FROM reward_policies WHERE owner=?').bind(job.owner).first();
  const existing:any=await db().prepare('SELECT * FROM reward_awards WHERE job_image_id=?').bind(jobId).first();
  const qualifies=!!job.member_id&&job.status==='closed'&&eligibleForPoints(job.service_type,policy?.include_free===1);
  if(existing?.active===1&&!qualifies){
    const result=await db().prepare('UPDATE reward_awards SET active=0,updated_at=? WHERE job_image_id=? AND active=1').bind(now(),jobId).run();
    if(result.meta.changes)await db().prepare('INSERT INTO reward_audit(id,owner,member_id,job_image_id,points_delta,reason,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),job.owner,existing.member_id,jobId,-existing.points,reason,now()).run();
    return;
  }
  if(!qualifies||policy?.enabled!==1)return;
  if(existing?.active===1)return;
  if(existing&&existing.member_id!==job.member_id)return; // requires owner review before reassignment
  if(existing){
    const change=await db().prepare('UPDATE reward_awards SET active=1,updated_at=? WHERE job_image_id=? AND active=0').bind(now(),jobId).run();
    if(change.meta.changes)await db().prepare('INSERT INTO reward_audit(id,owner,member_id,job_image_id,points_delta,reason,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),job.owner,job.member_id,jobId,existing.points,reason,now()).run();
    return;
  }
  const points=Number(policy.points_per_wash);
  if(!Number.isInteger(points)||points<1||points>1000)return;
  const result=await db().prepare('INSERT OR IGNORE INTO reward_awards(job_image_id,owner,member_id,points,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(jobId,job.owner,job.member_id,points,now(),now()).run();
  if(result.meta.changes)await db().prepare('INSERT INTO reward_audit(id,owner,member_id,job_image_id,points_delta,reason,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),job.owner,job.member_id,jobId,points,reason,now()).run();
}
async function handleImage(e:GroupEvent,owner:string,group:string){
  const id=e.message!.id,when=stamp(e.timestamp);
  const put=await db().prepare('INSERT OR IGNORE INTO wash_jobs(image_id,owner,group_id,status,opened_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id,owner,group,'open',when,when).run();
  if(!put.meta.changes)return;
  try{
    const image=await imageFromLine(id);
    if(!image)return;
    const key='wash/'+owner+'/'+id;
    await bucket().put(key,image.bytes,{httpMetadata:{contentType:image.mime}});
    const ocr=await readPlate(image.bytes,image.mime);
    const memberId=ocr&&ocr.confidence>=90?await findMember(owner,ocr.plate,ocr.province):null;
    await db().prepare('UPDATE wash_jobs SET image_key=?,plate=?,province=?,brand=?,model=?,color=?,plate_confidence=?,member_id=?,status=?,updated_at=? WHERE image_id=?')
      .bind(key,ocr?.plate||null,ocr?.province||null,ocr?.brand||null,ocr?.model||null,ocr?.color||null,ocr?.confidence||0,memberId,memberId?'open':'needs_review',now(),id).run();
  }catch{
    console.error('Wash image ingestion requires review:',id);
    await db().prepare("UPDATE wash_jobs SET status='needs_review',updated_at=? WHERE image_id=?").bind(now(),id).run();
  }
}
async function handleText(e:GroupEvent,owner:string,group:string){
  const m=e.message!,quoted=safeText(m.quotedMessageId,100);
  if(!quoted)return;
  let job:any=await db().prepare('SELECT * FROM wash_jobs WHERE image_id=? AND owner=? AND group_id=?').bind(quoted,owner,group).first();
  if(!job){
    job=await db().prepare('SELECT j.* FROM line_job_replies l JOIN wash_jobs j ON l.job_image_id=j.image_id WHERE l.message_id=? AND j.owner=? AND j.group_id=?').bind(quoted,owner,group).first();
  }
  if(!job)return;
  const text=safeText(m.text,500),parsed=parseStaffReply(text),when=stamp(e.timestamp);
  await db().prepare('INSERT OR IGNORE INTO line_job_replies(message_id,job_image_id) VALUES(?,?)').bind(m.id,job.image_id).run();
  // Older or replayed webhook messages must not overwrite a newer correction.
  const updated=await db().prepare(
    'UPDATE wash_jobs SET status=?,service_type=?,payment_method=?,amount=?,reply_id=?,reply_text=?,closed_at=?,updated_at=? WHERE image_id=? AND (closed_at IS NULL OR closed_at<=?)'
  ).bind(job.member_id?'closed':'needs_review',parsed.type,parsed.payment,parsed.amount,m.id,parsed.text,when,now(),job.image_id,when).run();
  if(updated.meta.changes)await syncWashAward(job.image_id,'LINE reply '+m.id);
}
export async function handleStaffGroupEvent(e:GroupEvent):Promise<void>{
  const c=config(),group=safeText(e.source?.groupId,100),owner=safeText(c.BJ_OWNER_ID,200);
  if(c.BJ_WASH_BOT_ENABLED!=='true'||!owner||!group||group!==c.BJ_STAFF_LINE_GROUP_ID||
     e.source?.type!=='group'||e.type!=='message'||!e.message?.id||!Number.isSafeInteger(e.timestamp))return;
  if(e.message.type==='image'&&e.message.contentProvider?.type!=='external')await handleImage(e,owner,group);
  if(e.message.type==='text')await handleText(e,owner,group);
}
