import {env} from 'cloudflare:workers';
import {owner,fail} from '@/lib/server';
import {lineMessageUsage} from '@/lib/line-usage';
import {verifyStaffChannelIdentity} from '@/lib/staff-channel';
export async function GET(){
 try{
  await owner();
  const c=env as Cloudflare.Env;
  const channelId=c.BJ_STAFF_LINE_CHANNEL_ID||'',token=c.BJ_STAFF_LINE_CHANNEL_ACCESS_TOKEN||'';
  const expectedDisplayName=c.BJ_STAFF_EXPECTED_DISPLAY_NAME||'BJ Carcare AI',expectedBasicId=c.BJ_STAFF_EXPECTED_BASIC_ID||'@445qplae';
  const verified=await verifyStaffChannelIdentity(token,channelId,expectedDisplayName,expectedBasicId);
  const ready={staffChannelSecret:!!c.BJ_STAFF_LINE_CHANNEL_SECRET,staffChannelAccessToken:!!token,staffGroupId:!!c.BJ_STAFF_LINE_GROUP_ID,crmOwnerId:!!c.BJ_OWNER_ID,aiVehicleRecognition:!!c.OPENAI_API_KEY,durableImageQueue:!!c.BJ_WASH_QUEUE,channelIdConfigured:!!channelId,channelIdentityVerified:verified.channelId&&verified.account};
  const messageUsage=await lineMessageUsage(token);
  return Response.json({
   staffBotEnabled:c.BJ_WASH_BOT_ENABLED==='true'&&Object.entries(ready).filter(([key])=>key!=='aiVehicleRecognition').every(([,value])=>value),
   expectedStaffChannel:{channelId,basicId:expectedBasicId,displayName:expectedDisplayName},
   verifiedStaffChannel:verified,
   messageUsage,
   ready,
   webhookPath:'/api/line/staff-webhook',
   commands:['สรุปยอด','#ยอดวันนี้','สรุปยอดเมื่อวาน','สรุปยอด YYYY-MM-DD'],
   staffBotAutoMessages:0
  },{headers:{'Cache-Control':'private,no-store'}});
 }catch(e){return fail(e)}
}
