import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const sql=readFileSync(new URL('./migrations/20261011_wash_rewards.sql',import.meta.url),'utf8');
const runtimeSchema=readFileSync(new URL('./lib/wash-schema.ts',import.meta.url),'utf8').match(/export const washSchemaSql = `([\s\S]*?)`;\s*$/)?.[1];
assert.ok(runtimeSchema,'owner migration endpoint must use the checked-in runtime schema');
const runtimeDb=new DatabaseSync(':memory:');
runtimeDb.exec('CREATE TABLE records(id TEXT PRIMARY KEY);');
runtimeDb.exec(runtimeSchema);
assert.equal(runtimeDb.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name IN ('reward_members','reward_policies','wash_jobs','line_job_replies','reward_awards','reward_entitlements','reward_entitlement_audit','reward_audit','line_staff_command_events','wash_job_audit','customer_slip_claims','customer_slip_claim_audit','bj_schema_migrations')").get().count,13);
runtimeDb.exec(runtimeSchema);
assert.equal(runtimeDb.prepare("SELECT COUNT(*) count FROM bj_schema_migrations WHERE id='20261011_wash_rewards'").get().count,1);
runtimeDb.close();
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE records(id TEXT PRIMARY KEY);');
db.exec(sql);
db.exec("INSERT INTO records(id) VALUES('record-1');");
const at='2026-10-11T00:00:00.000Z';
db.prepare("INSERT INTO reward_members(id,owner,plate,province,plate_key,province_key,customer_name,phone,source_record_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
 .run('member-1','owner-1','กข 1234','กรุงเทพมหานคร','กข1234','กรุงเทพมหานคร','Customer','0990000000','record-1',at);
db.prepare("INSERT INTO reward_policies(owner,enabled,points_per_wash,include_free) VALUES(?,1,10,0)").run('owner-1');
db.prepare("INSERT INTO wash_jobs(image_id,owner,group_id,status,analysis_status,image_sha256,opened_at,updated_at) VALUES(?,?,'group-1','closed','complete','same-sha',?,?)")
 .run('job-1','owner-1',at,at);
// Identical image content is retained as a flagged duplicate, not rejected by a unique index.
db.prepare("INSERT INTO wash_jobs(image_id,owner,group_id,status,analysis_status,image_sha256,duplicate_of,opened_at,updated_at) VALUES(?,?,'group-1','needs_review','complete','same-sha','job-1',?,?)")
 .run('job-2','owner-1',at,at);
assert.equal(db.prepare('SELECT COUNT(*) count FROM wash_jobs WHERE image_sha256=?').get('same-sha').count,2);

function batchAward(active,points){
 db.exec('BEGIN');
 try{
  db.prepare("INSERT OR IGNORE INTO reward_awards(job_image_id,owner,member_id,points,active,created_at,updated_at) SELECT ?,?,'member-1',?,1,?,? WHERE EXISTS(SELECT 1 FROM wash_jobs WHERE image_id=? AND owner=? AND status='closed' AND owner_verified=1 AND amount>0 AND payment_method IN ('cash','transfer'))")
   .run('job-1','owner-1',points,at,at,'job-1','owner-1');
  db.prepare('INSERT INTO reward_audit(id,event_key,owner,member_id,job_image_id,points_delta,reason,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1')
   .run(crypto.randomUUID(),crypto.randomUUID(),'owner-1','member-1','job-1',active?points:-points,active?'award':'reverse',at);
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error}
}
db.prepare("UPDATE wash_jobs SET amount=250,payment_method='transfer' WHERE image_id='job-1'").run();
batchAward(true,10);
assert.equal(db.prepare("SELECT COUNT(*) count FROM reward_awards WHERE job_image_id='job-1'").get().count,0,'staff reply alone must not award points');
db.prepare("UPDATE wash_jobs SET owner_verified=1 WHERE image_id='job-1'").run();
batchAward(true,10);
batchAward(true,10);
assert.equal(db.prepare("SELECT COUNT(*) count FROM reward_audit WHERE job_image_id='job-1'").get().count,1);
db.prepare("UPDATE reward_awards SET active=0 WHERE job_image_id='job-1' AND active=1").run();
db.prepare("INSERT INTO reward_audit(id,event_key,owner,member_id,job_image_id,points_delta,reason,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1")
 .run(crypto.randomUUID(),crypto.randomUUID(),'owner-1','member-1','job-1',-10,'manual reversal',at);
assert.deepEqual(db.prepare("SELECT points_delta FROM reward_audit WHERE job_image_id='job-1' ORDER BY points_delta").all().map(x=>x.points_delta),[-10,10]);
db.prepare("INSERT INTO wash_jobs(image_id,owner,group_id,status,analysis_status,member_id,service_type,payment_method,amount,opened_at,closed_at,updated_at) VALUES('promo-job','owner-1','group-1','closed','complete','member-1','promo_sale','transfer',699,?,?,?)").run(at,at,at);
const expiry=new Date(Date.parse(at)+7*24*60*60*1000).toISOString();
db.prepare("INSERT INTO reward_entitlements(id,owner,member_id,source_job_id,benefit,status,valid_from,expires_at,created_at,updated_at) VALUES('ent-1','owner-1','member-1','promo-job','free_wash','active',?,?,?,?)").run(at,expiry,at,at);
db.prepare("INSERT INTO wash_jobs(image_id,owner,group_id,status,analysis_status,member_id,service_type,payment_method,opened_at,reply_id,reply_text,reply_at,updated_at) VALUES('free-job','owner-1','group-1','needs_review','complete','member-1','free_wash','none',?,'reply-1','ฟรี',?,?)").run(at,at,at);
db.exec('BEGIN');
db.prepare("UPDATE wash_jobs SET status='closed',closed_at=?,revision=revision+1 WHERE image_id='free-job' AND status='needs_review' AND EXISTS(SELECT 1 FROM reward_entitlements WHERE id='ent-1' AND status='active' AND valid_from<=? AND expires_at>?)").run(at,at,at);
db.prepare("UPDATE reward_entitlements SET status='redeemed',redeemed_job_id='free-job' WHERE id='ent-1' AND status='active' AND EXISTS(SELECT 1 FROM wash_jobs WHERE image_id='free-job' AND status='closed')").run();
db.prepare("INSERT INTO reward_entitlement_audit(id,owner,entitlement_id,job_image_id,action,reason,created_at) SELECT 'ent-audit-1','owner-1','ent-1','free-job','redeemed','test',? WHERE changes()=1").run(at);
db.exec('COMMIT');
assert.equal(db.prepare("SELECT status FROM reward_entitlements WHERE id='ent-1'").get().status,'redeemed');
assert.equal(db.prepare("SELECT COUNT(*) count FROM reward_entitlement_audit WHERE entitlement_id='ent-1'").get().count,1);
assert.equal(db.prepare("UPDATE reward_entitlements SET status='active',redeemed_job_id=NULL WHERE id='ent-1' AND status='active'").run().changes,0);
const addClaim=db.prepare("INSERT INTO customer_slip_claims(id,owner,line_user_id,source_message_id,token_hash,image_key,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)");
addClaim.run('claim-1','owner-1','U123','message-1','hash-1','slip-1',at,at);
assert.throws(()=>addClaim.run('claim-2','owner-1','U123','message-1','hash-2','slip-2',at,at));
assert.throws(()=>addClaim.run('claim-3','owner-1','U456','message-3','hash-1','slip-3',at,at));
console.log('PASS: migration schema, duplicate photo retention, single award ledger and slip-claim uniqueness');
db.close();
