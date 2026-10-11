import {env} from 'cloudflare:workers';
import {verifySignature} from '@/lib/line-core';
import {handleStaffGroupEvent,queueStaffImage} from '@/lib/wash-automation';
import {fail} from '@/lib/server';

// Separate Messaging API channel for the internal staff group.
// Never reuse the customer-facing @bjcarcare signature secret.
export async function POST(req:Request){
 try{
  const secret=(env as Cloudflare.Env).BJ_STAFF_LINE_CHANNEL_SECRET;
  if(!secret)return new Response('Not configured',{status:503});
  if(Number(req.headers.get('content-length')||0)>1024*1024)return new Response('Too large',{status:413});
  const raw=await req.text();
  if(raw.length>1024*1024)return new Response('Too large',{status:413});
  if(!await verifySignature(raw,req.headers.get('x-line-signature'),secret))return new Response('Invalid signature',{status:401});
  const body=JSON.parse(raw);
  if(!Array.isArray(body.events)||body.events.length>100)return new Response('Invalid events',{status:400});
  for(const e of body.events){
   if(e?.type==='message'&&e.message?.type==='image')await queueStaffImage(e);
   else await handleStaffGroupEvent(e);
  }
  return Response.json({ok:true});
 }catch(e){return fail(e)}
}
