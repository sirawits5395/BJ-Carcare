import {db,owner,sameOrigin,fail} from '@/lib/server';
import {washSchemaSql} from '@/lib/wash-schema';

// One-time, idempotent D1 schema setup for an owner-authenticated deployment.
// No caller-supplied SQL is ever executed.
export async function POST(req:Request){
 try{
  sameOrigin(req);
  await owner();
  await db().exec(washSchemaSql);
  const required=['reward_members','reward_policies','wash_jobs','line_job_replies','reward_awards','reward_entitlements','reward_entitlement_audit','reward_audit','line_staff_command_events','wash_job_audit','customer_slip_claims','customer_slip_claim_audit','bj_schema_migrations'];
  const placeholders=required.map(()=>'?').join(',');
  const rows=await db().prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`)
   .bind(...required).all<{name:string}>();
  const found=new Set(rows.results.map(row=>row.name));
  const missing=required.filter(name=>!found.has(name));
  if(missing.length)throw Error('Wash migration incomplete: '+missing.join(','));
  return Response.json({ok:true,migration:'20261011_wash_rewards',verifiedTables:required.length,rewardsEnabled:false});
 }catch(e){return fail(e)}
}
