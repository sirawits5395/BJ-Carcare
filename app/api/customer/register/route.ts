import {env,waitUntil} from 'cloudflare:workers';
import {sameOrigin,db,fail} from '@/lib/server';
import {saveRegistration} from '@/lib/registration';
import {newRegistrationAlertText,pushLine,registrationReceivedText,verifyLineToken} from '@/lib/line-core';

type RegistrationRow={name:string;plate:string;province:string;services:string};
async function sendNotice(token:string,recipient:string,message:string,retryKey:string,kind:string){
  const result=await pushLine(token,recipient,JSON.stringify([{type:'text',text:message}]),retryKey);
  console.info('registration_notice',kind,result.state,result.code);
}
async function notifyRegistration(recordId:string,ownerId:string,userId:string,token:string,adminRecipient:string){
  const row=await db().prepare('SELECT name,plate,province,services FROM records WHERE id=? AND owner=?').bind(recordId,ownerId).first<RegistrationRow>();
  if(!row)return;
  const tasks:Promise<void>[]=[];
  if(/^U[0-9a-f]{32}$/.test(adminRecipient)){
    tasks.push(sendNotice(token,adminRecipient,newRegistrationAlertText(row),crypto.randomUUID(),'admin'));
  }
  tasks.push((async()=>{
    try{
      const profile=await fetch('https://api.line.me/v2/bot/profile/'+encodeURIComponent(userId),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(3500)});
      if(!profile.ok){console.info('registration_notice','customer','no_friend',profile.status);return}
      await db().prepare('INSERT OR IGNORE INTO line_contacts(user_id,blocked,event_at) VALUES(?,?,?)').bind(userId,0,Date.now()).run();
      await sendNotice(token,userId,registrationReceivedText(row),recordId,'customer');
    }catch{console.warn('registration_notice','customer','profile_failed')}
  })());
  await Promise.allSettled(tasks);
}

export async function POST(req:Request){
  try{
    sameOrigin(req);
    const e=env as any;
    if(e.CUSTOMER_REGISTRATION_ENABLED!=='true'||!e.LINE_LOGIN_CHANNEL_ID||!e.BJ_OWNER_ID)return new Response('ร้านยังไม่เปิดรับลงทะเบียนผ่าน LINE',{status:503});
    if(Number(req.headers.get('content-length')||0)>11*1024*1024)return new Response('ไฟล์ใหญ่เกินไป',{status:413});
    const token=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
    let userId:string;
    try{userId=await verifyLineToken(token,e.LINE_LOGIN_CHANNEL_ID)}catch{return new Response('กรุณาเข้าสู่ระบบ LINE ใหม่',{status:401})}
    const counts=await db().prepare('SELECT COUNT(*) count FROM records WHERE line_user_id=? AND created>?').bind(userId,new Date(Date.now()-3600000).toISOString()).first<{count:number}>();
    if((counts?.count||0)>=5)return new Response('ส่งข้อมูลครบจำนวนต่อชั่วโมงแล้ว กรุณาติดต่อร้าน',{status:429});
    const saved=await saveRegistration(req,e.BJ_OWNER_ID,userId);
    if(saved.status===201&&e.LINE_CHANNEL_ACCESS_TOKEN){
      const {id}=await saved.clone().json() as {id:string};
      waitUntil(notifyRegistration(id,e.BJ_OWNER_ID,userId,e.LINE_CHANNEL_ACCESS_TOKEN,e.BJ_REGISTRATION_NOTIFY_USER_ID||'').catch(()=>console.error('registration_notice','failed')));
    }
    return saved;
  }catch(error){return fail(error)}
}
