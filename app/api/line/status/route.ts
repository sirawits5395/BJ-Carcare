import {env} from 'cloudflare:workers';
import {owner,db,fail} from '@/lib/server';
import {lineConfig} from '@/lib/line-config';
import {lineMessageUsage} from '@/lib/line-usage';
import {today} from '@/lib/care';

export async function GET(){
 try{
  const uid=await owner(),c=lineConfig(),runtime=env as Cloudflare.Env;
  const [rows,due,linked]=await Promise.all([
   db().prepare('SELECT status,COUNT(*) count FROM message_outbox WHERE owner=? GROUP BY status').bind(uid).all(),
   db().prepare('SELECT COUNT(*) count FROM visits v JOIN records r ON r.id=v.record_id WHERE r.owner=? AND r.status=? AND v.completed IS NULL AND v.due<=?').bind(uid,'approved',today()).first<{count:number}>(),
   db().prepare('SELECT COUNT(*) count FROM records WHERE owner=? AND line_user_id IS NOT NULL').bind(uid).first<{count:number}>()
  ]);
  const legacyOwner=runtime.BJ_LEGACY_OWNER_ID;
  const unlinked=legacyOwner?await db().prepare('SELECT COUNT(*) count FROM records WHERE owner=?').bind(legacyOwner).first<{count:number}>():null;
  const registrationNotify=runtime.BJ_REGISTRATION_NOTIFY_USER_ID||'';
  return Response.json({
   ownerId:uid,account:'@bjcarcare',
   ready:{messagingToken:!!c.token,channelSecret:!!c.secret,loginChannelId:!!c.loginChannelId,liffId:!!c.liffId,shopOwner:c.ownerId===uid,schedulerSecret:!!c.cronSecret,registrationNotify:/^U[0-9a-f]{32}$/.test(registrationNotify)},
   sendingEnabled:c.enabled,linked:linked?.count||0,unlinked:unlinked?.count||0,due:due?.count||0,outbox:rows.results,
   messageUsage:await lineMessageUsage(c.token)
  },{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e)}
}
