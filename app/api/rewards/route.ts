import {db,owner,sameOrigin,fail} from '@/lib/server';
import {env} from 'cloudflare:workers';
import {plateKey,provinceKey} from '@/lib/wash-rewards';
import {redeemFreeWash,syncWashAward} from '@/lib/wash-automation';
import type {WashType,PaymentMethod} from '@/lib/wash-rewards';

const clean=(v:unknown,max=100)=>typeof v==='string'?v.trim().slice(0,max):'';
const bad=(s:string,status=400)=>new Response(s,{status});
type RecordRow={id:string;name:string;phone:string;plate:string;province:string};
type JobRow={image_id:string;owner:string;group_id:string;status:string;analysis_status:string;duplicate_of:string|null;revision:number;member_id:string|null;owner_verified:number;service_type:WashType;payment_method:PaymentMethod;amount:number|null;reply_id:string|null;reply_text:string|null;reply_at:string|null;opened_at:string;closed_at:string|null};
type MemberRow={id:string};
type AwardRow={member_id:string;points:number;active:number};
export async function GET(){
 try{
  const uid=await owner();
  const rewardsEnabled=(env as Cloudflare.Env).BJ_REWARDS_ENABLED==='true';
  const [policy,members,jobs,transactions,registered,slipClaims,entitlements]=await Promise.all([
   db().prepare('SELECT * FROM reward_policies WHERE owner=?').bind(uid).first(),
   db().prepare('SELECT m.*,COALESCE(SUM(CASE WHEN a.active=1 THEN a.points ELSE 0 END),0) AS points,COUNT(CASE WHEN a.active=1 THEN 1 END) AS washes FROM reward_members m LEFT JOIN reward_awards a ON a.member_id=m.id AND a.owner=m.owner WHERE m.owner=? GROUP BY m.id ORDER BY m.created_at DESC LIMIT 250').bind(uid).all(),
   db().prepare('SELECT j.*,m.customer_name AS member_name,a.points AS award_points,a.active AS award_active FROM wash_jobs j LEFT JOIN reward_members m ON m.id=j.member_id LEFT JOIN reward_awards a ON a.job_image_id=j.image_id WHERE j.owner=? ORDER BY j.opened_at DESC LIMIT 100').bind(uid).all(),
   db().prepare('SELECT a.*,m.plate,m.province FROM reward_audit a JOIN reward_members m ON m.id=a.member_id WHERE a.owner=? ORDER BY a.created_at DESC LIMIT 50').bind(uid).all(),
   db().prepare("SELECT id,name,phone,plate,province FROM records WHERE owner=? AND status='approved' ORDER BY created DESC LIMIT 250").bind(uid).all(),
   db().prepare("SELECT id,line_user_id,plate,province,image_key,CASE WHEN status IN ('pending','awaiting_review') AND expires_at<=? THEN 'expired' ELSE status END AS status,created_at,expires_at,reply_sent_at,confirmed_job_image_id FROM customer_slip_claims WHERE owner=? ORDER BY created_at DESC LIMIT 100").bind(new Date().toISOString(),uid).all(),
   db().prepare("SELECT e.id,e.member_id,e.source_job_id,CASE WHEN e.status='active' AND e.expires_at<=? THEN 'expired' ELSE e.status END AS status,e.valid_from,e.expires_at,e.redeemed_job_id,m.plate,m.province FROM reward_entitlements e JOIN reward_members m ON m.id=e.member_id WHERE e.owner=? ORDER BY e.created_at DESC LIMIT 100").bind(new Date().toISOString(),uid).all()
  ]);
  return Response.json({rewardsEnabled,policy:rewardsEnabled?(policy||{enabled:0,points_per_wash:10,include_free:0}):{...(policy||{points_per_wash:10,include_free:0}),enabled:0},members:members.results,jobs:jobs.results,transactions:transactions.results,registered:registered.results,slipClaims:slipClaims.results,entitlements:entitlements.results},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e)}
}
export async function POST(req:Request){
 try{
  sameOrigin(req);
  const uid=await owner(),v=await req.json() as Record<string,unknown>,action=clean(v.action,40);
  if((env as Cloudflare.Env).BJ_REWARDS_ENABLED!=='true'&&(action==='enroll'||action==='confirm_slip_claim'||action==='policy'&&v.enabled===true))return bad('ระบบสะสมแต้มและสิทธิ์โปรยังไม่เปิดใช้งาน',409);
  if(action==='enroll'){
   const recordId=clean(v.recordId,100);
   const original=await db().prepare("SELECT id,name,phone,plate,province FROM records WHERE id=? AND owner=? AND status='approved'").bind(recordId,uid).first<RecordRow>();
   if(!original)return bad('เลือกรถที่ผ่านการลงทะเบียนและยืนยันใน CRM ก่อน',404);
   const plate=clean(original.plate,30),province=clean(original.province,60),name=clean(original.name,100),phone=clean(original.phone,20);
   if(!plate||!province||plateKey(plate).length<3||provinceKey(province).length<2)return bad('ข้อมูลทะเบียนหรือจังหวัดไม่ครบ');
   const exists=await db().prepare('SELECT id FROM reward_members WHERE owner=? AND plate_key=? AND province_key=?').bind(uid,plateKey(plate),provinceKey(province)).first();
   if(exists)return bad('ทะเบียนนี้อยู่ในบัญชีคะแนนแล้ว',409);
   const id=crypto.randomUUID();
   await db().prepare('INSERT INTO reward_members(id,owner,plate,province,plate_key,province_key,customer_name,phone,source_record_id,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)').bind(id,uid,plate,province,plateKey(plate),provinceKey(province),name,phone,recordId,new Date().toISOString()).run();
   return Response.json({ok:true,id},{status:201});
  }
  if(action==='policy'){
   const points=Number(v.pointsPerWash);
   if(!Number.isInteger(points)||points<1||points>1000||typeof v.enabled!=='boolean')return bad('กำหนดคะแนน 1–1000 และสถานะเปิด/ปิด');
   // Free washes stay excluded until package entitlement checks have been implemented.
   await db().prepare('INSERT INTO reward_policies(owner,enabled,points_per_wash,include_free) VALUES(?,?,?,0) ON CONFLICT(owner) DO UPDATE SET enabled=excluded.enabled,points_per_wash=excluded.points_per_wash,include_free=0').bind(uid,v.enabled?1:0,points).run();
   return Response.json({ok:true});
  }
  if(action==='confirm_slip_claim'||action==='reject_slip_claim'){
   const claimId=clean(v.claimId,100),claim=await db().prepare("SELECT * FROM customer_slip_claims WHERE id=? AND owner=? AND status='awaiting_review'").bind(claimId,uid).first<{id:string;status:string;line_user_id:string;plate:string|null;province:string|null;expires_at:string}>();
   if(!claim)return bad('ไม่พบรายการสลิปรอตรวจสอบ',404);
   const at=new Date().toISOString();
   if(action==='reject_slip_claim'){
    const result=await db().batch([
     db().prepare("UPDATE customer_slip_claims SET status='rejected' WHERE id=? AND owner=? AND status='awaiting_review'").bind(claimId,uid),
     db().prepare('INSERT INTO customer_slip_claim_audit(id,owner,claim_id,actor,action,before_json,after_json,reason,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),uid,claimId,uid,'reject',JSON.stringify({status:claim.status}),JSON.stringify({status:'rejected'}),clean(v.reason,200)||'เจ้าของร้านไม่อนุมัติหลักฐาน',at)
    ]);
    if(!result[0].meta.changes)return bad('รายการสลิปถูกตรวจสอบไปแล้ว',409);
    return Response.json({ok:true});
   }
   const jobId=clean(v.jobId,100),plate=clean(v.plate,30),province=clean(v.province,60),revision=Number(v.revision),job=await db().prepare("SELECT image_id,member_id,status,service_type,payment_method,amount,plate,province,duplicate_of,revision FROM wash_jobs WHERE image_id=? AND owner=?").bind(jobId,uid).first<{image_id:string;member_id:string|null;status:string;service_type:WashType;payment_method:PaymentMethod;amount:number|null;plate:string|null;province:string|null;duplicate_of:string|null;revision:number}>();
   if(!plate||!province||plateKey(plate).length<3||provinceKey(province).length<2)return bad('กรุณาระบุทะเบียนและจังหวัดที่ตรวจสอบแล้ว');
   if(!job||job.duplicate_of||job.status!=='closed'||job.service_type!=='wash'||!(Number(job.amount)>0)||!['cash','transfer'].includes(job.payment_method)||revision!==job.revision)return bad('เลือกรายการล้างรถที่ปิดงานและมีการบันทึกยอดชำระแล้ว หรือรายการเปลี่ยนแล้ว',409);
   const member=await db().prepare("SELECT m.id,m.source_record_id FROM reward_members m JOIN records r ON r.id=m.source_record_id WHERE m.owner=? AND m.active=1 AND m.plate_key=? AND m.province_key=? AND r.line_user_id=? AND r.status='approved'")
    .bind(uid,plateKey(plate),provinceKey(province),claim.line_user_id).first<{id:string;source_record_id:string}>();
   if(!member)return bad('ไม่พบรถสมาชิกที่ลงทะเบียนและยืนยันด้วย LINE บัญชีนี้และทะเบียนที่ระบุ',409);
   if(job.member_id&&job.member_id!==member.id)return bad('งานนี้ถูกจับคู่กับรถสมาชิกคนละคันแล้ว',409);
   const result=await db().batch([
    db().prepare("UPDATE customer_slip_claims SET plate=?,province=?,status='confirmed',confirmed_record_id=?,confirmed_job_image_id=? WHERE id=? AND owner=? AND status='awaiting_review' AND expires_at>? AND EXISTS(SELECT 1 FROM wash_jobs WHERE image_id=? AND owner=? AND revision=? AND status='closed' AND service_type='wash' AND duplicate_of IS NULL AND (member_id IS NULL OR member_id=?))").bind(plate,province,member.source_record_id,jobId,claimId,uid,at,jobId,uid,revision,member.id),
    db().prepare('INSERT INTO customer_slip_claim_audit(id,owner,claim_id,actor,action,before_json,after_json,reason,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),uid,claimId,uid,'confirm',JSON.stringify({status:claim.status,plate:claim.plate,province:claim.province}),JSON.stringify({status:'confirmed',plate,province,job_id:jobId,record_id:member.source_record_id}),clean(v.reason,200)||'ตรวจยอดจากหลักฐานบัญชีและจับคู่งานโดยเจ้าของร้าน',at),
    db().prepare("UPDATE wash_jobs SET member_id=?,plate=?,province=?,owner_verified=1,revision=revision+1,updated_at=? WHERE image_id=? AND owner=? AND revision=? AND status='closed' AND service_type='wash' AND duplicate_of IS NULL AND (member_id IS NULL OR member_id=?) AND EXISTS(SELECT 1 FROM customer_slip_claims WHERE id=? AND owner=? AND status='confirmed' AND confirmed_job_image_id=? AND expires_at>?)").bind(member.id,plate,province,at,jobId,uid,revision,member.id,claimId,uid,jobId,at),
    db().prepare('INSERT INTO wash_job_audit(id,owner,image_id,actor,action,before_json,after_json,reason,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),uid,jobId,uid,'confirm_customer_slip',JSON.stringify({plate:job.plate,province:job.province,member_id:job.member_id,owner_verified:0}),JSON.stringify({plate,province,member_id:member.id,owner_verified:1}),clean(v.reason,200)||'ตรวจยอดจากบัญชีและจับคู่งาน',at),
    db().prepare("UPDATE customer_slip_claims SET status='awaiting_review',plate=NULL,province=NULL,confirmed_record_id=NULL,confirmed_job_image_id=NULL WHERE id=? AND owner=? AND status='confirmed' AND confirmed_job_image_id=? AND NOT EXISTS(SELECT 1 FROM wash_jobs WHERE image_id=? AND owner=? AND revision=? AND member_id=? AND owner_verified=1)").bind(claimId,uid,jobId,jobId,uid,revision+1,member.id)
   ]);
   if(!result[0].meta.changes||!result[1].meta.changes)return bad('ข้อมูลเปลี่ยนระหว่างตรวจสอบ กรุณารีเฟรช',409);
   await syncWashAward(jobId,'Owner confirmed customer payment slip and linked wash job');
   return Response.json({ok:true});
  }
  if(['confirm_job','exclude_job','restore_job','mark_wash','verify_job','review_job'].includes(action)){
   const jobId=clean(v.jobId,100);
   const job=await db().prepare('SELECT * FROM wash_jobs WHERE image_id=? AND owner=?').bind(jobId,uid).first<JobRow>();
   if(!job)return bad('ไม่พบงาน',404);
   if(action==='confirm_job'){
    if(job.status==='excluded')return bad('รายการนี้ถูกยกเลิกแล้ว เปิดตรวจสอบก่อนจับคู่ใหม่',409);
    if(job.duplicate_of)return bad('รูปซ้ำกับงาน '+job.duplicate_of+' กรุณายกเลิกงานซ้ำก่อน',409);
    const memberId=clean(v.memberId,100);
    const member=await db().prepare('SELECT id FROM reward_members WHERE id=? AND owner=? AND active=1').bind(memberId,uid).first<MemberRow>();
    if(!member)return bad('ไม่พบรถสมาชิก',404);
    const prior=await db().prepare('SELECT member_id,points,active FROM reward_awards WHERE job_image_id=? AND active=1').bind(jobId).first<AwardRow>();
    if(prior&&prior.member_id!==memberId)return bad('ยกเลิกคะแนนเดิมก่อนเปลี่ยนสมาชิก',409);
    const before={member_id:job.member_id,status:job.status},after={member_id:memberId,status:job.status};
    const at=new Date().toISOString(),result=await db().batch([
     db().prepare("UPDATE wash_jobs SET member_id=?,status=?,updated_at=?,revision=revision+1 WHERE image_id=? AND owner=? AND revision=? AND status<>'excluded' AND duplicate_of IS NULL").bind(memberId,job.status,at,jobId,uid,Number(job.revision)),
     db().prepare('INSERT INTO wash_job_audit(id,owner,image_id,actor,action,before_json,after_json,reason,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),uid,jobId,uid,'confirm_member',JSON.stringify(before),JSON.stringify(after),'ยืนยันรถสมาชิกในงาน',at)
    ]);
    if(!result[0].meta.changes)return bad('รายการถูกแก้ไขจากที่อื่นแล้ว กรุณารีเฟรช',409);
   }else if(action==='exclude_job'){
    const at=new Date().toISOString(),result=await db().batch([
     db().prepare("UPDATE wash_jobs SET status='excluded',updated_at=?,revision=revision+1 WHERE image_id=? AND owner=? AND revision=?").bind(at,jobId,uid,Number(job.revision)),
     db().prepare('INSERT INTO wash_job_audit(id,owner,image_id,actor,action,before_json,after_json,reason,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),uid,jobId,uid,'exclude_job',JSON.stringify({status:job.status,service_type:job.service_type,amount:job.amount}),JSON.stringify({status:'excluded'}),clean(v.reason,200)||'เจ้าของร้านยกเลิกรายการ',at)
    ]);
    if(!result[0].meta.changes)return bad('รายการถูกแก้ไขจากที่อื่นแล้ว กรุณารีเฟรช',409);
   }else if(action==='restore_job'){
    if(job.status!=='excluded'||job.duplicate_of)return bad('กู้คืนได้เฉพาะงานที่ยกเลิกและไม่ใช่รูปซ้ำ',409);
    const at=new Date().toISOString(),result=await db().batch([
     db().prepare("UPDATE wash_jobs SET status='needs_review',updated_at=?,revision=revision+1 WHERE image_id=? AND owner=? AND status='excluded' AND revision=? AND duplicate_of IS NULL").bind(at,jobId,uid,Number(job.revision)),
     db().prepare('INSERT INTO wash_job_audit(id,owner,image_id,actor,action,before_json,after_json,reason,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),uid,jobId,uid,'restore_job',JSON.stringify({status:'excluded'}),JSON.stringify({status:'needs_review'}),clean(v.reason,200)||'เจ้าของร้านนำกลับมาตรวจสอบ',at)
    ]);
    if(!result[0].meta.changes)return bad('รายการเปลี่ยนแล้ว กรุณารีเฟรช',409);
   }else if(action==='mark_wash'){
    if(!job.reply_id)return bad('ยังไม่มี Reply ปิดงาน จึงให้คะแนนไม่ได้');
    if(!job.member_id)return bad('ต้องยืนยันรถสมาชิกก่อน');
    if(!(Number.isSafeInteger(Number(job.amount))&&Number(job.amount)>0&&['cash','transfer'].includes(job.payment_method)))return bad('ยังไม่มียอดและช่องทางชำระที่ตรวจสอบได้ จึงให้คะแนนไม่ได้',409);
    const at=new Date().toISOString(),result=await db().batch([
     db().prepare("UPDATE wash_jobs SET service_type='wash',status='closed',owner_verified=0,closed_at=COALESCE(closed_at,?),updated_at=?,revision=revision+1 WHERE image_id=? AND owner=? AND revision=? AND status<>'excluded' AND duplicate_of IS NULL").bind(at,at,jobId,uid,Number(job.revision)),
     db().prepare('INSERT INTO wash_job_audit(id,owner,image_id,actor,action,before_json,after_json,reason,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),uid,jobId,uid,'mark_wash',JSON.stringify({service_type:job.service_type,status:job.status}),JSON.stringify({service_type:'wash',status:'closed'}),'ยืนยันว่าเป็นงานล้างรถ',at)
    ]);
    if(!result[0].meta.changes)return bad('รายการถูกแก้ไขจากที่อื่นแล้ว กรุณารีเฟรช',409);
   }else if(action==='verify_job'){
    if(job.status!=='closed'||job.service_type==='unknown'||!(Number(job.amount)>0)||!['cash','transfer'].includes(job.payment_method)||!job.reply_id)return bad('ยืนยันได้เมื่อมีงานปิดและมีประเภทรายการ ยอด ช่องทางชำระครบ',409);
    if(job.owner_verified===1)return bad('รายการนี้ยืนยันยอดแล้ว',409);
    const at=new Date().toISOString(),result=await db().batch([
     db().prepare("UPDATE wash_jobs SET owner_verified=1,updated_at=?,revision=revision+1 WHERE image_id=? AND owner=? AND revision=? AND status='closed' AND duplicate_of IS NULL AND service_type<>'unknown' AND amount>0 AND payment_method IN ('cash','transfer') AND owner_verified=0").bind(at,jobId,uid,Number(job.revision)),
     db().prepare('INSERT INTO wash_job_audit(id,owner,image_id,actor,action,before_json,after_json,reason,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),uid,jobId,uid,'verify_payment',JSON.stringify({owner_verified:0,status:job.status,amount:job.amount,payment_method:job.payment_method}),JSON.stringify({owner_verified:1}),clean(v.reason,200)||'เจ้าของร้านตรวจยอดรับเงินจริงแล้ว',at)
    ]);
    if(!result[0].meta.changes)return bad('รายการถูกแก้ไขจากที่อื่นแล้ว กรุณารีเฟรช',409);
   }else{
    if(job.duplicate_of)return bad('รูปซ้ำกับงาน '+job.duplicate_of+' ตรวจสอบรายการต้นฉบับก่อน',409);
    const types=['wash','free_wash','promo_sale','membership_sale','film','ceramic_maintenance','ceramic_full','seat','carpet','headlight','ozone','other','unknown'];
    const methods=['cash','transfer','none'];
    const serviceType=clean(v.serviceType,40),paymentMethod=clean(v.paymentMethod,20),amount=v.amount===null||v.amount===''?null:Number(v.amount),revision=Number(v.revision);
    if(!types.includes(serviceType)||!methods.includes(paymentMethod)||!Number.isInteger(revision)||revision!==Number(job.revision))return bad('ข้อมูลรายการเปลี่ยนแล้วหรือประเภทไม่ถูกต้อง กรุณาโหลดรายการใหม่',409);
    if(amount!==null&&(!Number.isSafeInteger(amount)||amount<1||amount>1000000))return bad('ยอดต้องเป็นจำนวนเต็ม 1 ถึง 1,000,000 บาท');
    if(paymentMethod==='none'&&amount!==null||paymentMethod!=='none'&&amount===null)return bad('ระบุช่องทางและยอดชำระให้ครบ หรือเลือกไม่มีการชำระเงิน');
    if(!job.reply_id)return bad('ยังไม่มี Reply ยืนยันการทำบริการ');
    if(serviceType==='free_wash'){
     if(paymentMethod!=='none'||amount!==null||!job.member_id)return bad('ล้างฟรีต้องไม่มีการชำระเงินและต้องจับคู่รถสมาชิกก่อน');
     const redeemed=await redeemFreeWash(job,job.reply_id,job.reply_text||'ฟรี',job.reply_at||job.opened_at,revision);
     if(!redeemed)return bad('ไม่พบสิทธิโปรที่ยังใช้ได้ภายใน 7 วัน หรือรายการเปลี่ยนแล้ว',409);
     await syncWashAward(jobId,'Owner confirmed promo free wash');
     return Response.json({ok:true});
    }
    const closed=amount!==null&&['cash','transfer'].includes(paymentMethod)&&serviceType!=='unknown';
    const next={service_type:serviceType,payment_method:paymentMethod,amount,status:closed?'closed':'needs_review'};
    const before={service_type:job.service_type,payment_method:job.payment_method,amount:job.amount,status:job.status};
    const at=new Date().toISOString(),result=await db().batch([
     db().prepare("UPDATE wash_jobs SET service_type=?,payment_method=?,amount=?,status=?,owner_verified=0,closed_at=CASE WHEN ?='closed' THEN COALESCE(closed_at,?) ELSE closed_at END,updated_at=?,revision=revision+1 WHERE image_id=? AND owner=? AND revision=? AND status<>'excluded' AND duplicate_of IS NULL").bind(serviceType,paymentMethod,amount,next.status,next.status,at,at,jobId,uid,revision),
     db().prepare('INSERT INTO wash_job_audit(id,owner,image_id,actor,action,before_json,after_json,reason,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),uid,jobId,uid,'staff_correction',JSON.stringify(before),JSON.stringify(next),clean(v.reason,200)||'แก้รายการจาก CRM',at)
    ]);
    if(!result[0].meta.changes)return bad('รายการถูกแก้ไขจากที่อื่นแล้ว กรุณารีเฟรช',409);
   }
   await syncWashAward(jobId,'CRM review '+action);
   return Response.json({ok:true});
  }
  return bad('คำสั่งไม่ถูกต้อง');
 }catch(e){return fail(e)}
}
