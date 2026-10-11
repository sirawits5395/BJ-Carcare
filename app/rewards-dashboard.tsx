"use client";
import {useEffect,useState,FormEvent} from 'react';
type Member={id:string;plate:string;province:string;customer_name:string;phone:string;points:number;washes:number};
type Job={image_id:string;plate:string|null;province:string|null;brand:string|null;model:string|null;color:string|null;plate_confidence:number;member_id:string|null;member_name:string|null;service_type:string;payment_method:string;amount:number|null;reply_text:string|null;opened_at:string;status:string;award_active:number|null;award_points:number|null;image_key:string|null};
type Report={policy:{enabled:number;points_per_wash:number;include_free:number};members:Member[];jobs:Job[];transactions:{id:string;plate:string;province:string;points_delta:number;reason:string;created_at:string}[];registered:{id:string;name:string;plate:string;province:string;phone:string}[]};
export default function RewardsDashboard(){
 const [data,setData]=useState<Report|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [points,setPoints]=useState(10),[enabled,setEnabled]=useState(false),[matches,setMatches]=useState<Record<string,string>>({});
 const [reportDate,setReportDate]=useState(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
 const [daily,setDaily]=useState<{report:string;summary:{arrivals:number;closedArrivals:number;waiting:number;cash:number;transfer:number;total:number}}|null>(null);
 async function refresh(){setLoading(true);try{const r=await fetch('/api/rewards');if(!r.ok)throw Error(await r.text());const d:Report=await r.json();setData(d);setPoints(d.policy.points_per_wash);setEnabled(d.policy.enabled===1);setError('')}catch(e){setError(String(e))}finally{setLoading(false)}}
 useEffect(()=>{refresh()},[]);
 useEffect(()=>{let active=true;fetch('/api/rewards/report?date='+encodeURIComponent(reportDate)).then(r=>{if(!r.ok)throw Error('โหลดรายงานไม่ได้');return r.json()}).then(r=>{if(active)setDaily(r)}).catch(()=>{if(active)setDaily(null)});return()=>{active=false}},[reportDate,data]);
 async function send(body:Record<string,unknown>,success='บันทึกเรียบร้อย'){setBusy(true);setError('');try{const r=await fetch('/api/rewards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());setNotice(success);await refresh()}catch(e){setError(String(e))}finally{setBusy(false)}}
 function enroll(ev:FormEvent<HTMLFormElement>){ev.preventDefault();const f=new FormData(ev.currentTarget);void send({action:'enroll',recordId:f.get('recordId')},'เปิดสิทธิ์สะสมคะแนนให้รถใน CRM แล้ว');ev.currentTarget.reset()}
 const review=data?.jobs.filter(j=>j.status==='needs_review'||(!j.member_id&&j.status!=='excluded')||j.service_type==='unknown')||[];
 const totalPoints=data?.members.reduce((n,m)=>n+Number(m.points),0)||0;
 return <section className="panel">
  <div className="topline"><h2>Rewards · สะสมคะแนนล้างรถ</h2><button className="btn secondary" disabled={loading} onClick={refresh}>รีเฟรช</button></div>
  <p className="helper">ให้คะแนนตามครั้งที่ล้างสำเร็จ หลังพนักงาน Reply ปิดงานและยืนยันว่าเป็นรถสมาชิก คะแนนไม่ขึ้นจากการส่งรูปเพียงอย่างเดียว</p>
  {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice success" role="status">{notice}</p>}
  {loading?<p>กำลังโหลดข้อมูล…</p>:<>
   <div className="metrics"><div className="metric"><span>รถสมาชิก</span><strong>{data?.members.length||0}</strong></div><div className="metric"><span>คะแนนที่ยังใช้ได้</span><strong>{totalPoints}</strong></div><div className="metric"><span>งานรอตรวจสอบ</span><strong>{review.length}</strong></div></div>
   <section className="card field-row">
    <div className="topline"><h3>รายงานรถและรายรับประจำวัน</h3><label>วันที่ <input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></label></div>
    {daily?<><div className="metrics">
     <div className="metric"><span>รถเข้าร้าน</span><strong>{daily.summary.arrivals}</strong></div>
     <div className="metric"><span>มี Reply ปิดงาน</span><strong>{daily.summary.closedArrivals}</strong></div>
     <div className="metric"><span>ยังไม่ Reply</span><strong>{daily.summary.waiting}</strong></div>
     <div className="metric"><span>เงินสด</span><strong>{daily.summary.cash.toLocaleString('th-TH')}</strong></div>
     <div className="metric"><span>เงินโอน</span><strong>{daily.summary.transfer.toLocaleString('th-TH')}</strong></div>
     <div className="metric"><span>รายรับรวม</span><strong>{daily.summary.total.toLocaleString('th-TH')} บาท</strong></div>
    </div><pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit'}}>{daily.report}</pre></>:<p className="helper">ไม่สามารถอ่านรายงานได้ กรุณาตรวจฐานข้อมูลและการตั้งค่า</p>}
   </section>
   <form className="card" onSubmit={e=>{e.preventDefault();void send({action:'policy',enabled,pointsPerWash:points},'บันทึกกติกาคะแนนแล้ว')}}>
    <h3>กติกาการให้คะแนน</h3>
    <p className="helper">โปร 699 / 999 / 1999 และบริการอื่นไม่สะสมคะแนน · ล้างฟรียังไม่สะสมคะแนนจนกว่าจะเปิดการตรวจสิทธิ์โปรครบถ้วน</p>
    <div className="grid2 field-row"><label>คะแนนต่อการล้าง 1 ครั้ง<input type="number" min="1" max="1000" required value={points} onChange={e=>setPoints(Number(e.target.value))}/></label><label className="choice"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> เปิดให้สะสมคะแนนจาก LINE Bot</label></div>
    <button className="btn" disabled={busy}>บันทึกกติกา</button>
   </form>
   <form className="card" onSubmit={enroll}><h3>เปิดสิทธิ์คะแนนให้รถที่ลงทะเบียนกับ CRM</h3><p className="helper">เลือกรถที่ผ่านการยืนยันบริการใน CRM แล้ว ข้อมูลชื่อและทะเบียนจะถูกดึงจากฐานเดิม ไม่สร้างลูกค้าใหม่</p>
    <label>รถที่ลงทะเบียนแล้ว *<select className="search" name="recordId" required defaultValue=""><option value="" disabled>เลือกทะเบียนและลูกค้า</option>{data?.registered.map(r=><option key={r.id} value={r.id}>{r.plate} · {r.province} — {r.name}</option>)}</select></label>
    <div className="field-row"><button className="btn" disabled={busy||!data?.registered.length}>เปิดสิทธิ์คะแนน</button></div>
   </form>
   <section className="field-row"><h3>คะแนนสมาชิก</h3>{!data?.members.length?<p className="helper">ยังไม่มีรถสมาชิกที่ลงทะเบียน</p>:<div className="grid2">{data.members.map(m=><div className="card" key={m.id}><strong>{m.plate} · {m.province}</strong><p>{m.customer_name}</p><p className="helper">{m.phone}</p><div className="card-head"><span>ล้าง {m.washes} ครั้ง</span><strong>{m.points} คะแนน</strong></div></div>)}</div>}</section>
   <section className="field-row"><h3>รายการจากกลุ่ม LINE</h3><p className="helper">รูปและเลขทะเบียนที่ AI อ่านได้ต้องตรวจให้ตรงก่อนยืนยันรายการที่ไม่แน่ใจ</p>
    {!data?.jobs.length?<p className="helper">ยังไม่มีรายการจากกลุ่มพนักงาน หรือยังไม่เปิดรับ Webhook</p>:data.jobs.map(j=><div className="card" key={j.image_id}>
     <div className="card-head"><div><strong>{j.plate||'ยังอ่านทะเบียนไม่ได้'} {j.province||''}</strong><p>{[j.brand,j.model,j.color].filter(Boolean).join(' / ')||'รถรอวิเคราะห์'}</p><p className="helper">{new Date(j.opened_at).toLocaleString('th-TH')} · ความมั่นใจทะเบียน {j.plate_confidence}%</p></div><span className={'status '+(j.award_active===1?'success':'')}>{j.award_active===1?'+'+j.award_points+' คะแนน':j.status==='excluded'?'ไม่คิดคะแนน':j.status}</span></div>
     {j.image_key&&<img loading="lazy" style={{width:220,maxWidth:'100%',borderRadius:8,marginTop:8}} src={'/api/rewards/photo?id='+encodeURIComponent(j.image_id)} alt="รูปท้ายรถจาก LINE สำหรับตรวจทะเบียน"/>}
     <p className="helper">Reply: {j.reply_text||'ยังไม่ปิดงาน'} · ประเภท {j.service_type} · {j.amount===null?'ไม่มียอด':j.amount+' บาท'} {j.payment_method}</p>
     <p className="helper">สมาชิก: {j.member_name||'ยังไม่จับคู่'}</p>
     {j.status!=='excluded'&&<div className="field-row"><div className="grid2"><label>ยืนยันรถสมาชิก<select className="search" value={matches[j.image_id]||j.member_id||''} onChange={e=>setMatches(s=>({...s,[j.image_id]:e.target.value}))}><option value="">เลือกจากสมาชิก</option>{data.members.map(m=><option value={m.id} key={m.id}>{m.plate} {m.province} · {m.customer_name}</option>)}</select></label><button className="btn secondary" disabled={busy||!(matches[j.image_id]||j.member_id)} onClick={()=>send({action:'confirm_job',jobId:j.image_id,memberId:matches[j.image_id]||j.member_id},'ยืนยันรถในงานแล้ว')}>ยืนยันจับคู่</button></div>
       <div className="field-row"><button className="btn secondary" disabled={busy||!j.reply_text||!j.member_id} onClick={()=>send({action:'mark_wash',jobId:j.image_id},'ยืนยันประเภทงานล้างรถแล้ว')}>ยืนยันว่าเป็นงานล้างรถ</button><button className="btn secondary" disabled={busy} onClick={()=>send({action:'exclude_job',jobId:j.image_id},'ยกเลิกการนับคะแนนงานนี้แล้ว')}>ไม่ใช่งานที่ต้องนับคะแนน</button></div></div>}
    </div>)}
   </section>
   <section className="field-row"><h3>ประวัติเปลี่ยนคะแนน</h3>{!data?.transactions.length?<p className="helper">ยังไม่มีการให้คะแนน</p>:data.transactions.map(t=><div className="card" key={t.id}><div className="card-head"><span>{t.plate} · {t.province}</span><strong>{t.points_delta>0?'+':''}{t.points_delta} คะแนน</strong></div><p className="helper">{new Date(t.created_at).toLocaleString('th-TH')} · {t.reason}</p></div>)}</section>
  </>}
 </section>;
}
