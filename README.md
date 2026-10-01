# BJ Carcare — implementation handoff

Current release is owner-private, with no LINE delivery or public customer registration enabled.

Confirmed rules:
- Ceramic 1Y: checks at months 3, 6, 9, 12. No Recoat.
- Ceramic 2Y: checks every 3 months through 24; month 12 is major maintenance + Recoat.
- Ceramic 3Y: checks every 3 months through 36; months 12 and 24 are major maintenance + Recoat.
- Recoat replaces the normal reminder at that milestone, not a second message.
- Seat and carpet cleaning are independent multi-select services. No recurring interval was specified.
- Staff review evidence and choose the ceramic package and actual service date.
- LINE OA supplied by user: @bjcarcare.

Provisional assumption: all quarterly milestones are anchored to the original ceramic service date, clamped to the end of the target month. User has not yet answered this policy question.

Implemented: authenticated owner-scoped D1 records, R2 evidence images, pending approval, package selection, generated visits, completion dates, message previews, package simulator, search by name/phone/plate. A record represents one service registration; customer and vehicle entities are not yet normalized into separate tables. Multiple vehicles and repeat registrations can be stored, but automatic deduplication/customer linking is not yet implemented.

Still required before production customer rollout:
1. Confirm a supported public LINE Login/LIFF hosting and authorization path. Do not make this owner dashboard public. Public customer endpoints must be separate and authorize using verified LINE ID tokens. Keep employee endpoints under explicit employee authorization.
2. Configure LINE Login and Messaging API channels under the same provider, link @bjcarcare, configure LIFF endpoint, and obtain channel IDs and runtime secrets through secure settings (never browser source or chat).
3. Add verified LINE identity, friendship status, notification preference update, webhook signature verification and follow/unfollow processing.
4. Add customer/vehicle/service normalization and record matching before importing existing customers. Do not identify a person solely by license plate or unverified phone.
5. Confirm reminder lead time and the baseline date policy. Implement a durable outbox with unique service/milestone/reminder-kind keys, retry IDs, quota/error handling, no-message preference, and cancellation of completed milestones. Do not claim HTTP 200 means delivered/read.
6. Configure a daily scheduler in Asia/Bangkok only after an authenticated dispatch endpoint and LINE test account are ready. No scheduler or messaging side effect exists in this release.
7. Confirm privacy notice, staff permissions, evidence retention, corrections and backups, then test registration-to-delivery using team accounts.

Validation: TypeScript, production build, rules tests including leap years/end-of-month, local API integration with synthetic data: upload/read-back, approval, duplicate approval rejection, visits, completion, unauthorized evidence denial, cross-origin mutation rejection. Production database starts empty. Local QA records stay in ignored .wrangler state and are not deployed.
