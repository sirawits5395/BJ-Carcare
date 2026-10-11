# Internal LINE wash bot + CRM rewards (DRAFT)

## Architecture
Two independent Messaging API channels / LINE Official Accounts:
1. Customer OA \`@bjcarcare\` keeps its existing webhook \`/api/line/webhook\` and is used only for customer-facing registration and notices.
2. Staff-only OA joins the existing LINE staff group and uses \`/api/line/staff-webhook\`. It **does not send messages** to the group by default. Photos and staff Reply text arrive as inbound webhook events.
3. Both are handled by the BJ CARCARE app and D1/R2 storage, but the two LINE channel credentials are never shared.

Incoming LINE photos are saved privately to R2. AI recognition is optional and never taken as proof of identity alone. A high-confidence plate + province must uniquely match a **verified reward member**. A verified reward member is enrolled from an existing approved CRM service registration by an authorized owner. Uncertain matches are held for human review.

## Rewards rules (draft defaults; owner must approve before enabling)
- One confirmed, closed **wash** job awards \`points_per_wash\` (default 10).
- A paid wash Reply containing just a price (e.g. \`450\`) means transfer, \`สด450\` or \`เงินสด 450\` means cash.
- Promo purchase \`699\`, \`999\`, \`1999\`, VIP package purchase, window tinting, coating maintenance/full coating, seat/carpet service, headlight polishing and ozone alone do not award wash points.
- Free wash is **excluded** from points until the entitlement policy is confirmed.
- No award for photos alone, unidentified registrations, ambiguous OCR or Reply-less jobs.
- One \`wash_jobs.image_id\` can have only one points award. Replies to original photo or a previous Reply update the same job; a correction cannot issue a second award.
- Policy and staff bot are initially disabled. Changing reward amount applies prospectively; existing awards retain recorded value.
- Excluding an awarded job makes a reversing negative audit entry (not deletion). Switching to a different member after an award requires a controlled correction workflow.
- For registered vehicles, only **owner-approved CRM records** can be enrolled for rewards.
- Receipt and service data come from LINE staff messages, NOT inferred from photo. No unverified OCR can create a customer identity.
- The staff bot currently does **not** enforce promo free-wash 7-day entitlement. This must be added before awarding free-wash points, which remain disabled.
- Records from the pre-bot group history will **not** be imported automatically.

## Before any real-world enabling
1. Review and run \`migrations/20261011_wash_rewards.sql\` against the correct D1 database in a backup/staging environment first. This standalone migration is not applied automatically by the existing Drizzle scripts.
2. Deploy this code to a staging Worker before production. Run \`npm run build\`, \`npm run lint\`, relevant automated tests, and test webhook signature verification, duplicate deliveries, OCR review and corrections.
3. Create a **new** LINE Official Account with Messaging API for staff. Configure \`BJ_STAFF_LINE_CHANNEL_SECRET\` and \`BJ_STAFF_LINE_CHANNEL_ACCESS_TOKEN\` as server-only secrets, and \`BJ_STAFF_LINE_GROUP_ID\` as a server-side setting. Do not reuse the public customer's \`LINE_CHANNEL_SECRET\` or access token.
4. Set \`BJ_OWNER_ID\` to the actual authenticated CRM owner ID already configured. Set the staff Messaging API webhook URL to \`https://<CRM HOST>/api/line/staff-webhook\` and enable group-chat participation, then add the staff OA to the authorized group.
5. Optional AI vehicle recognition requires server-only \`OPENAI_API_KEY\` and optionally \`BJ_PLATE_MODEL\` (defaults to \`gpt-4.1-mini\`). Review image privacy notice and retention. Processing photos via external AI API has separate usage costs.
6. Leave \`BJ_WASH_BOT_ENABLED\` unset or \`false\` until a team-only test is successful. In the CRM's Rewards tab, enroll already-approved records and later enable policy after testing.
7. For high-volume production, move AI processing and events to a durable Cloudflare Queue with retries and dead-letter handling. Synchronous photo processing in a webhook is **not yet considered production reliable**: network delays can exceed webhook timeouts; races or missing events must be handled.
8. Implement the 7-day free wash entitlement check, points redemption, role-specific staff access, image retention/purge, duplicate plate ownership resolution, account merging, member deactivation/correction, ledger atomicity and daily reconciliation before production.
9. Set appropriate staff access and consent policy, and monitor quota/costs. This design intentionally sends **zero automated group messages**.

## Data and operations
- \`reward_members\`: separate loyalty enrollment referencing original \`records.id\`. One active member record per normalized plate + province + owner, NOT proof the plate's current owner.
- \`reward_policies\`: one policy per owner; default disabled.
- \`wash_jobs\`: photo, recognition and payment status, keyed by LINE image message ID.
- \`line_job_replies\`: maps each staff Reply message ID to a job ID for chained edits.
- \`reward_awards\`: active/void state and points for a unique job ID.
- \`reward_audit\`: record of additions and reversals; always compare with \`reward_awards\` totals.
- Owner-only \`GET/POST /api/rewards\`, owner-only \`GET /api/rewards/photo\`.
- Customer-facing \`@bjcarcare\` credentials and existing customer webhook are unchanged.

This feature is on a development branch / draft PR, not live.
