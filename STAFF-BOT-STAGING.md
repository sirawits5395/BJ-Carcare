# BJ Carcare LINE staff bot and rewards staging

This is an implementation and staging checklist for Draft PR #5. It does not authorize changes to the live `@bjcarcare` webhook, production D1/R2 data, or customer messaging.

## What this branch adds

- A separate signed staff webhook at `/api/line/staff-webhook`; image events are accepted only from the configured staff group and processed by the `BJ_WASH_QUEUE` durable queue.
- Staff replies are associated with their original photo (including replies to earlier correction messages). Uncertain categories, payment amounts, or plates stay in review. Image-byte duplicates remain visible as review items but cannot be paired or awarded.
- Owner-only CRM controls to match a verified member vehicle, correct service/payment/amount, exclude a job, restore an excluded non-duplicate job, verify actual payment, and see an audit trail. Staff replies alone do not award points or create a promo entitlement; the owner must verify the payment first. Award changes use a unique job award and append-only point ledger entries.
- Asia/Bangkok daily totals distinguish arrival date from close date. Only closed jobs count as sales. A LINE report command uses the Reply API and redelivery IDs.
- Promo sales of exactly 699, 999, or 1,999 baht create one free-wash entitlement per sale, valid for seven days. A free-wash job remains in review without a currently valid entitlement. Free washes do not earn points by default.
- The customer OA webhook remains separate. A customer image in a direct chat can receive a single-use, 24-hour LIFF claim link with LINE Login. The customer supplies plate and province; the owner must verify the bank receipt and link the claim to a paid, closed wash job. The image alone never confirms payment or grants points.

## Staging resources and secrets

Create a separate staging Worker, D1 database, R2 bucket, and Cloudflare Queue plus dead-letter queue. Configure the queue producer binding `BJ_WASH_QUEUE` to `bj-carcare-wash-images-staging`, and a consumer for that queue with five retries and `bj-carcare-wash-images-staging-dlq` as its dead-letter queue. The Vite local configuration declares the same names for local preview; it does not create production Cloudflare resources.

Apply `migrations/20261011_wash_rewards.sql` to the empty staging D1 database before turning on the staff bot. Keep the feature flag off until the migration, bucket, queue, and secrets are ready.

Configure these as Cloudflare Worker secrets/variables, never as source code or committed `.dev.vars`:

| Setting | Purpose |
| --- | --- |
| `BJ_STAFF_LINE_CHANNEL_ID` | Expected `2008901990`; `/api/line/staff-status` verifies the supplied staff token against LINE and checks `@445qplae` / `BJ Carcare AI`. |
| `BJ_STAFF_LINE_CHANNEL_SECRET` | Signature verification for the staff OA only. |
| `BJ_STAFF_LINE_CHANNEL_ACCESS_TOKEN` | Staff group image retrieval and Reply API reports only. |
| `BJ_STAFF_LINE_GROUP_ID` | Exact staging staff-group allowlist; do not use the production group for first tests. |
| `BJ_STAFF_REPORT_USER_IDS` | Optional comma-separated LINE user IDs allowed to request sales totals; without it, any member of the allowlisted group can request them. |
| `BJ_WASH_BOT_ENABLED` | Keep `false` until staging checks pass; then enable for a controlled test group. |
| `BJ_OWNER_ID`, `BJ_ADMIN_EMAIL` | Owner-scoped D1 records and CRM access in the staging app. |
| `OPENAI_API_KEY`, `BJ_PLATE_MODEL` | Optional plate/vehicle recognition; missing or uncertain recognition sends the job to review. |
| `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` | Existing customer OA `@bjcarcare` only. These are separate from all staff OA credentials. |
| `LINE_LOGIN_CHANNEL_ID`, `LINE_LIFF_ID` | Customer LINE Login and the staging LIFF claim route. Use the matching staging endpoint. |

`/api/line/staff-status` reports configured and verified account state without returning secrets. A channel ID entered in a variable is not proof of account ownership; only a successful token verification and matching Bot Info checks are.

## Staging verification sequence

1. Confirm the staging D1/R2 bindings and apply the migration. Confirm that the staff Queue producer, consumer, and DLQ exist and are bound to the staging Worker.
2. Enter secrets in Cloudflare's secret store. Leave `BJ_WASH_BOT_ENABLED=false` until the separate staging group and staff OA are verified.
3. Configure staff OA `@445qplae` to use `https://<staging-host>/api/line/staff-webhook`, enable group participation, and invite it to the staging staff group. Verify the webhook signature and the `2008901990` / `@445qplae` identity in the owner-only status view.
4. Use test vehicles and records in staging only. Exercise image analysis, multiple photos, exact duplicate images, a reply to an image, a correction reply (`450` then `สด450`), all Thai service/payment phrases, redelivered webhook events, and `สรุปยอด`, `#ยอดวันนี้`, yesterday, and an explicit date.
5. Verify no points are issued for a staff reply before owner payment verification, an unknown/duplicate job, a promo sale, a free wash without an active entitlement, an unapproved vehicle, or an unpaid/uncertain job. Verify one award after a paid closed member wash is owner-verified, reversal on exclusion, and no second award on retries.
6. For the customer flow, use a dedicated staging customer identity/channel and LIFF endpoint. Send a test image, check the Reply API link, authenticate as the same LINE user, submit plate/province once, confirm the second submission is rejected, and have the owner match it against bank evidence and the paid wash job before awarding.
7. Review LINE usage/quota and Cloudflare Queue/D1/R2 and AI usage after the test. Do not route the production customer OA or existing employee group to staging without a separately approved cutover.

## Limits still requiring owner/Cloudflare setup

- No staging Cloudflare resources, channel secrets/access tokens, staff Group ID, or staging LIFF ID are available in this repository checkout. Therefore the channel identity check, webhook signature test with the real OA, group event test, reply delivery, quota read, and staging deployment have not been executed here.
- The customer LIFF login uses the existing configured LINE Login channel. A staging owner must create/configure a dedicated test LIFF endpoint and confirm its login channel matches the customer OA provider before testing.
- Automated bank verification and importing historical balances from LINE Reward Card are intentionally not implemented; an owner must verify payment in the bank and handle any historical point migration with evidence.
- The endpoint replies with a claim link after receiving a customer image; if LINE expires the reply token before the reply call succeeds, the pending claim remains visible in the owner CRM and the customer may need to resend the image. The normal path uses Reply API and does not use a group push.
- The existing repository-wide lint has unrelated legacy `any` errors outside this change. Changed integration files pass ESLint except image-delivery warnings for protected CRM photo endpoints.
