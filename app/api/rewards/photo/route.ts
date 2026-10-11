import {db,bucket,owner,fail} from '@/lib/server';
export async function GET(req:Request){
 try{
  const uid=await owner(),id=new URL(req.url).searchParams.get('id')||'';
  if(!id||id.length>100)return new Response('Not found',{status:404});
  const job:any=await db().prepare('SELECT image_key FROM wash_jobs WHERE owner=? AND image_id=?').bind(uid,id).first();
  if(!job?.image_key)return new Response('Not found',{status:404});
  const asset=await bucket().get(job.image_key);
  if(!asset)return new Response('Not found',{status:404});
  return new Response(asset.body,{headers:{'Content-Type':asset.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
 }catch(e){return fail(e)}
}
