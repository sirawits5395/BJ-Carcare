# BJ Carcare payment QR + non-VAT receipt visual handoff

## Scope and safety
This branch prepares a scannable payment card and a **non-VAT receipt image renderer** in the **GitHub source**, without modifying any existing booking, membership, promotion, or slip upload code.
It **does not update** the currently deployed ChatGPT Sites app at `bj-carcare-service.bjprogroup.chatgpt.site`.
The user-provided live LIFF screen displays a **promotion payment panel** which is **not present in this branch's current `app/register/page.tsx`**. Locate and synchronize the actual live Sites source before wiring these assets into a screen. Do not create a duplicate registration/payment form.

## Added assets
- `public/payment-qr-bj.svg`: vector payment card, white/gold. Its QR module pattern was derived from the source bank QR image provided by the owner, decoded as:
  `00020101021130610016A00000067701011201150115566011607230210BJPROGROUP0304REF253037645802TH621207082400594363040713`.
  Bank information on the card: Bank of Ayudhya, account 5311584818, branch Siam Paragon, account name บจก. บีเจ โปร กรุ๊ป. Verify beneficiary **in a mobile banking scan** before production.
- `lib/receipt-template.ts`: `createReceiptSvg` and `receiptSvgToPng`, styling based on the owner's green receipt design.
- `verify-receipt-template.mjs`: checks non-VAT title, totals, XML escaping and internal verification flag.

## Actual integration (to do only in the deployed Sites codebase)
1. Identify where the existing customer payment panel renders the original QR. Replace **only its image source** with `/payment-qr-bj.svg`. Preserve full-size and download actions, existing form/receipt fields, slip upload, staff review, and payment method selection.
2. Confirm the selected green receipt design and company details. Receipt no., customer name, real services, actual amount, payment method, date and reference must come from server-side **owner-verified** payment records, not customer inputs or static mockup text.
3. Issue an immutable unique receipt number per verified payment with server-controlled authorization, audit trail, void/correction references, and protected R2 storage for PNG/PDF. The current renderer itself **does not implement issuance or storage**. Never issue based only on a form, uploaded slip, or a staff LINE message.
4. Do not calculate or show VAT 7%. The customer-facing document must be 'ใบเสร็จรับเงิน' with 'ไม่ใช่ใบกำกับภาษี'; this is **not** a certified RD e-Tax/e-Receipt.
5. Test authentic bank scans, actual LINE LIFF payment steps on iPhone, image downloads, multiple items, wrong amount, cash without slip, transfer with slip, same-plate collisions, and duplicate-issuance prevention on **staging** before a controlled deployment. Back up data and do not point production LINE webhooks at staging.

## Validation
The source QR image and earlier gold mockup were decoded successfully and yielded identical data. The new SVG is a QR-module-preserving vector reconstruction from that decoded payload.
No actual bank transfer has been made, no payment has been verified, the new SVG has not been scanned in a banking app here, and no deployed-site regression/build tests have been executed.
