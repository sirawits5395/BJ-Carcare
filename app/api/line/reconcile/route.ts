import {env} from 'cloudflare:workers';
import {db,fail,owner,sameOrigin} from '@/lib/server';

export async function POST(req:Request){
  try{
    sameOrigin(req);
    const uid=await owner();
    const e=env as any;
    if(!e.BJ_OWNER_ID||uid!==e.BJ_OWNER_ID||!e.BJ_LEGACY_OWNER_ID||e.BJ_LEGACY_OWNER_ID===uid)return new Response('บัญชีร้านยังไม่พร้อม',{status:503});
    const result=await db().prepare('UPDATE records SET owner=? WHERE owner=?').bind(uid,e.BJ_LEGACY_OWNER_ID).run();
    return Response.json({moved:result.meta.changes||0});
  }catch(error){return fail(error)}
}
