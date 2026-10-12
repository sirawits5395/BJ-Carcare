# BJ Carcare counting-only launch

This mode records staff-group car photo events and classifies a staff reply to a photo into a service and cash/transfer amount. It is for the first live vehicle/revenue report only; rewards stay disabled.

## Data behavior

- One photo message represents one car visit. Send one primary photo per car during this phase; additional photo messages count as additional visits.
- Staff should reply directly to that photo with a clear amount, for example `450` for transfer or `สด450` for cash. A correction sent as a newer reply updates the same job rather than adding a second sale.
- A determinate amount closes the job for revenue reporting even when the plate/member has not yet been matched. Unclear replies remain in review.
- The counting-only path does not download or retain the photo, run plate OCR, issue points, create free-wash entitlements, or send group messages. A LINE summary command needs the staff access token; the owner can view the daily report in the CRM meanwhile.

## Owner-only schema migration

`POST /api/admin/wash-migration` executes only the checked-in idempotent schema, after same-origin and owner checks. It accepts no SQL from the caller. It creates the counting tables and reward tables with their defaults disabled, records a migration marker, and verifies the expected tables. The live D1 snapshot must be saved and checked before calling this endpoint.

## Required runtime settings

- `BJ_STAFF_LINE_CHANNEL_ID=2008901990`
- `BJ_STAFF_LINE_CHANNEL_SECRET` as a secret
- `BJ_STAFF_LINE_GROUP_ID` as the allowlisted staff group
- `BJ_WASH_COUNT_ONLY=true`
- `BJ_REWARDS_ENABLED=false`
- `BJ_WASH_BOT_ENABLED=false` until the migration and channel/group checks pass; then enable for the approved staff group only

For this phase, a staff access token and queue are optional. Without the access token, inbound events are still signature-checked and recorded, while LINE summary replies remain unavailable. Do not reuse the customer OA credentials.
