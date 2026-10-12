export interface WashJobReportRow {
 status:string;
 service_type:string;
 payment_method:string;
 amount:number|null;
 owner_verified:number;
 opened_at:string;
 closed_at:string|null;
 reply_id:string|null;
}
export interface WashDailySummary {
 date:string; arrivals:number; closedArrivals:number; waiting:number; needsReview:number; unverifiedPayments:number;
 closedToday:number; paidWashes:number; freeWashes:number; promoSales:number;
 otherServices:number; film:number; ceramicMaintenance:number; ceramicFull:number; seat:number; carpet:number; headlight:number; ozone:number; cash:number; transfer:number; total:number;
}
export function bangkokDate(value:Date|number|string=new Date()):string{
 const d=value instanceof Date?value:new Date(value);
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
export function bangkokDateRange(date:string):[string,string] {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00+07:00')))throw Error('Invalid report date');
 const start=Date.parse(date+'T00:00:00+07:00');
 if(bangkokDate(start)!==date)throw Error('Invalid report date');
 return [new Date(start).toISOString(),new Date(start+86400000).toISOString()];
}
export function summarizeWashDay(date:string,rows:WashJobReportRow[]):WashDailySummary {
 const out:WashDailySummary={date,arrivals:0,closedArrivals:0,waiting:0,needsReview:0,unverifiedPayments:0,closedToday:0,paidWashes:0,freeWashes:0,promoSales:0,otherServices:0,film:0,ceramicMaintenance:0,ceramicFull:0,seat:0,carpet:0,headlight:0,ozone:0,cash:0,transfer:0,total:0};
 for(const job of rows) {
  if(job.status==='excluded')continue;
  const arrival=bangkokDate(job.opened_at)===date;
  const closed=job.status==='closed' && !!job.reply_id && !!job.closed_at && bangkokDate(job.closed_at)===date;
  if(arrival) {
   out.arrivals++;
   if(job.status==='closed')out.closedArrivals++;
   else if(job.status==='open'&&!job.reply_id)out.waiting++;
   if(job.status==='needs_review')out.needsReview++;
  }
  if(!closed)continue;
  out.closedToday++;
  if(job.service_type==='wash')out.paidWashes++;
  else if(job.service_type==='free_wash')out.freeWashes++;
  else if(job.service_type==='promo_sale'||job.service_type==='membership_sale')out.promoSales++;
  else if(job.service_type==='film')out.film++;
  else if(job.service_type==='ceramic_maintenance')out.ceramicMaintenance++;
  else if(job.service_type==='ceramic_full')out.ceramicFull++;
  else if(job.service_type==='seat')out.seat++;
  else if(job.service_type==='carpet')out.carpet++;
  else if(job.service_type==='headlight')out.headlight++;
  else if(job.service_type==='ozone')out.ozone++;
  else out.otherServices++;
  const amount=Number(job.amount);
  if(!Number.isSafeInteger(amount)||amount<=0)continue;
  if(job.owner_verified!==1&&['cash','transfer'].includes(job.payment_method))out.unverifiedPayments++;
  if(job.payment_method==='cash')out.cash+=amount;
  else if(job.payment_method==='transfer')out.transfer+=amount;
 }
 out.total=out.cash+out.transfer;
 return out;
}
const money=(value:number)=>new Intl.NumberFormat('th-TH',{maximumFractionDigits:0}).format(value);
export function formatWashSummary(s:WashDailySummary):string{
 const [y,m,d]=s.date.split('-').map(Number);
 const thaiDate=new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(Date.UTC(y,m-1,d)));
 return [
 'BJ CARCARE | สรุปยอด '+thaiDate,
 'รถเข้า: '+s.arrivals+' คัน',
  'งานปิดแล้วจากรถเข้าวันนี้: '+s.closedArrivals+' คัน',
 'งานยังไม่ปิด: '+s.waiting+' คัน',
 'รอตรวจสอบข้อมูล: '+s.needsReview+' คัน',
 'รอยืนยันยอดรับเงินจริง: '+s.unverifiedPayments+' งาน',
 '────────────',
 'รายการปิดยอดวันนี้: '+s.closedToday+' งาน',
 'ล้างรถชำระเงิน: '+s.paidWashes+' งาน',
 'ล้างฟรี: '+s.freeWashes+' งาน',
 'ขายโปร/สมาชิก: '+s.promoSales+' งาน',
  'ติดฟิล์ม: '+s.film+' · เคลือบแก้ว Maintenance: '+s.ceramicMaintenance+' · เคลือบแก้วเต็ม: '+s.ceramicFull,
  'ซักเบาะ: '+s.seat+' · ซักพรม: '+s.carpet+' · ขัดไฟ: '+s.headlight+' · อบโอโซน: '+s.ozone,
  'บริการอื่น/ไม่ระบุ: '+s.otherServices+' งาน',
 '────────────',
 'เงินสด: '+money(s.cash)+' บาท',
 'เงินโอน: '+money(s.transfer)+' บาท',
 'รวมรับชำระ: '+money(s.total)+' บาท',
 'หมายเหตุ: ยอดคำนวณจาก Reply พนักงาน ยังไม่ใช่ยอดยืนยันธนาคาร',
 ].join('\n');
}
export function reportCommand(input:string,localDate:string):string|null {
 const text=input.trim().replace(/\s+/g,' ');
 if(/^(#ยอดวันนี้|สรุปยอด|ยอดวันนี้)$/i.test(text))return localDate;
 if(/^(#ยอดเมื่อวาน|สรุปยอดเมื่อวาน|ยอดเมื่อวาน)$/i.test(text)){
  const yesterday=new Date(Date.parse(localDate+'T00:00:00+07:00')-86400000);
  return bangkokDate(yesterday);
 }
 const m=text.match(/^(?:สรุปยอด|#สรุปยอด)\s+(\d{4}-\d{2}-\d{2})$/);
 return m?m[1]:null;
}
