export type StaffChannelIdentity={channelId:boolean;account:boolean;displayName:string;basicId:string};

export async function verifyStaffChannelIdentity(
 token:string,
 expectedChannelId:string,
 expectedDisplayName='BJ Carcare AI',
 expectedBasicId='@445qplae',
 request:typeof fetch=fetch
):Promise<StaffChannelIdentity>{
 const result:StaffChannelIdentity={channelId:false,account:false,displayName:'',basicId:''};
 if(!token||!expectedChannelId)return result;
 try{
  const auth=await request('https://api.line.me/oauth2/v2.1/verify?access_token='+encodeURIComponent(token),{signal:AbortSignal.timeout(5000)});
  if(!auth.ok)return result;
  const details=await auth.json() as {client_id?:string};
  result.channelId=details.client_id===expectedChannelId;
  if(!result.channelId)return result;
  const bot=await request('https://api.line.me/v2/bot/info',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)});
  if(!bot.ok)return result;
  const info=await bot.json() as {displayName?:string;basicId?:string};
  result.displayName=info.displayName||'';
  result.basicId=info.basicId||'';
  result.account=result.displayName===expectedDisplayName&&result.basicId===expectedBasicId;
 }catch{/* report unverified; never expose token or API details */}
 return result;
}
