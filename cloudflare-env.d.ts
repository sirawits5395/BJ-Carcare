declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BJ_WASH_QUEUE?: Queue<import('./lib/wash-automation').StaffImageQueueMessage>;
    BJ_STAFF_LINE_CHANNEL_ID?: string;
    BJ_STAFF_LINE_CHANNEL_SECRET?: string;
    BJ_STAFF_LINE_CHANNEL_ACCESS_TOKEN?: string;
    BJ_STAFF_EXPECTED_DISPLAY_NAME?: string;
    BJ_STAFF_EXPECTED_BASIC_ID?: string;
    BJ_STAFF_LINE_GROUP_ID?: string;
    BJ_STAFF_REPORT_USER_IDS?: string;
    BJ_WASH_BOT_ENABLED?: string;
    BJ_REWARDS_ENABLED?: string;
    BJ_OWNER_ID?: string;
    BJ_ADMIN_EMAIL?: string;
    BJ_LEGACY_OWNER_ID?: string;
    BJ_REGISTRATION_NOTIFY_USER_ID?: string;
    OPENAI_API_KEY?: string;
    BJ_PLATE_MODEL?: string;
    LINE_CHANNEL_ACCESS_TOKEN?: string;
    LINE_CHANNEL_SECRET?: string;
    LINE_LOGIN_CHANNEL_ID?: string;
    LINE_LIFF_ID?: string;
  }
}
