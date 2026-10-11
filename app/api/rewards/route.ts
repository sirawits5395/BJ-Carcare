import {db,owner,sameOrigin,fail} from '@/lib/server';
import {plateKey,provinceKey} from '@/lib/wash-rewards';
import {syncWashAward} from '@/lib/wash-automation';

const clean=(v:unknown,max=100)=>typeof v==='string'?v.trim().slice(0,max):'';
const bad=(s:string,status=400)=>new Response(s,{status});
export async function GET(){
 try{
  const uid=await owner();
  const [policy,members,jobs,transactions]=await Promise.all([
   db().prepare('SELECT * FROM reward_policies WHERE owner=?').bind(uid).first(),
   db().prepare('SELECT m.*,COALESCE(SUM(CASE WHEN a.active=1 THEN a.points ELSE 0 END),0) AS points,COUNT(CASE WHEN a.active=1 THEN 1 END) AS washes FROM reward_members m LEFT JOIN reward_awards a ON a.member_id=m.id AND a.owner=m.owner WHERE m.owner=? GROUP BY m.id ORDER BY m.created_at DESC LIMIT 250').bind(uid).all(),
   db().prepare('SELECT j.*,m.customer_name AS member_name,a.points AS award_points,a.active AS award_active FROM wash_jobs j LEFT JOIN reward_members m ON m.id=j.member_id LEFT JOIN reward_awards a ON a.job_image_id=j.image_id WHERE j.owner=? ORDER BY j.opened_at DESC LIMIT 100').bind(uid).all(),
   db().prepare('SELECT a.*,m.plate,m.province FROM reward_audit a JOIN reward_members m ON m.id=a.member_id WHERE a.owner=? ORDER BY a.created_at DESC LIMIT 50').bind(uid).all()
  ]);
  return Response.json({policy:policy||{enabled:0,points_per_wash:10,include_free:0},members:members.results,jobs:jobs.results,transactions:transactions.results},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e)}
}
export async function POST(req:Request){
 try{
  sameOrigin(req);
  const uid=await owner(),v:any=await req.json(),action=clean(v.action,40);
  if(action==='enroll'){
   const plate=clean(v.plate,30),province=clean(v.province,60),name=clean(v.customerName,100),phone=clean(v.phone,20);
   if(!plate||!province||!name||plateKey(plate).length<3||provinceKey(province).length<2)return bad('ระบุชื่อสมาชิก ทะเบียน และจังหวัดให้ครบ');
   const exists=await db().prepare('SELECT id FROM reward_members WHERE owner=? AND plate_key=? AND province_key=?').bind(uid,plateKey(plate),provinceKey(province)).first();
   if(exists)return bad('ทะเบียนนี้ลงทะเบียนคะแนนแล้ว',409);
   const id=crypto.randomUUID();
   await db().prepare('INSERT INTO reward_members(id,owner,plate,province,plate_key,province_key,customer_name,phone,active,created_at) VALUES(?,?,?,?,?,?,?,?,1,?)').bind(id,uid,plate,province,plateKey(plate),provinceKey(province),name,phone,new Date().toISOString()).run();
   return Response.json({ok:true,id},{status:201});
  }
  if(action==='policy'){
   const points=Number(v.pointsPerWash);
   if(!Number.isInteger(points)||points<1||points>1000||typeof v.enabled!=='boolean')return bad('กำหนดคะแนน 1–1000 และสถานะเปิด/ปิด');
   // Free washes stay excluded until package entitlement checks have been implemented.
   await db().prepare('INSERT INTO reward_policies(owner,enabled,points_per_wash,include_free) VALUES(?,?,?,0) ON CONFLICT(owner) DO UPDATE SET enabled=excluded.enabled,points_per_wash=excluded.points_per_wash,include_free=0').bind(uid,v.enabled?1:0,points).run();
   return Response.json({ok:true});
  }
  if(['confirm_job','exclude_job','mark_wash'].includes(action)){
   const jobId=clean(v.jobId,100);
   const job:any=await db().prepare('SELECT * FROM wash_jobs WHERE image_id=? AND owner=?').bind(jobId,uid).first();
   if(!job)return bad('ไม่พบงาน',404);
   if(action==='confirm_job'){
    const memberId=clean(v.memberId,100);
    const member:any=await db().prepare('SELECT id FROM reward_members WHERE id=? AND owner=? AND active=1').bind(memberId,uid).first();
    if(!member)return bad('ไม่พบรถสมาชิก',404);
    const prior:any=await db().prepare('SELECT * FROM reward_awards WHERE job_image_id=? AND active=1').bind(jobId).first();
    if(prior&&prior.member_id!==memberId)return bad('ยกเลิกคะแนนเดิมก่อนเปลี่ยนสมาชิก',409);
    await db().prepare('UPDATE wash_jobs SET member_id=?,status=?,updated_at=? WHERE image_id=? AND owner=?').bind(memberId,job.reply_id?'closed':'open',new Date().toISOString(),jobId,uid).run();
   }else if(action==='exclude_job'){
    await db().prepare("UPDATE wash_jobs SET status='excluded',updated_at=? WHERE image_id=? AND owner=?").bind(new Date().toISOString(),jobId,uid).run();
   }else{
    if(!job.reply_id)return bad('ยังไม่มี Reply ปิดงาน จึงให้คะแนนไม่ได้');
    if(!job.member_id)return bad('ต้องยืนยันรถสมาชิกก่อน');
    await db().prepare("UPDATE wash_jobs SET service_type='wash',status='closed',updated_at=? WHERE image_id=? AND owner=?").bind(new Date().toISOString(),jobId,uid).run();
   }
   await syncWashAward(jobId,'CRM review '+action);
   return Response.json({ok:true});
  }
  return bad('คำสั่งไม่ถูกต้อง');
 }catch(e){return fail(e)}
}
