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
 status TEXT NOT NULL DEFAULT 'open', image_key TEXT,
 plate TEXT, province TEXT, brand TEXT, model TEXT, color TEXT,
 plate_confidence INTEGER NOT NULL DEFAULT 0, member_id TEXT REFERENCES reward_members(id),
 service_type TEXT NOT NULL DEFAULT 'unknown', payment_method TEXT NOT NULL DEFAULT 'none',
 amount INTEGER, reply_id TEXT, reply_text TEXT, opened_at TEXT NOT NULL, closed_at TEXT,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wash_jobs_owner_opened ON wash_jobs(owner,opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_wash_jobs_group ON wash_jobs(group_id,image_id);
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
CREATE TABLE IF NOT EXISTS reward_audit (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, member_id TEXT NOT NULL,
 job_image_id TEXT NOT NULL, points_delta INTEGER NOT NULL,
 reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_audit_owner_created ON reward_audit(owner,created_at DESC);

-- Prevent redelivery of the same staff report command from generating duplicate replies.
CREATE TABLE IF NOT EXISTS line_staff_command_events (
 message_id TEXT PRIMARY KEY, group_id TEXT NOT NULL, created_at TEXT NOT NULL
);
