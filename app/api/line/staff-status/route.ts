import {env} from 'cloudflare:workers';
import {owner,fail} from '@/lib/server';
import {lineMessageUsage} from '@/lib/line-usage';
export async function GET(){
 try{
  await owner();
  const c=env as Cloudflare.Env;
  const channelId=c.BJ_STAFF_LINE_CHANNEL_ID||'',token=c.BJ_STAFF_LINE_CHANNEL_ACCESS_TOKEN||'';
  const verified={channelId:false,account:false,displayName:'',basicId:''};
  if(token){
   try{
    const response=await fetch('https://api.line.me/oauth2/v2.1/verify?access_token='+encodeURIComponent(token),{signal:AbortSignal.timeout(5000)});
    if(response.ok){const access=await response.json() as {client_id?:string};verified.channelId=access.client_id===channelId&&channelId==='2008901990';
     if(verified.channelId){const bot=await fetch('https://api.line.me/v2/bot/info',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)});if(bot.ok){const info=await bot.json() as {displayName?:string;basicId?:string};verified.displayName=info.displayName||'';verified.basicId=info.basicId||'';verified.account=verified.displayName==='BJ Carcare AI'&&verified.basicId==='@445qplae'}}
    }
   }catch{ /* report unverified; never expose token or API details */ }
  }
  const ready={staffChannelSecret:!!c.BJ_STAFF_LINE_CHANNEL_SECRET,staffChannelAccessToken:!!token,staffGroupId:!!c.BJ_STAFF_LINE_GROUP_ID,crmOwnerId:!!c.BJ_OWNER_ID,aiVehicleRecognition:!!c.OPENAI_API_KEY,durableImageQueue:!!c.BJ_WASH_QUEUE,channelIdConfigured:channelId==='2008901990',channelIdentityVerified:verified.channelId&&verified.account};
  const messageUsage=await lineMessageUsage(token);
  return Response.json({
   staffBotEnabled:c.BJ_WASH_BOT_ENABLED==='true'&&Object.entries(ready).filter(([key])=>key!=='aiVehicleRecognition').every(([,value])=>value),
   expectedStaffChannel:{channelId:'2008901990',basicId:'@445qplae',displayName:'BJ Carcare AI'},
   verifiedStaffChannel:verified,
   messageUsage,
   ready,
   webhookPath:'/api/line/staff-webhook',
   commands:['สรุปยอด','#ยอดวันนี้','สรุปยอดเมื่อวาน','สรุปยอด YYYY-MM-DD'],
   staffBotAutoMessages:0
  },{headers:{'Cache-Control':'private,no-store'}});
 }catch(e){return fail(e)}
}
