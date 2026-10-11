import {db,bucket,owner,fail} from '@/lib/server';
export async function GET(req:Request){
 try{
  const uid=await owner(),url=new URL(req.url),id=url.searchParams.get('id')||'',claimId=url.searchParams.get('claim')||'';
  if((!id&&!claimId)||id.length>100||claimId.length>100)return new Response('Not found',{status:404});
  const row=id?await db().prepare('SELECT image_key FROM wash_jobs WHERE owner=? AND image_id=?').bind(uid,id).first<{image_key:string|null}>():await db().prepare('SELECT image_key FROM customer_slip_claims WHERE owner=? AND id=?').bind(uid,claimId).first<{image_key:string|null}>();
  if(!row?.image_key)return new Response('Not found',{status:404});
  const asset=await bucket().get(row.image_key);
  if(!asset)return new Response('Not found',{status:404});
  return new Response(asset.body,{headers:{'Content-Type':asset.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
 }catch(e){return fail(e)}
}
