-- BJ CARCARE wash rewards (apply to D1 before enabling BJ_WASH_BOT_ENABLED).
-- Owners enroll vehicles only after verifying customer/vehicle association.
CREATE TABLE IF NOT EXISTS reward_members (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, plate TEXT NOT NULL, province TEXT NOT NULL,
 plate_key TEXT NOT NULL, province_key TEXT NOT NULL,
 customer_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', source_record_id TEXT REFERENCES records(id),
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_vehicle_unique ON reward_members(owner, plate_key, province_key);
CREATE TABLE IF NOT EXISTS reward_policies (
 owner TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0,
 points_per_wash INTEGER NOT NULL DEFAULT 10, include_free INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS wash_jobs (
 image_id TEXT PRIMARY KEY, owner TEXT NOT NULL, group_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open', analysis_status TEXT NOT NULL DEFAULT 'complete', image_key TEXT, image_sha256 TEXT, duplicate_of TEXT,
 plate TEXT, province TEXT, brand TEXT, model TEXT, color TEXT,
 plate_confidence INTEGER NOT NULL DEFAULT 0, member_id TEXT REFERENCES reward_members(id), owner_verified INTEGER NOT NULL DEFAULT 0,
 service_type TEXT NOT NULL DEFAULT 'unknown', payment_method TEXT NOT NULL DEFAULT 'none',
 amount INTEGER, reply_id TEXT, reply_text TEXT, reply_at TEXT, opened_at TEXT NOT NULL, closed_at TEXT,
 updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_wash_jobs_owner_opened ON wash_jobs(owner,opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_wash_jobs_group ON wash_jobs(group_id,image_id);
CREATE INDEX IF NOT EXISTS idx_wash_image_hash ON wash_jobs(owner,image_sha256) WHERE image_sha256 IS NOT NULL;
CREATE TABLE IF NOT EXISTS line_job_replies (
 message_id TEXT PRIMARY KEY, job_image_id TEXT NOT NULL REFERENCES wash_jobs(image_id)
);
CREATE TABLE IF NOT EXISTS reward_awards (
 job_image_id TEXT PRIMARY KEY REFERENCES wash_jobs(image_id),
 owner TEXT NOT NULL, member_id TEXT NOT NULL REFERENCES reward_members(id),
 points INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_awards_member ON reward_awards(member_id,active);
CREATE TABLE IF NOT EXISTS reward_entitlements (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, member_id TEXT NOT NULL REFERENCES reward_members(id),
 source_job_id TEXT NOT NULL UNIQUE REFERENCES wash_jobs(image_id), benefit TEXT NOT NULL DEFAULT 'free_wash',
 status TEXT NOT NULL DEFAULT 'active', valid_from TEXT NOT NULL, expires_at TEXT NOT NULL,
 redeemed_job_id TEXT UNIQUE REFERENCES wash_jobs(image_id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_entitlements_member_status ON reward_entitlements(owner,member_id,status,expires_at);
CREATE TABLE IF NOT EXISTS reward_entitlement_audit (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, entitlement_id TEXT NOT NULL, job_image_id TEXT NOT NULL,
 action TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_entitlement_audit_owner_created ON reward_entitlement_audit(owner,created_at DESC);
CREATE TABLE IF NOT EXISTS reward_audit (
 id TEXT PRIMARY KEY, event_key TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, member_id TEXT NOT NULL,
 job_image_id TEXT NOT NULL, points_delta INTEGER NOT NULL,
 reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_audit_owner_created ON reward_audit(owner,created_at DESC);

-- Prevent redelivery of the same staff report command from generating duplicate replies.
CREATE TABLE IF NOT EXISTS line_staff_command_events (
 message_id TEXT PRIMARY KEY, group_id TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wash_job_audit (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, image_id TEXT NOT NULL,
 actor TEXT NOT NULL, action TEXT NOT NULL, before_json TEXT NOT NULL,
 after_json TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wash_audit_owner_created ON wash_job_audit(owner,created_at DESC);

-- Customer slip claims are bound to the authenticated LINE user and a single-use hashed token.
CREATE TABLE IF NOT EXISTS customer_slip_claims (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, line_user_id TEXT NOT NULL,
 source_message_id TEXT NOT NULL UNIQUE, token_hash TEXT NOT NULL UNIQUE,
 image_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 plate TEXT, province TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 used_at TEXT, confirmed_record_id TEXT, confirmed_job_image_id TEXT UNIQUE, reply_sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_slip_claim_owner_status ON customer_slip_claims(owner,status,created_at DESC);
CREATE TABLE IF NOT EXISTS customer_slip_claim_audit (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, claim_id TEXT NOT NULL, actor TEXT NOT NULL,
 action TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_slip_claim_audit_owner_created ON customer_slip_claim_audit(owner,created_at DESC);
