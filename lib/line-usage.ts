export type LineMessageUsage={state:'available'|'unavailable';quotaType:string|null;quota:number|null;consumed:number|null};
type QuotaBody={type?:string;value?:number};
type ConsumptionBody={totalUsage?:number};
export async function lineMessageUsage(token:string,fetcher:typeof fetch=fetch):Promise<LineMessageUsage>{
 if(!token)return {state:'unavailable',quotaType:null,quota:null,consumed:null};
 try{
  const [quotaResponse,consumptionResponse]=await Promise.all([
   fetcher('https://api.line.me/v2/bot/message/quota',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)}),
   fetcher('https://api.line.me/v2/bot/message/quota/consumption',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)})
  ]);
  if(!quotaResponse.ok||!consumptionResponse.ok)return {state:'unavailable',quotaType:null,quota:null,consumed:null};
  const quota=await quotaResponse.json() as QuotaBody,consumption=await consumptionResponse.json() as ConsumptionBody;
  return {state:'available',quotaType:typeof quota.type==='string'?quota.type:null,quota:Number.isFinite(quota.value)?Number(quota.value):null,consumed:Number.isFinite(consumption.totalUsage)?Number(consumption.totalUsage):null};
 }catch{return {state:'unavailable',quotaType:null,quota:null,consumed:null}}
}
