import {env} from 'cloudflare:workers';
import {db,fail,sameOrigin} from '@/lib/server';
import {verifyLineToken} from '@/lib/line-core';
import {customerClaimHash} from '@/lib/customer-claim';

const text=(value:unknown,max:number)=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,max):'';
export async function POST(req:Request){
 try{
  sameOrigin(req);
  const c=env as Cloudflare.Env;
  if(!c.BJ_OWNER_ID||!c.LINE_LOGIN_CHANNEL_ID)return new Response('ระบบสมาชิกยังไม่พร้อม',{status:503});
  const body=await req.json() as Record<string,unknown>;
  const claimToken=text(body.claimToken,100),idToken=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  const plate=text(body.plate,30),province=text(body.province,60);
  if(claimToken.length<40||!plate||!province)return new Response('กรุณากรอกทะเบียนและจังหวัดให้ครบ',{status:400});
  let lineUserId:string;
  try{lineUserId=await verifyLineToken(idToken,c.LINE_LOGIN_CHANNEL_ID)}catch{return new Response('กรุณาเข้าสู่ระบบ LINE ใหม่',{status:401})}
  const hash=await customerClaimHash(claimToken),claim=await db().prepare('SELECT id,line_user_id,status,expires_at FROM customer_slip_claims WHERE owner=? AND token_hash=?').bind(c.BJ_OWNER_ID,hash).first<{id:string;line_user_id:string;status:string;expires_at:string}>();
  if(!claim||claim.line_user_id!==lineUserId)return new Response('ไม่พบลิงก์สำหรับบัญชี LINE นี้',{status:404});
  if(claim.status!=='pending')return new Response('ลิงก์นี้ใช้ไปแล้วหรือรอร้านตรวจสอบ',{status:409});
  const at=new Date().toISOString();
  if(claim.expires_at<=at)return new Response('ลิงก์หมดอายุ กรุณาส่งสลิปใหม่ทาง LINE',{status:410});
  const saved=await db().prepare("UPDATE customer_slip_claims SET plate=?,province=?,status='awaiting_review',used_at=? WHERE id=? AND owner=? AND line_user_id=? AND status='pending' AND expires_at>?")
   .bind(plate,province,at,claim.id,c.BJ_OWNER_ID,lineUserId,at).run();
  if(!saved.meta.changes)return new Response('ลิงก์ถูกใช้หรือหมดอายุแล้ว กรุณาโหลดหน้าใหม่',{status:409});
  return Response.json({ok:true,message:'ส่งข้อมูลให้ร้านตรวจสอบแล้ว ยังไม่ยืนยันการชำระเงินหรือเพิ่มคะแนน'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return fail(error)}
}
