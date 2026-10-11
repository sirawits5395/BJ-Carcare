import {env} from 'cloudflare:workers';
import {owner,fail} from '@/lib/server';
export async function GET(){
 try{
  await owner();
  const c=env as any;
  return Response.json({
   staffBotEnabled:c.BJ_WASH_BOT_ENABLED==='true',
   ready:{
    staffChannelSecret:!!c.BJ_STAFF_LINE_CHANNEL_SECRET,
    staffChannelAccessToken:!!c.BJ_STAFF_LINE_CHANNEL_ACCESS_TOKEN,
    staffGroupId:!!c.BJ_STAFF_LINE_GROUP_ID,
    crmOwnerId:!!c.BJ_OWNER_ID,
    aiVehicleRecognition:!!c.OPENAI_API_KEY
   },
   webhookPath:'/api/line/staff-webhook',
   commands:['สรุปยอด','#ยอดวันนี้','สรุปยอดเมื่อวาน','สรุปยอด YYYY-MM-DD'],
   staffBotAutoMessages:0
  },{headers:{'Cache-Control':'private,no-store'}});
 }catch(e){return fail(e)}
}
