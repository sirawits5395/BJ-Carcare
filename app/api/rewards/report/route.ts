import {owner,db,fail} from '@/lib/server';
import {bangkokDate,bangkokDateRange,summarizeWashDay,formatWashSummary,type WashJobReportRow} from '@/lib/wash-report';
export async function GET(req:Request){
 try{
  const uid=await owner(),url=new URL(req.url),date=url.searchParams.get('date')||bangkokDate();
  const [start,end]=bangkokDateRange(date);
  const rows=await db().prepare(
    'SELECT status,service_type,payment_method,amount,owner_verified,opened_at,closed_at,reply_id FROM wash_jobs WHERE owner=? AND (opened_at>=? AND opened_at<? OR closed_at>=? AND closed_at<?)'
  ).bind(uid,start,end,start,end).all<WashJobReportRow>();
  const summary=summarizeWashDay(date,rows.results);
  return Response.json({summary,report:formatWashSummary(summary)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof Error&&e.message==='Invalid report date')return new Response('วันที่ไม่ถูกต้อง',{status:400});return fail(e)}
}
